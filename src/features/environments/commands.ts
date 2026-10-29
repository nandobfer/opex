import { posix } from "node:path"
import { cancelForwardCommand, cancelReverseForwardCommand, forwardPortCommand, muxCommand, quote, reverseForwardCommand } from "@/features/local-docker/commands"
import { COMPOSE_LABELS, ENV_FILE, OVERRIDE_FILE, REGISTRY_CONTAINER, REGISTRY_IMAGE, REGISTRY_NAMESPACE } from "./constants"
import type { EnvironmentsSettings, Machine } from "./schemas"

/**
 * Comandos (puros) do módulo Ambientes. Rodam no host do OpenCode; o Docker do PC é alcançado pelo
 * contexto do Builder Machine (`DOCKER_CONTEXT`) e a pasta de um projeto adotado no PC, pela conexão
 * mestra (`muxCommand`). Todo valor variável vem de schema validado ou passa por `quote`.
 */

/** Onde o comando roda e com qual Docker. */
export interface DockerTarget {
    /** Máquina do daemon. */
    machine: Machine
    /** Contexto do Docker do PC no host (Builder Machine). */
    context: string
    /** Builder do buildx do PC (build no PC). */
    builder: string
}

/** Pasta e arquivos do compose de um ambiente. */
export interface ComposePlan {
    projectName: string
    /** Pasta (já pronta para o shell: entre aspas ou com `$HOME`). */
    dir: string
    /** Onde estão os arquivos: `server` (host do OpenCode) ou `pc` (projeto adotado do PC). */
    filesOn: Machine
    composeFiles: string[]
    services: string[]
}

/** Pasta de um ambiente de central no servidor. */
export const envDir = (settings: EnvironmentsSettings, slug: string) => `"$HOME/${settings.baseDir}/${slug}"`
export const envBase = (settings: EnvironmentsSettings) => `"$HOME/${settings.baseDir}"`

/** `docker` apontando para a máquina certa (vale só para arquivos no servidor). */
function dockerPrefix(target: DockerTarget, build = false): string {
    if (target.machine === "server") return ""
    return `DOCKER_CONTEXT=${target.context} ${build ? `BUILDX_BUILDER=${target.builder} ` : ""}`
}

const ENV_FILES = `$( [ -f .env ] && echo --env-file .env ) $( [ -f ${ENV_FILE} ] && echo --env-file ${ENV_FILE} )`
/** O override só entra quando existe (projeto adotado ainda não implantado pelo app não tem). */
const OVERRIDE_ARG = `$( [ -f ${OVERRIDE_FILE} ] && echo -f ${OVERRIDE_FILE} )`

/** `docker compose` do ambiente com os arquivos dele (e o override gerado, quando pedido). */
export function composeCommand(plan: ComposePlan, target: DockerTarget, args: string, options: { override?: boolean; build?: boolean } = {}): string {
    const files = plan.composeFiles.map((file) => `-f ${quote(file)}`).join(" ")
    const compose = `docker compose -p ${plan.projectName} ${ENV_FILES} ${files}${options.override === false ? "" : ` ${OVERRIDE_ARG}`} ${args}`
    if (plan.filesOn === "pc") return muxCommand(`cd ${plan.dir} && ${compose}`)
    return `cd ${plan.dir} && ${dockerPrefix(target, options.build)}${compose}`
}

const servicesArg = (plan: ComposePlan) => plan.services.map(quote).join(" ")

