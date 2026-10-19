import { basename, dirname, join, resolve } from "node:path"
import { runOpencodeShell, type OpencodeClient } from "@/lib/ai/opencode-client"
import type { AgentResult, EnvironmentSettings, RepoConfigInput } from "../schemas"
import { redact, type EnvironmentFailureCode } from "../logic"
import { buildAccessFiles, type AccessScope } from "./credentials"

/**
 * Toda interação **determinística** do módulo com o host passa pelo shell do OpenCode
 * (`client.shell`), que executa na máquina do OpenCode — o servidor do Opex pode estar em container
 * e não compartilha filesystem com ele. Aqui ficam: gravar/remover o acesso temporário, ler o
 * Compose efetivo, containers e imagens, e montar o comando de logs. Publicar e restaurar continuam
 * com o agente (operações complexas). Nenhum comando aqui é montado com texto de terceiros sem
 * `shellQuote`.
 */

export class HostError extends Error {
    constructor(
        readonly code: EnvironmentFailureCode,
        message: string,
    ) {
        super(message)
        this.name = "HostError"
    }
}

/** Aspas simples de shell, à prova de injeção. */
export function shellQuote(value: string): string {
    return `'${value.replace(/'/g, "'\\''")}'`
}

const ACCESS_NAME = /^(operation|logs|probe)-[A-Za-z0-9_-]+$/

/** Diretório do acesso no host do OpenCode: `<accessDirectory>/<prefixo>-<id>`. */
export function accessDirectoryFor(settings: Pick<EnvironmentSettings, "accessDirectory">, prefix: string, id: string) {
    return join(resolve(settings.accessDirectory), `${prefix}-${id}`)
}

function assertAccessScope(settings: Pick<EnvironmentSettings, "accessDirectory">, dir: string) {
    const target = resolve(dir)
    if (dirname(target) !== resolve(settings.accessDirectory) || !ACCESS_NAME.test(basename(target)))
        throw new HostError("ACCESS_WRITE_FAILED", "Acesso temporário fora do escopo")
}

async function shell(
    client: OpencodeClient,
    settings: Pick<EnvironmentSettings, "sessionDirectory">,
    command: string,
    options: { timeoutMs?: number; signal?: AbortSignal; outputLimit?: number } = {},
) {
    try {
        return await runOpencodeShell(client, settings.sessionDirectory, command, options)
    } catch {
        throw new HostError(
            "HOST_UNREACHABLE",
            "O OpenCode não executou o comando no host. Confira a integração do OpenCode e o diretório administrativo.",
        )
    }
}

/** Script do host: lê o pacote (base64 pelo stdin, fora dos argumentos) e grava os arquivos 0600/0700. */
const WRITE_SCRIPT = [
    "const fs=require('fs'),p=require('path');const dir=process.argv[1];let s='';",
    "process.stdin.setEncoding('utf8');process.stdin.on('data',d=>s+=d).on('end',()=>{",
    "const files=JSON.parse(Buffer.from(s,'base64').toString('utf8'));",
    "fs.mkdirSync(dir,{recursive:true,mode:0o700});const st=fs.lstatSync(dir);",
    "if(st.isSymbolicLink()||!st.isDirectory())process.exit(3);fs.chmodSync(dir,0o700);",
    "for(const n of Object.keys(files)){const t=p.join(dir,n);fs.writeFileSync(t,files[n].c,{mode:files[n].m});fs.chmodSync(t,files[n].m)}",
    "fs.writeFileSync(p.join(dir,'ready'),'',{mode:0o600});process.stdout.write('OPEX_ACCESS_OK')})",
].join("")

/** Comando que grava o acesso no host. O conteúdo vai pelo stdin (`printf` é builtin: não aparece no `ps`). */
export function writeAccessCommand(dir: string, files: Record<string, { content: string; mode: number }>): string {
    const payload = Buffer.from(
        JSON.stringify(Object.fromEntries(Object.entries(files).map(([name, file]) => [name, { c: file.content, m: file.mode }]))),
        "utf8",
    ).toString("base64")
    return `umask 077 && printf '%s' ${shellQuote(payload)} | node -e ${shellQuote(WRITE_SCRIPT)} ${shellQuote(dir)}`
}

/** Grava o acesso temporário no host do OpenCode e devolve os valores secretos para censura. */
export async function writeAccess(
    client: OpencodeClient,
    settings: EnvironmentSettings,
    scope: AccessScope,
    dir: string,
): Promise<{ secretValues: string[] }> {
    assertAccessScope(settings, dir)
    const { files, secretValues } = await buildAccessFiles(scope, dir)
    const result = await shell(client, settings, writeAccessCommand(dir, files), { timeoutMs: 30_000 })
    if (result.exitCode !== 0 || !result.output.includes("OPEX_ACCESS_OK"))
        throw new HostError(
            "ACCESS_WRITE_FAILED",
            "Não foi possível gravar o acesso temporário no host do OpenCode. Confira o diretório de acesso e as permissões.",
        )
    return { secretValues }
}