export const configCommand = (plan: ComposePlan, target: DockerTarget) => composeCommand(plan, target, "config --format json", { override: false })
export const buildCommand = (plan: ComposePlan, target: DockerTarget) => composeCommand(plan, target, `build ${servicesArg(plan)}`.trim(), { build: true })
export const upCommand = (plan: ComposePlan, target: DockerTarget, build: boolean) => composeCommand(plan, target, `up -d ${build ? "--build" : "--no-build"} --remove-orphans ${servicesArg(plan)}`.trim(), { build })
export const pushCommand = (plan: ComposePlan, target: DockerTarget, services: string[]) => composeCommand(plan, target, `push ${services.map(quote).join(" ")}`.trim())
export const pullCommand = (plan: ComposePlan, target: DockerTarget) => composeCommand(plan, target, `pull ${servicesArg(plan)}`.trim())
export const startCommand = (plan: ComposePlan, target: DockerTarget) => composeCommand(plan, target, `up -d --no-build ${servicesArg(plan)}`.trim())
export const downCommand = (plan: ComposePlan, target: DockerTarget, volumes = false) => composeCommand(plan, target, `down --remove-orphans${volumes ? " -v" : ""}`)
export const restartCommand = (plan: ComposePlan, target: DockerTarget) => composeCommand(plan, target, `restart ${servicesArg(plan)}`.trim())
/** Imprime `present` quando todas as imagens existem no Docker da máquina (`missing` senão). */
export function imagesExistCommand(plan: Pick<ComposePlan, "filesOn">, target: DockerTarget, images: string[]): string {
    const inspect = `docker image inspect ${images.map(quote).join(" ")} > /dev/null 2>&1 && echo present || echo missing`
    if (plan.filesOn === "pc") return muxCommand(inspect)
    return `${dockerPrefix(target)}${inspect}`
}

export const logsCommand = (plan: ComposePlan, target: DockerTarget) => composeCommand(plan, target, "logs --tail 200 --no-color")

/** Grava um arquivo na pasta (em base64, sem depender de aspas; o debug mostra só o nome). */
export function writeFileCommand(plan: Pick<ComposePlan, "dir" | "filesOn">, file: string, content: string): string {
    const encoded = Buffer.from(content, "utf8").toString("base64")
    const write = `umask 077 && printf %s ${quote(encoded)} | base64 -d > ${plan.dir}/${file}`
    return plan.filesOn === "pc" ? muxCommand(write) : write
}

/**
 * `.env.opex` (variáveis extras do ambiente). O compose interpola `$` em valores com aspas
 * duplas: `$` vira `$$` para o valor chegar literal ao container.
 */
export function envFileContent(vars: { key: string; value: string }[]): string {
    return vars.map(({ key, value }) => `${key}=${JSON.stringify(value).replace(/\$/g, "$$$$")}`).join("\n") + (vars.length ? "\n" : "")
}

/**
 * Caminho do `.env.opex` (gravado na pasta do ambiente) visto do diretório do projeto do compose,
 * que é a pasta do primeiro `-f` (ex.: `deploy/docker-compose.yml` → `../.env.opex`).
 */
export function envFileFromProject(plan: Pick<ComposePlan, "composeFiles">): string {
    const first = plan.composeFiles[0] ?? ""
    if (!first || first.startsWith("/")) return ENV_FILE
    return posix.join(posix.relative(posix.dirname(first), "."), ENV_FILE)
}

/**
 * Commit da ref no repositório: branch remota (`origin/<ref>`), tag (`refs/tags/<ref>`) ou commit,
 * nessa ordem; falha com mensagem quando nenhuma existe.
 */
function resolveRefCommand(repo: string, ref: string): string {
    const git = `git -C ${quote(repo)} rev-parse --verify --quiet`
    return `sha=$(${git} ${quote(`origin/${ref}^{commit}`)} || ${git} ${quote(`refs/tags/${ref}^{commit}`)} || ${git} ${quote(`${ref}^{commit}`)}) || { echo "Ref não encontrada: ${ref.replace(/"/g, "")}" >&2; exit 1; }`
}

/** Prepara o worktree do ambiente de central (cria na 1ª vez; depois só `checkout --detach`) e imprime o commit. */
export function centralCheckoutCommand(settings: EnvironmentsSettings, repo: string, slug: string, ref: string): string {
    const dir = envDir(settings, slug)
    return [
        `git -C ${quote(repo)} fetch origin --prune --tags`,
        resolveRefCommand(repo, ref),
        `if [ -e ${dir}/.git ]; then git -C ${dir} checkout --detach "$sha"; else mkdir -p ${envBase(settings)} && git -C ${quote(repo)} worktree add --detach ${dir} "$sha"; fi`,
        `git -C ${dir} rev-parse --short=12 HEAD`,
    ].join(" && ")
}

/** Adotado com git: `pull` opcional e o commit; sem git: nada (o redeploy só refaz o build). */
export function adoptedRevisionCommand(plan: Pick<ComposePlan, "dir" | "filesOn">, pull: boolean): string {
    const command = `${pull ? `git -C ${plan.dir} pull --ff-only && ` : ""}git -C ${plan.dir} rev-parse --short=12 HEAD`
    return plan.filesOn === "pc" ? muxCommand(command) : command
}

/** Quais pastas são repositórios git (`yes<TAB>pasta` por linha). */
export function gitDirsCommand(machine: Machine, dirs: string[]): string {
    const command = `for d in ${dirs.map(quote).join(" ")}; do if git -C "$d" rev-parse --is-inside-work-tree >/dev/null 2>&1; then printf 'yes\\t%s\\n' "$d"; fi; done; true`
    return machine === "pc" ? muxCommand(command) : command
}

export function parseGitDirs(output: string): Set<string> {
    return new Set(
        output
            .split("\n")
            .map((line) => line.split("\t"))
            .filter(([flag, dir]) => flag === "yes" && dir)
            .map(([, dir]) => dir!.trim()),
    )
}

/** Tags de um repositório do registry e o catálogo. */
export const registryTagsCommand = (settings: EnvironmentsSettings, repository: string) => `curl -fsS http://127.0.0.1:${settings.registryPort}/v2/${repository}/tags/list`
export const registryCatalogCommand = (settings: EnvironmentsSettings) => `curl -fsS 'http://127.0.0.1:${settings.registryPort}/v2/_catalog?n=1000'`

export function removeWorktreeCommand(settings: EnvironmentsSettings, repo: string, slug: string): string {
    return `git -C ${quote(repo)} worktree remove --force ${envDir(settings, slug)} 2>/dev/null || rm -rf ${envDir(settings, slug)}; git -C ${quote(repo)} worktree prune; true`
}

export function removeGeneratedCommand(plan: Pick<ComposePlan, "dir" | "filesOn">): string {
    const command = `rm -f ${plan.dir}/${OVERRIDE_FILE} ${plan.dir}/${ENV_FILE}`
    return plan.filesOn === "pc" ? muxCommand(command) : command
}

/** Apaga só o `.env.opex` (ambiente sem variáveis extras: o do deploy anterior não pode valer). */
export function removeEnvFileCommand(plan: Pick<ComposePlan, "dir" | "filesOn">): string {
    const command = `rm -f ${plan.dir}/${ENV_FILE}`
    return plan.filesOn === "pc" ? muxCommand(command) : command
}

/**
 * Árvore de trabalho sem alterações (fora os arquivos gerados pelo app): imprime `clean` ou `dirty`.
 * Inclui os arquivos não rastreados, que também entram no contexto do build.
 */
export function cleanTreeCommand(plan: Pick<ComposePlan, "dir" | "filesOn">): string {
    const command = `if [ -z "$(git -C ${plan.dir} status --porcelain -- . ':!${ENV_FILE}' ':!${OVERRIDE_FILE}' 2>/dev/null)" ]; then echo clean; else echo dirty; fi`
    return plan.filesOn === "pc" ? muxCommand(command) : command
}

/** `package.json` da raiz da pasta do ambiente (vazio quando não há). */
export function packageVersionCommand(plan: Pick<ComposePlan, "dir" | "filesOn">): string {
    const command = `head -c 200000 ${plan.dir}/package.json 2>/dev/null; true`
    return plan.filesOn === "pc" ? muxCommand(command) : command
}