/** O acesso gravado ainda existe no host (retomada de sessão)? */
export async function hasAccess(client: OpencodeClient, settings: EnvironmentSettings, dir: string): Promise<boolean> {
    assertAccessScope(settings, dir)
    const result = await shell(client, settings, `test -f ${shellQuote(`${dir}/ready`)}`, { timeoutMs: 15_000 })
    return result.exitCode === 0
}

/** Remove o acesso do host (conclusão, falha, interrupção ou reconciliação). */
export async function removeAccess(client: OpencodeClient, settings: EnvironmentSettings, dir: string): Promise<void> {
    assertAccessScope(settings, dir)
    const result = await shell(client, settings, `rm -rf -- ${shellQuote(dir)}`, { timeoutMs: 30_000 })
    if (result.exitCode !== 0) throw new HostError("HOST_COMMAND_FAILED", "Não foi possível remover o acesso temporário do host")
}

/** Onde e como executar no host do ambiente (local: host do OpenCode; remoto: pelo helper SSH). */
export interface HostTarget {
    mode: RepoConfigInput["mode"]
    directory: string
    composeFile: string
    project: string
    /** Diretório do acesso (helper SSH) — obrigatório no modo remoto. */
    accessDir: string | null
}

/**
 * Comando final: `cd` no diretório do ambiente, localmente ou pelo helper SSH. Sempre em `sh -c`:
 * o shell do usuário do OpenCode (ou do host remoto) pode ser zsh, que não separa `$args` em palavras.
 */
export function hostCommand(target: HostTarget, inner: string): string {
    const local = `sh -c ${shellQuote(`cd ${shellQuote(target.directory)} 2>/dev/null || exit 3; ${inner}`)}`
    if (target.mode !== "remote") return local
    if (!target.accessDir) throw new HostError("ACCESS_WRITE_FAILED", "Acesso remoto sem helper SSH gravado")
    return `node ${shellQuote(`${target.accessDir}/ssh.cjs`)} ${shellQuote(local)}`
}

/** Comando de logs contínuos de todos os serviços do projeto Compose. */
export function logsCommand(target: HostTarget): string {
    return hostCommand(
        target,
        `docker compose -p ${shellQuote(target.project)} logs -f --no-color --timestamps --since=30s`,
    )
}

/** Script de leitura (sh puro: roda também no host remoto, sem node/jq). Seções marcadas por `@@`. */
export function inspectScript(project: string, composeFile: string): string {
    const p = shellQuote(project)
    const label = shellQuote(`label=com.docker.compose.project=${project}`)
    return [
        `files=$(docker ps -a --filter ${label} --format '{{.Label "com.docker.compose.project.config_files"}}' | head -n 1)`,
        `if [ -n "$files" ]; then args=""; OLDIFS=$IFS; IFS=','; for f in $files; do args="$args -f $f"; done; IFS=$OLDIFS; else test -f ${shellQuote(composeFile)} || exit 4; args="-f ${composeFile.replace(/[^\w./-]/g, "")}"; fi`,
        "echo @@CONFIG",
        `docker compose -p ${p} $args config --format json || exit 5`,
        "echo; echo @@PS",
        `docker ps -a --filter ${label} --format '{{.Label "com.docker.compose.service"}}|{{.ID}}|{{.State}}|{{.Status}}'`,
        "echo @@IMAGES",
        `ids=$(docker ps -aq --filter ${label})`,
        `if [ -n "$ids" ]; then docker inspect --format '{{index .Config.Labels "com.docker.compose.service"}}|{{.Image}}' $ids; fi`,
        "echo @@META",
        // Sem `.Config.Labels`: em imagens sem labels o Docker recusa o template inteiro.
        `if [ -n "$ids" ]; then docker image inspect --format '{{.Id}}|{{.Created}}|{{join .RepoTags ","}}' $(docker inspect --format '{{.Image}}' $ids | sort -u); fi`,
        "echo @@BUSY",
        // Processos de compose/build ainda rodando NESTE projeto (exclui o próprio shell e os logs).
        `ps -eo args 2>/dev/null | grep -E '(docker[ -]compose|cli-plugins/docker-compose|docker( buildx)? build)' | grep -F -- ${p} | grep -vE '^(/[^ ]*/)?(ba|da|z)?sh ' | grep -vE ' logs( |$)' | grep -v grep | wc -l`,
        "echo @@END",
    ].join("\n")
}