const VERSION = /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,39}$/

/** `version` de um `package.json` (texto); `null` sem arquivo, JSON inválido ou versão estranha. */
export function parsePackageVersion(text: string): string | null {
    const trimmed = text.trim()
    if (!trimmed) return null
    let version: unknown = null
    try {
        version = (JSON.parse(trimmed) as { version?: unknown }).version
    } catch {
        version = /"version"\s*:\s*"([^"]+)"/.exec(trimmed)?.[1] ?? null
    }
    return typeof version === "string" && VERSION.test(version) ? version : null
}

const CONTAINER_ID = /^[0-9a-f]{6,64}$/
const VERSION_MARK = "@@opex-version "

/**
 * `package.json` do `WORKDIR` de cada container (o `docker exec` roda nele), um bloco por id:
 * `@@opex-version <id>` e o conteúdo. Container sem o arquivo deixa o bloco vazio.
 */
export function containerVersionsCommand(machine: Machine, context: string, ids: string[]): string {
    const valid = ids.filter((id) => CONTAINER_ID.test(id))
    if (!valid.length) return "true"
    return `for c in ${valid.join(" ")}; do printf '\\n${VERSION_MARK}%s\\n' "$c"; ${docker(machine, context)} exec "$c" head -c 200000 package.json 2>/dev/null; done; true`
}

export function parseContainerVersions(output: string): Map<string, string | null> {
    const versions = new Map<string, string | null>()
    for (const block of output.replace(/\r/g, "").split(`\n${VERSION_MARK}`).slice(1)) {
        const newline = block.indexOf("\n")
        const id = (newline === -1 ? block : block.slice(0, newline)).trim()
        if (CONTAINER_ID.test(id)) versions.set(id, parsePackageVersion(newline === -1 ? "" : block.slice(newline + 1)))
    }
    return versions
}

export const parseCommit = (output: string) =>
    output
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => /^[0-9a-f]{7,40}$/.test(line))
        .pop() ?? null

// --- Registry ------------------------------------------------------------------------------------

export const registryImage = (settings: EnvironmentsSettings, slug: string, service: string, tag: string) =>
    `localhost:${settings.registryPort}/${REGISTRY_NAMESPACE}/${slug}-${service.toLowerCase()}:${tag}`
export const registryRepository = (slug: string, service: string) => `${REGISTRY_NAMESPACE}/${slug}-${service.toLowerCase()}`

/** Garante o registry no servidor (só em 127.0.0.1, com exclusão de manifests ligada). */
export function ensureRegistryCommand(settings: EnvironmentsSettings): string {
    const run = `docker run -d --restart=always --name ${REGISTRY_CONTAINER} -p 127.0.0.1:${settings.registryPort}:5000 -e REGISTRY_STORAGE_DELETE_ENABLED=true -v ${REGISTRY_CONTAINER}:/var/lib/registry ${REGISTRY_IMAGE}`
    return `if docker inspect ${REGISTRY_CONTAINER} >/dev/null 2>&1; then docker start ${REGISTRY_CONTAINER} >/dev/null; else ${run} >/dev/null; fi && docker inspect -f '{{.State.Running}}' ${REGISTRY_CONTAINER}`
}

export const registryStatusCommand = () => `docker inspect -f '{{.State.Running}}' ${REGISTRY_CONTAINER} 2>/dev/null || echo missing`

const MANIFEST_ACCEPT = [
    "application/vnd.docker.distribution.manifest.v2+json",
    "application/vnd.docker.distribution.manifest.list.v2+json",
    "application/vnd.oci.image.manifest.v1+json",
    "application/vnd.oci.image.index.v1+json",
]
    .map((type) => `-H 'Accept: ${type}'`)
    .join(" ")