export interface HostContainer {
    service: string
    id: string
    state: string
    health: "healthy" | "unhealthy" | "starting" | null
}

export interface HostInspection {
    compose: AgentResult["compose"]
    images: AgentResult["images"]
    containers: HostContainer[]
    healthy: boolean
    quiescent: boolean
    evidence: string[]
}

function section(output: string, name: string): string {
    const start = output.indexOf(`@@${name}`)
    if (start < 0) return ""
    const rest = output.slice(start + name.length + 2)
    const end = rest.search(/@@[A-Z]+/)
    return (end < 0 ? rest : rest.slice(0, end)).trim()
}

const lines = (text: string) =>
    text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)

function portLabel(port: unknown): string {
    if (typeof port === "string" || typeof port === "number") return String(port)
    if (!port || typeof port !== "object") return ""
    const value = port as { published?: unknown; target?: unknown; protocol?: unknown }
    const base = value.published ? `${String(value.published)}:${String(value.target)}` : String(value.target ?? "")
    return value.protocol && value.protocol !== "tcp" ? `${base}/${String(value.protocol)}` : base
}

function volumeLabel(volume: unknown): string {
    if (typeof volume === "string") return volume
    if (!volume || typeof volume !== "object") return ""
    const value = volume as { source?: unknown; target?: unknown }
    return value.source ? `${String(value.source)}:${String(value.target ?? "")}` : String(value.target ?? "")
}

function healthOf(status: string): HostContainer["health"] {
    if (/\(healthy\)/.test(status)) return "healthy"
    if (/\(unhealthy\)/.test(status)) return "unhealthy"
    if (/health: starting/.test(status)) return "starting"
    return null
}

function isoOrNull(value: string | undefined): string | null {
    if (!value) return null
    const time = Date.parse(value)
    return Number.isNaN(time) ? null : new Date(time).toISOString()
}

/**
 * Interpreta a saída do script de leitura. Do Compose ficam só serviço, imagem, portas, volumes e os
 * **nomes** das variáveis — valores nunca saem daqui. Textos passam por `redact`.
 */
export function parseInspection(output: string, secrets: string[] = []): HostInspection {
    let config: { services?: Record<string, Record<string, unknown>> } = {}
    try {
        config = JSON.parse(section(output, "CONFIG")) as typeof config
    } catch {
        throw new HostError("HOST_COMMAND_FAILED", "O host não devolveu o Compose efetivo em JSON")
    }
    const safe = (text: string) => redact(text, secrets)
    const compose = Object.entries(config.services ?? {}).map(([service, definition]) => {
        const environment = definition.environment
        const variables = Array.isArray(environment)
            ? environment.map((item) => String(item).split("=")[0])
            : Object.keys((environment as Record<string, unknown> | undefined) ?? {})
        return {
            service,
            image: safe(String(definition.image ?? "")).slice(0, 300),
            ports: ((definition.ports as unknown[] | undefined) ?? []).map(portLabel).filter(Boolean).map(safe),
            volumes: ((definition.volumes as unknown[] | undefined) ?? []).map(volumeLabel).filter(Boolean).map(safe),
            variables: variables.filter(Boolean).sort(),
        }
    })
    const containers: HostContainer[] = lines(section(output, "PS")).map((line) => {
        const [service = "", id = "", state = "", status = ""] = line.split("|")
        return { service, id, state, health: healthOf(status) }
    })
    const meta = new Map(
        lines(section(output, "META")).map((line) => {
            const [id = "", created, tags = "", version = ""] = line.split("|")
            const tag = tags.split(",").find((item) => item && item !== "<none>:<none>") ?? ""
            const cleanVersion = version && version !== "<no value>" ? version : tag.includes(":") ? tag.split(":").pop()! : ""
            return [id, { builtAt: isoOrNull(created), tag, version: cleanVersion }] as const
        }),
    )
    const seen = new Set<string>()
    const images: AgentResult["images"] = []
    for (const line of lines(section(output, "IMAGES"))) {
        const [service = "", imageId = ""] = line.split("|")
        if (!service || seen.has(service) || !/^sha256:[a-f0-9]{64}$/.test(imageId)) continue
        seen.add(service)
        const info = meta.get(imageId)
        images.push({
            service,
            imageId,
            tag: safe(info?.tag ?? "").slice(0, 300),
            version: safe(info?.version ?? "").slice(0, 200),
            builtAt: info?.builtAt ?? null,
        })
    }
    const busy = Number.parseInt(section(output, "BUSY"), 10) || 0
    const healthy =
        containers.length > 0 &&
        containers.every((item) => item.state === "running" && (item.health === null || item.health === "healthy"))
    const evidence = [
        `Compose efetivo lido no host: ${compose.length} serviço(s) (${compose.map((item) => item.service).join(", ") || "nenhum"}).`,
        containers.length
            ? `Containers do projeto: ${containers.map((item) => `${item.service} ${item.state}${item.health ? ` (${item.health})` : ""}`).join(", ")}.`
            : "Nenhum container do projeto encontrado no host.",
        ...images.map((image) => `Imagem de ${image.service}: ${image.imageId.slice(0, 19)}…${image.tag ? ` (${image.tag})` : ""}.`),
        ...(busy > 0 ? [`${busy} processo(s) de compose/build ainda em execução neste projeto.`] : []),
    ]
    return { compose, images, containers, healthy, quiescent: busy === 0, evidence }
}