/** Apaga a tag do registry (pelo digest do manifest). */
export function deleteTagCommand(settings: EnvironmentsSettings, repository: string, tag: string): string {
    const base = `http://127.0.0.1:${settings.registryPort}/v2/${repository}/manifests`
    return `digest=$(curl -fsSI ${MANIFEST_ACCEPT} ${base}/${quote(tag)} | tr -d '\\r' | awk -F': ' 'tolower($1)=="docker-content-digest"{print $2}') && [ -n "$digest" ] && curl -fsS -X DELETE ${base}/$digest`
}

export const garbageCollectCommand = () => `docker exec ${REGISTRY_CONTAINER} bin/registry garbage-collect --delete-untagged /etc/docker/registry/config.yml`

// --- Repasses pelo túnel ---------------------------------------------------------------------------

export const forwardPorts = (ports: number[]) => ports.map((port) => forwardPortCommand(port)).join("; ")
export const cancelPorts = (ports: number[]) => ports.map((port) => cancelForwardCommand(port)).join("; ") || "true"
export const reverseRegistry = (settings: EnvironmentsSettings) => reverseForwardCommand(settings.registryPort)
export const cancelReverseRegistry = (settings: EnvironmentsSettings) => cancelReverseForwardCommand(settings.registryPort)

/** Espera a URL de saúde responder (2xx/3xx). */
export function healthCommand(url: string, timeoutMs: number): string {
    const tries = Math.max(1, Math.round(timeoutMs / 3000))
    return `for i in $(seq 1 ${tries}); do curl -fsS -o /dev/null -m 5 ${quote(url)} && exit 0; sleep 3; done; exit 1`
}

// --- Snapshot dos containers ----------------------------------------------------------------------

const SEP = "\t"
const PS_FORMAT = [`{{.Label "${COMPOSE_LABELS.project}"}}`, `{{.Label "${COMPOSE_LABELS.service}"}}`, "{{.Names}}", "{{.State}}", "{{.Status}}", "{{.Ports}}", `{{.Label "${COMPOSE_LABELS.workingDir}"}}`, `{{.Label "${COMPOSE_LABELS.configFiles}"}}`, "{{.ID}}"].join(SEP)

const docker = (machine: Machine, context: string) => (machine === "pc" ? `docker --context ${context}` : "docker")

/** Containers de projetos do compose e o uso de CPU/RAM (separados por uma linha `---`). */
export function snapshotCommand(machine: Machine, context: string): string {
    return `${docker(machine, context)} ps -a --filter label=${COMPOSE_LABELS.project} --format ${quote(PS_FORMAT)}; echo ---; ${docker(machine, context)} stats --no-stream --format ${quote(`{{.Name}}${SEP}{{.CPUPerc}}${SEP}{{.MemUsage}}`)} 2>/dev/null; true`
}

export interface ComposeContainer {
    /** Id (curto) do container: muda quando o compose o recria. */
    id: string
    project: string
    service: string
    name: string
    state: string
    status: string
    ports: string
    workingDir: string
    configFiles: string[]
    cpu: string | null
    memory: string | null
}

export function parseSnapshot(output: string): ComposeContainer[] {
    const [ps = "", stats = ""] = output.split(/^---$/m)
    const usage = new Map<string, { cpu: string; memory: string }>()
    for (const line of stats.split("\n")) {
        const [name, cpu, memory] = line.trim().split(SEP)
        if (name && cpu) usage.set(name, { cpu, memory: memory ?? "" })
    }
    return ps
        .split("\n")
        .map((line) => line.replace(/\r$/, ""))
        .filter((line) => line.includes(SEP))
        .map((line) => {
            const [project = "", service = "", name = "", state = "", status = "", ports = "", workingDir = "", configFiles = "", id = ""] = line.split(SEP)
            const stat = usage.get(name)
            return { id: id.trim(), project, service, name, state, status, ports, workingDir, configFiles: configFiles ? configFiles.split(",").filter(Boolean) : [], cpu: stat?.cpu ?? null, memory: stat?.memory ?? null }
        })
        .filter((item) => item.project)
}