/** Lê o Compose efetivo (com overrides), containers e imagens do projeto no host. */
export async function inspectHost(
    client: OpencodeClient,
    settings: EnvironmentSettings,
    target: HostTarget,
    secrets: string[] = [],
    signal?: AbortSignal,
): Promise<HostInspection> {
    const result = await shell(client, settings, hostCommand(target, inspectScript(target.project, target.composeFile)), {
        timeoutMs: 120_000,
        outputLimit: 1_000_000,
        signal,
    })
    if (result.exitCode === 3 || result.exitCode === 4)
        throw new HostError(
            "COMPOSE_NOT_FOUND",
            `Diretório ${target.directory} ou arquivo ${target.composeFile} não encontrado no host.`,
        )
    if (result.exitCode === 124) throw new HostError("ACCESS_WRITE_FAILED", "O acesso remoto expirou")
    if (result.exitCode !== 0 || !result.output.includes("@@END"))
        throw new HostError(
            "HOST_COMMAND_FAILED",
            result.exitCode === 5
                ? "O Docker Compose recusou a configuração do projeto no host."
                : target.mode === "remote" && result.exitCode === 255
                  ? "Não foi possível conectar ao host remoto por SSH."
                  : "Não foi possível ler o estado do Docker no host.",
        )
    return parseInspection(result.output, secrets)
}

export interface HostProbeCheck {
    name: string
    ok: boolean
    detail: string
}

/** Teste de acesso ao host (sem modelo): grava/lê/remove um acesso de teste e confere o Docker. */
export async function probeHost(
    client: OpencodeClient,
    settings: EnvironmentSettings,
    id: string,
): Promise<{ ok: boolean; checks: HostProbeCheck[] }> {
    const checks: HostProbeCheck[] = []
    const dir = accessDirectoryFor(settings, "probe", id)
    try {
        // Mesmo caminho de gravação das operações, com um arquivo de teste (sem credenciais).
        const written = await shell(
            client,
            settings,
            writeAccessCommand(dir, { "probe.txt": { content: "opex", mode: 0o600 } }),
            { timeoutMs: 30_000 },
        )
        if (written.exitCode !== 0 || !written.output.includes("OPEX_ACCESS_OK"))
            throw new HostError("ACCESS_WRITE_FAILED", `Não foi possível gravar em ${dir}: confira o diretório de acesso e as permissões.`)
        const readable = await hasAccess(client, settings, dir)
        checks.push({
            name: "Diretório de acesso",
            ok: readable,
            detail: readable ? `Gravado e lido em ${dir} (0700).` : `Gravado, mas não encontrado em ${dir}.`,
        })
    } catch (error) {
        checks.push({ name: "Diretório de acesso", ok: false, detail: error instanceof Error ? error.message : "Falha" })
        if (error instanceof HostError && error.code === "HOST_UNREACHABLE") return { ok: false, checks }
    }
    const docker = await shell(client, settings, "docker version --format '{{.Server.Version}}'", { timeoutMs: 20_000 })
    checks.push({
        name: "Docker",
        ok: docker.exitCode === 0,
        detail: docker.exitCode === 0 ? `Servidor ${docker.output.split("\n").pop()}` : "Docker indisponível para o usuário do OpenCode.",
    })
    const compose = await shell(client, settings, "docker compose version --short", { timeoutMs: 20_000 })
    checks.push({
        name: "Docker Compose",
        ok: compose.exitCode === 0,
        detail: compose.exitCode === 0 ? `Versão ${compose.output.split("\n").pop()}` : "Plugin docker compose não encontrado.",
    })
    await removeAccess(client, settings, dir).catch(() => undefined)
    return { ok: checks.every((check) => check.ok), checks }
}
