import { LOCAL_DOCKER_ALIAS_IMAGE, LOCAL_DOCKER_CA_ENV, LOCAL_DOCKER_CA_TARGET, LOCAL_DOCKER_CONTROL_SERVICE, LOCAL_DOCKER_LABELS, LOCAL_DOCKER_PATHS } from "./constants"
import type { LocalDockerAlias, LocalDockerSettings } from "./schemas"
import type { LocalDockerMachineInfo } from "./types"

/**
 * Comandos (puros) da Builder Machine (prévias na máquina local). Rodam no host do OpenCode (o servidor), com o
 * usuário do processo do OpenCode. Todo valor variável vem do schema (nomes seguros) ou passa por
 * `quote`.
 */

export const quote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`

/** Caminho no `$HOME` do host, entre aspas duplas para o shell expandir o `$HOME`. */
const home = (relative: string) => `"$HOME/${relative}"`

const KEY = home(LOCAL_DOCKER_PATHS.key)
const CONTROL = home(LOCAL_DOCKER_PATHS.control)
const SOCKET = home(LOCAL_DOCKER_PATHS.dockerSocket)
/** Destino simbólico dos comandos multiplexados (`-S`): a conexão mestra é quem decide o host. */
const MUX_HOST = "opex-local"
/** As portas repassadas ficam abertas em todas as interfaces do servidor (o app, em container, as alcança). */
const FORWARD_BIND = "0.0.0.0"

export interface SshTarget {
    host: string
    port: number
    user: string
}

/** Para onde o servidor conecta: o túnel de controle (localhost) ou o IP do PC. */
export function sshTarget(settings: LocalDockerSettings): SshTarget {
    return settings.mode === "reverse"
        ? { host: "localhost", port: settings.controlPort, user: settings.pcUser }
        : { host: settings.pcHost, port: settings.pcSshPort, user: settings.pcUser }
}

/** O que falta na configuração para conectar ao PC (`null` = completa). */
export function connectionProblem(settings: LocalDockerSettings): string | null {
    if (!settings.pcUser) return "Informe o usuário do PC (WSL)"
    if (settings.mode === "direct" && !settings.pcHost) return "Informe o IP do PC para a conexão direta"
    return null
}

const SSH_OPTIONS = [
    `-i ${KEY}`,
    "-o IdentitiesOnly=yes",
    "-o BatchMode=yes",
    "-o StrictHostKeyChecking=accept-new",
    `-o UserKnownHostsFile=${home(LOCAL_DOCKER_PATHS.knownHosts)}`,
    "-o ConnectTimeout=8",
]

function sshArgs(settings: LocalDockerSettings): { options: string; destination: string } {
    const target = sshTarget(settings)
    return { options: `${SSH_OPTIONS.join(" ")} -p ${target.port}`, destination: `${target.user}@${target.host}` }
}

/** Comando no PC por uma conexão SSH avulsa (não depende do túnel aberto). */
export function remoteCommand(settings: LocalDockerSettings, command: string): string {
    const { options, destination } = sshArgs(settings)
    return `ssh ${options} ${destination} ${quote(command)}`
}

const SSH_DIR = `mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"`

/** Gera uma chave nova do servidor (substitui a atual) e imprime a parte pública. */
export function keygenCommand(): string {
    return `${SSH_DIR} && rm -f ${KEY} ${KEY}.pub && ssh-keygen -q -t ed25519 -N "" -C "opex-local@$(hostname)" -f ${KEY} && cat ${KEY}.pub`
}

/**
 * Grava uma chave privada colada pelo usuário (em base64, para não depender de aspas) e imprime a
 * parte pública derivada dela. Chave com senha falha no `ssh-keygen -y -P ""` e nada é trocado.
 */
export function importKeyCommand(privateKey: string): string {
    const encoded = Buffer.from(`${privateKey.trim()}\n`, "utf8").toString("base64")
    return [
        `${SSH_DIR} && umask 077 &&`,
        `printf %s ${quote(encoded)} | base64 -d > ${KEY}.tmp &&`,
        `ssh-keygen -y -P "" -f ${KEY}.tmp > ${KEY}.pub.tmp &&`,
        `mv -f ${KEY}.tmp ${KEY} && mv -f ${KEY}.pub.tmp ${KEY}.pub && cat ${KEY}.pub`,
        `|| { rm -f ${KEY}.tmp ${KEY}.pub.tmp; echo "Chave inválida ou protegida por senha"; exit 1; }`,
    ].join(" ")
}

/** A chave existe no host? (Chave importada some se o host for refeito: o app a regrava.) */
export function keyPresentCommand(): string {
    return `test -f ${KEY}`
}

/** Impressão digital da chave pública (o que a tela mostra no lugar da chave). */
export function fingerprintCommand(): string {
    return `ssh-keygen -lf ${KEY}.pub`
}

/** `256 SHA256:abc… comentário (ED25519)` → `SHA256:abc… (ED25519)`. */
export function parseFingerprint(output: string): string | null {
    const match = output.match(/(SHA256:[A-Za-z0-9+/=]+).*?(\([A-Z0-9-]+\))?\s*$/m)
    if (!match) return null
    return match[2] ? `${match[1]} ${match[2]}` : match[1]!
}

export function publicKeyOf(output: string): string | null {
    return (
        output
            .split("\n")
            .map((line) => line.trim())
            .find((line) => /^(ssh-(ed25519|rsa)|ecdsa-sha2-\S+) /.test(line)) ?? null
    )
}

export function readPublicKeyCommand(): string {
    return `cat ${KEY}.pub`
}

export function checkTunnelCommand(): string {
    return `ssh -S ${CONTROL} -O check ${MUX_HOST}`
}

/**
 * Abre a conexão mestra (`-M`) com o socket do Docker do PC repassado para o host e garante o
 * contexto do Docker. Já aberta: não abre outra.
 */
export function openTunnelCommand(settings: LocalDockerSettings): string {
    const { options, destination } = sshArgs(settings)
    const open = [
        `ssh ${options} -f -N -M -S ${CONTROL}`,
        "-o ControlPersist=no -o ExitOnForwardFailure=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -o StreamLocalBindUnlink=yes",
        `-L ${SOCKET}:/var/run/docker.sock ${destination}`,
    ].join(" ")
    const context = `docker context inspect ${settings.contextName} >/dev/null 2>&1 || docker context create ${settings.contextName} --docker "host=unix://$HOME/${LOCAL_DOCKER_PATHS.dockerSocket}" >/dev/null`
    return `if ${checkTunnelCommand()} 2>/dev/null; then true; else rm -f ${SOCKET} ${CONTROL}; ${open}; fi && { ${context}; }`
}

export function closeTunnelCommand(): string {
    return `ssh -S ${CONTROL} -O exit ${MUX_HOST} 2>/dev/null; rm -f ${SOCKET} ${CONTROL}; true`
}

const forwardSpec = (port: number) => `${FORWARD_BIND}:${port}:localhost:${port}`

export function forwardPortCommand(port: number): string {
    return `ssh -S ${CONTROL} -O forward -L ${forwardSpec(port)} ${MUX_HOST}`
}

export function cancelForwardCommand(port: number): string {
    return `ssh -S ${CONTROL} -O cancel -L ${forwardSpec(port)} ${MUX_HOST} 2>/dev/null; true`
}

/** Comando no PC pela conexão mestra do túnel (exige o túnel aberto). */
export function muxCommand(command: string): string {
    return `ssh -S ${CONTROL} ${MUX_HOST} ${quote(command)}`
}

/**
 * `rsync -e` pela conexão mestra (o destino é `${MUX_HOST}:<pasta>`). Vai entre aspas duplas no
 * comando (`-e "…"`): o `$HOME` expande no host antes de o rsync dividir o texto.
 */
export function muxRsyncShell(): string {
    return `ssh -S $HOME/${LOCAL_DOCKER_PATHS.control}`
}

/** Repasse reverso pela conexão mestra: o `localhost:<porta>` do PC chega ao `localhost:<porta>` do servidor. */
export function reverseForwardCommand(port: number): string {
    return `ssh -S ${CONTROL} -O forward -R ${port}:localhost:${port} ${MUX_HOST}`
}

export function cancelReverseForwardCommand(port: number): string {
    return `ssh -S ${CONTROL} -O cancel -R ${port}:localhost:${port} ${MUX_HOST} 2>/dev/null; true`
}

/** Destino simbólico dos comandos pela conexão mestra (`rsync … ${MUX_HOST}:<pasta>`). */
export const MUX_DESTINATION = MUX_HOST

/** Portas TCP em escuta no PC (pela conexão mestra). */
export function listeningPortsCommand(): string {
    return `ssh -S ${CONTROL} ${MUX_HOST} ${quote("ss -Htln")}`
}

export function machineInfoCommand(settings: LocalDockerSettings): string {
    return `docker --context ${settings.contextName} info --format ${quote("{{.ServerVersion}}|{{.Name}}|{{.NCPU}}|{{.MemTotal}}")}`
}

export function parseMachineInfo(output: string): LocalDockerMachineInfo | null {
    const line = output
        .split("\n")
        .map((item) => item.trim())
        .find((item) => item.split("|").length === 4)
    if (!line) return null
    const [version, name, cpus, memory] = line.split("|")
    if (!version) return null
    return { version, name: name ?? "", cpus: Number(cpus) || 0, memoryBytes: Number(memory) || 0 }
}

/** Portas da saída do `ss -Htln` (coluna do endereço local: `0.0.0.0:4001`, `[::]:4001`, `*:4001`). */
export function parseListeningPorts(output: string): Set<number> {
    const ports = new Set<number>()
    for (const line of output.split("\n")) {
        const local = line.trim().split(/\s+/)[3]
        const port = Number(local?.slice(local.lastIndexOf(":") + 1))
        if (Number.isInteger(port) && port > 0) ports.add(port)
    }
    return ports
}

/** Prefixo de todo comando docker de uma prévia no PC. */
export function dockerPrefix(settings: LocalDockerSettings): string {
    return `DOCKER_CONTEXT=${settings.contextName} BUILDX_BUILDER=${settings.builderName}`
}

export interface PrepareStep {
    label: string
    command: string
}

const dockerOn = (settings: LocalDockerSettings) => `docker --context ${settings.contextName}`

// ---------------------------------------------------------------------------
// Containers de ambiente (preparo): rede, apelidos e builder dedicado
// ---------------------------------------------------------------------------

export const aliasContainerName = (settings: LocalDockerSettings, alias: Pick<LocalDockerAlias, "name">) => `${settings.aliasPrefix}${alias.name}`
export const aliasTarget = (settings: LocalDockerSettings, alias: Pick<LocalDockerAlias, "port">) => `${settings.serverAddress}:${alias.port}`
/** Nome do container do BuildKit criado pelo `docker buildx create` (driver docker-container). */
export const builderContainerName = (settings: LocalDockerSettings) => `buildx_buildkit_${settings.builderName}0`

export function networkCommand(settings: LocalDockerSettings): string {
    const docker = dockerOn(settings)
    return `${docker} network inspect ${settings.network} >/dev/null 2>&1 || ${docker} network create ${settings.network} >/dev/null`
}

/** (Re)cria o container de um apelido, com os labels que o identificam no preparo. */
export function aliasRunCommand(settings: LocalDockerSettings, alias: LocalDockerAlias): string {
    const docker = dockerOn(settings)
    const name = aliasContainerName(settings, alias)
    const target = aliasTarget(settings, alias)
    const labels = [
        `${LOCAL_DOCKER_LABELS.env}=env`,
        `${LOCAL_DOCKER_LABELS.role}=alias`,
        `${LOCAL_DOCKER_LABELS.alias}=${alias.name}`,
        `${LOCAL_DOCKER_LABELS.target}=${target}`,
        `${LOCAL_DOCKER_LABELS.network}=${settings.network}`,
    ]
        .map((label) => `--label ${label}`)
        .join(" ")
    return [
        `${docker} rm -f ${name} >/dev/null 2>&1;`,
        `${docker} run -d --name ${name} --restart unless-stopped ${labels} --network ${settings.network} --network-alias ${alias.name}`,
        `${LOCAL_DOCKER_ALIAS_IMAGE} TCP-LISTEN:${alias.port},fork,reuseaddr TCP:${target} >/dev/null`,
    ].join(" ")
}

export function removeContainerCommand(settings: LocalDockerSettings, name: string): string {
    return `${dockerOn(settings)} rm -f ${quote(name)} >/dev/null`
}

export interface BuilderLimits {
    memoryGb: number | null
    cpus: number | null
}

export const builderLimitsOf = (settings: LocalDockerSettings): BuilderLimits => ({ memoryGb: settings.builderMemoryGb, cpus: settings.builderCpus })
export const sameLimits = (a: BuilderLimits | null | undefined, b: BuilderLimits) => (a?.memoryGb ?? null) === b.memoryGb && (a?.cpus ?? null) === b.cpus

/** `--driver-opt` dos limites do builder (memória em MiB; CPU por quota sobre período de 100 ms). */
export function builderDriverOpts(limits: BuilderLimits): string[] {
    const opts = ["default-load=true"]
    if (limits.memoryGb) opts.push(`memory=${Math.round(limits.memoryGb * 1024)}m`)
    if (limits.cpus) opts.push("cpu-period=100000", `cpu-quota=${Math.round(limits.cpus * 100_000)}`)
    return opts
}

function builderCreate(settings: LocalDockerSettings): string {
    const opts = builderDriverOpts(builderLimitsOf(settings))
        .map((opt) => `--driver-opt ${opt}`)
        .join(" ")
    return `docker buildx create --name ${settings.builderName} --driver docker-container ${opts} ${settings.contextName} >/dev/null`
}

const bootstrap = (settings: LocalDockerSettings) => `docker buildx inspect --bootstrap ${settings.builderName} >/dev/null`

/**
 * Garante o builder dedicado. `recreate` (limites mudaram ou "Recriar"): remove mantendo o estado
 * (`--keep-state` preserva o cache) e cria de novo com os limites atuais.
 */
export function builderEnsureCommand(settings: LocalDockerSettings, recreate: boolean): string {
    if (recreate) return `{ docker buildx rm --keep-state ${settings.builderName} >/dev/null 2>&1 || true; } && ${builderCreate(settings)} && ${bootstrap(settings)}`
    return `{ docker buildx inspect ${settings.builderName} >/dev/null 2>&1 || ${builderCreate(settings)}; } && ${bootstrap(settings)}`
}

/** Lista os containers do PC (separados por tab): o preparo e a aba Túnel classificam a partir daqui. */
export function listContainersCommand(settings: LocalDockerSettings): string {
    const fields = [
        "{{.Names}}",
        "{{.State}}",
        "{{.Status}}",
        "{{.Image}}",
        '{{.Label "com.docker.compose.project"}}',
        '{{.Label "com.docker.compose.service"}}',
        `{{.Label "${LOCAL_DOCKER_LABELS.role}"}}`,
        `{{.Label "${LOCAL_DOCKER_LABELS.alias}"}}`,
        `{{.Label "${LOCAL_DOCKER_LABELS.target}"}}`,
        `{{.Label "${LOCAL_DOCKER_LABELS.network}"}}`,
        "{{.Ports}}",
    ]
    return `${dockerOn(settings)} ps -a --format ${quote(fields.join("\t"))}`
}

export interface PcContainer {
    name: string
    state: string
    status: string
    image: string
    composeProject: string
    composeService: string
    role: string
    alias: string
    target: string
    network: string
    ports: string
}

export function parseContainers(output: string): PcContainer[] {
    return output
        .split("\n")
        .map((line) => line.split("\t"))
        .filter((cols) => cols.length >= 11 && cols[0])
        .map(([name, state, status, image, composeProject, composeService, role, alias, target, network, ports]) => ({
            name: name!.trim(),
            state: state!.trim(),
            status: status!.trim(),
            image: image!.trim(),
            composeProject: composeProject!.trim(),
            composeService: composeService!.trim(),
            role: role!.trim(),
            alias: alias!.trim(),
            target: target!.trim(),
            network: network!.trim(),
            ports: ports!.trim(),
        }))
}

/** Containers de apelido: com o label do preparo ou sem label com o nome no prefixo configurado. */
export function aliasContainers(settings: LocalDockerSettings, containers: PcContainer[]): PcContainer[] {
    return containers.filter((item) => item.role === "alias" || (!item.role && item.name.startsWith(settings.aliasPrefix)))
}

export type AliasPlanKind = "keep" | "start" | "create" | "remove"

export interface AliasPlanItem {
    kind: AliasPlanKind
    name: string
    label: string
    command: string | null
}

/**
 * Reconciliação dos apelidos por diferença: só o que mudou é tocado. Igual e rodando = mantém; igual
 * e parado = levanta; novo, alterado (destino/rede) ou sem label = (re)cria; fora da lista = remove.
 */
export function planAliasReconcile(settings: LocalDockerSettings, containers: PcContainer[]): AliasPlanItem[] {
    const current = aliasContainers(settings, containers)
    const docker = dockerOn(settings)
    const plan: AliasPlanItem[] = []
    const wanted = new Set<string>()
    for (const alias of settings.aliases) {
        const name = aliasContainerName(settings, alias)
        wanted.add(name)
        const label = `Apelido ${alias.name} → ${aliasTarget(settings, alias)}`
        const existing = current.find((item) => item.name === name)
        const same = existing && existing.role === "alias" && existing.alias === alias.name && existing.target === aliasTarget(settings, alias) && existing.network === settings.network
        if (same && existing.state === "running") plan.push({ kind: "keep", name, label, command: null })
        else if (same) plan.push({ kind: "start", name, label, command: `${docker} start ${name} >/dev/null` })
        else plan.push({ kind: "create", name, label, command: aliasRunCommand(settings, alias) })
    }
    for (const item of current) {
        if (!wanted.has(item.name)) plan.push({ kind: "remove", name: item.name, label: `Apelido removido ${item.name}`, command: removeContainerCommand(settings, item.name) })
    }
    return plan
}

// ---------------------------------------------------------------------------
// Uso de CPU e memória
// ---------------------------------------------------------------------------

export function statsCommand(settings: LocalDockerSettings): string {
    return `${dockerOn(settings)} stats --no-stream --format ${quote("{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}")}`
}

export interface ContainerStats {
    cpuPercent: number
    memoryUsage: string
    memoryPercent: number
}

const percent = (value: string | undefined) => {
    const parsed = Number.parseFloat((value ?? "").replace("%", ""))
    return Number.isFinite(parsed) ? parsed : 0
}

export function parseStats(output: string): Map<string, ContainerStats> {
    const stats = new Map<string, ContainerStats>()
    for (const line of output.split("\n")) {
        const [name, cpu, mem, memPerc] = line.split("\t")
        if (!name?.trim() || mem === undefined) continue
        stats.set(name.trim(), { cpuPercent: percent(cpu), memoryUsage: mem.trim(), memoryPercent: percent(memPerc) })
    }
    return stats
}

// ---------------------------------------------------------------------------
// Ações por container (aba Túnel)
// ---------------------------------------------------------------------------

export function startContainerCommand(settings: LocalDockerSettings, name: string): string {
    return `${dockerOn(settings)} start ${quote(name)} >/dev/null`
}

export function stopContainerCommand(settings: LocalDockerSettings, name: string): string {
    return `${dockerOn(settings)} stop ${quote(name)} >/dev/null`
}

export const builderStartCommand = (settings: LocalDockerSettings) => bootstrap(settings)
export const builderStopCommand = (settings: LocalDockerSettings) => `docker buildx stop ${settings.builderName}`
/** Apaga o builder e o volume de estado dele (todo o cache do BuildKit). */
export const builderDeleteCommand = (settings: LocalDockerSettings) => `docker buildx rm ${settings.builderName}`

/** Apaga o container do apelido e a imagem do repasse (quando nenhum outro container a usa). */
export function aliasDeleteCommand(settings: LocalDockerSettings, name: string): string {
    return `${removeContainerCommand(settings, name)}; ${dockerOn(settings)} image rm ${LOCAL_DOCKER_ALIAS_IMAGE} >/dev/null 2>&1; true`
}

/**
 * Recria um serviço da prévia pelo compose do worktree no servidor, mandando para o Docker do PC
 * (sem build: usa a imagem que já está no PC). `files` = os mesmos arquivos do build (com o override
 * das CAs do PC); vazio = o padrão do compose.
 */
export function previewRecreateCommand(settings: LocalDockerSettings, input: { worktreePath: string; composeProject: string; service: string; port: number; files?: string[] }): string {
    const files = (input.files ?? []).map((file) => ` -f ${quote(file)}`).join("")
    return `cd ${quote(input.worktreePath)} && PORT=${input.port} DOCKER_CONTEXT=${settings.contextName} docker compose -p ${quote(input.composeProject)}${files} up -d --force-recreate --no-build ${quote(input.service)}`
}

// ---------------------------------------------------------------------------
// Certificados do PC: inspeção TLS da rede e override do compose com as CAs do PC
// ---------------------------------------------------------------------------

const COMPOSE_PROJECT = /^[a-z0-9][a-z0-9_-]*$/
const COMPOSE_CANDIDATES = ["compose.yaml", "compose.yml", "docker-compose.yaml", "docker-compose.yml"]

/** Override da prévia no host (fora do worktree): `"$HOME/.opex-local/compose/<projeto>.ca.yml"`. */
export function composeOverridePath(composeProject: string): string {
    if (!COMPOSE_PROJECT.test(composeProject)) throw new Error(`Nome de projeto do compose inválido: ${composeProject}`)
    return home(`${LOCAL_DOCKER_PATHS.composeOverrides}/${composeProject}.ca.yml`)
}

/**
 * Lê no worktree os arquivos-base do compose (o `composeFile` da central ou a descoberta padrão do
 * compose, com o `*.override.*`) e os serviços ativos. Saída: linhas `FILE:` e `SERVICE:`.
 */
export function composeInspectCommand(input: { worktreePath: string; composeFile: string; portEnvVar: string; port: number }): string {
    const explicit = input.composeFile.trim()
    const files = explicit
        ? `echo ${quote(`FILE:${explicit}`)}; set -- -f ${quote(explicit)};`
        : [
              `set --; base=; for f in ${COMPOSE_CANDIDATES.join(" ")}; do if [ -f "$f" ]; then base=$f; break; fi; done;`,
              '[ -n "$base" ] || { echo "Nenhum arquivo do Docker Compose no worktree"; exit 1; };',
              'echo "FILE:$base"; set -- -f "$base"; stem=${base%.*};',
              'for o in "$stem.override.yaml" "$stem.override.yml"; do if [ -f "$o" ]; then echo "FILE:$o"; set -- "$@" -f "$o"; break; fi; done;',
          ].join(" ")
    const services = `svc=$(${input.portEnvVar}=${input.port} docker compose "$@" config --services) || { echo "$svc"; exit 1; }; printf '%s\\n' "$svc" | sed 's/^/SERVICE:/'`
    return `cd ${quote(input.worktreePath)} && { ${files} ${services}; }`
}

export function parseComposeInspect(output: string): { files: string[]; services: string[] } {
    const files: string[] = []
    const services: string[] = []
    for (const raw of output.split("\n")) {
        const line = raw.trim()
        if (line.startsWith("FILE:") && line.length > 5) files.push(line.slice(5))
        else if (line.startsWith("SERVICE:") && line.length > 8) services.push(line.slice(8))
    }
    return { files, services }
}

/**
 * Override do compose que monta o bundle de CAs do PC (somente leitura) em cada serviço e aponta o
 * Node/OpenSSL/Python para ele. `create_host_path: false`: sem o arquivo no PC o compose falha em vez
 * de criar uma pasta no lugar. Strings em JSON (JSON é YAML válido).
 */
export function caOverrideYaml(settings: Pick<LocalDockerSettings, "pcCaBundlePath">, services: string[]): string {
    const target = JSON.stringify(LOCAL_DOCKER_CA_TARGET)
    const lines = ["# Gerado pelo Opex (Builder Machine): CAs do PC nas prévias. Não edite.", "services:"]
    for (const service of services) {
        lines.push(
            `  ${JSON.stringify(service)}:`,
            "    volumes:",
            "      - type: bind",
            `        source: ${JSON.stringify(settings.pcCaBundlePath)}`,
            `        target: ${target}`,
            "        read_only: true",
            "        bind:",
            "          create_host_path: false",
            "    environment:",
            ...LOCAL_DOCKER_CA_ENV.map((name) => `      ${name}: ${target}`),
        )
    }
    return `${lines.join("\n")}\n`
}

/** Grava o override da prévia (em base64, sem depender de aspas) e imprime o caminho absoluto (`OVERRIDE:`). */
export function writeComposeOverrideCommand(composeProject: string, content: string): string {
    const path = composeOverridePath(composeProject)
    const encoded = Buffer.from(content, "utf8").toString("base64")
    return `mkdir -p ${home(LOCAL_DOCKER_PATHS.composeOverrides)} && printf %s ${quote(encoded)} | base64 -d > ${path} && printf 'OVERRIDE:%s\\n' ${path}`
}

export function parseOverridePath(output: string): string | null {
    const line = output
        .split("\n")
        .map((item) => item.trim())
        .find((item) => item.startsWith("OVERRIDE:/"))
    return line ? line.slice("OVERRIDE:".length) : null
}

export function removeComposeOverrideCommand(composeProject: string): string {
    return `rm -f ${composeOverridePath(composeProject)}; true`
}

/** O bundle de CAs existe e é legível no PC? (pela conexão mestra) */
export function caBundleCheckCommand(settings: Pick<LocalDockerSettings, "pcCaBundlePath">): string {
    return muxCommand(`test -r ${quote(settings.pcCaBundlePath)}`)
}

/** Emissor do certificado de `host:443` como esta máquina o vê (`NO_OPENSSL` sem o openssl). */
export function tlsIssuerCommand(host: string): string {
    return `command -v openssl >/dev/null 2>&1 || { echo NO_OPENSSL; exit 0; }; echo | timeout 15 openssl s_client -connect ${host}:443 -servername ${host} 2>/dev/null | openssl x509 -noout -issuer 2>/dev/null; true`
}

/** `issuer=CN = FortiGate SubCA Global` (OpenSSL 1.1) e `issuer=CN=…` (3.x) → `CN=FortiGate SubCA Global`. */
export function parseIssuer(output: string): string | null {
    const match = output.match(/^\s*issuer\s*=\s*(.+?)\s*$/m)
    if (!match) return null
    return match[1]!.replace(/\s*=\s*/g, "=").replace(/\s*,\s*/g, ", ")
}

/** Apaga a prévia inteira no PC: containers, volumes, redes e as imagens que eles usavam. */
export function previewDeleteCommand(settings: LocalDockerSettings, composeProject: string): string {
    const docker = dockerOn(settings)
    const label = quote(`label=com.docker.compose.project=${composeProject}`)
    return [
        `ids=$(${docker} ps -aq --filter ${label});`,
        `imgs=$([ -z "$ids" ] || ${docker} inspect --format '{{.Image}}' $ids | sort -u);`,
        `[ -z "$ids" ] || ${docker} rm -f -v $ids >/dev/null;`,
        `vols=$(${docker} volume ls -q --filter ${label});`,
        `[ -z "$vols" ] || ${docker} volume rm $vols >/dev/null;`,
        `nets=$(${docker} network ls -q --filter ${label});`,
        `[ -z "$nets" ] || ${docker} network rm $nets >/dev/null;`,
        `[ -z "$imgs" ] || ${docker} image rm $imgs >/dev/null 2>&1;`,
        "true",
    ].join(" ")
}

// ---------------------------------------------------------------------------
// Rotina de limpeza (Crons)
// ---------------------------------------------------------------------------

/** Imagens órfãs do PC + cache do builder dedicado acima do teto configurado. */
export function cleanupSteps(settings: LocalDockerSettings): PrepareStep[] {
    return [
        { label: "Imagens órfãs do PC", command: `${dockerOn(settings)} image prune -f` },
        { label: `Cache do builder ${settings.builderName} (teto ${settings.builderCacheKeepGb} GB)`, command: `docker buildx prune --builder ${settings.builderName} -f --max-used-space ${settings.builderCacheKeepGb}gb` },
    ]
}

/**
 * Remove os containers e as redes de um projeto do compose sem precisar do arquivo do compose
 * (`context` nulo = o Docker do próprio servidor). Idempotente.
 */
export function teardownCommand(context: string | null, composeProject: string): string {
    const docker = context ? `docker --context ${context}` : "docker"
    const label = quote(`label=com.docker.compose.project=${composeProject}`)
    return [
        `ids=$(${docker} ps -aq --filter ${label});`,
        `[ -z "$ids" ] || ${docker} rm -f $ids >/dev/null;`,
        `nets=$(${docker} network ls -q --filter ${label});`,
        `[ -z "$nets" ] || ${docker} network rm $nets >/dev/null;`,
        "true",
    ].join(" ")
}

/** Script de preparo único do PC (WSL), colado uma vez pelo usuário. */
export function bootstrapScript(settings: LocalDockerSettings, publicKey: string, options: { mirrored: boolean }): string {
    const reverse = settings.mode === "reverse"
    const total = reverse ? 6 : 4
    const lines = [
        "#!/usr/bin/env bash",
        "# Opex — preparo único do PC (WSL) para as prévias na máquina local.",
        "set -euo pipefail",
        `PUBKEY=${quote(publicKey.trim())}`,
        ...(reverse ? [`SERVER=${quote(settings.serverSshHost)}`, `CONTROL_PORT=${settings.controlPort}`] : []),
        "RESTART=0",
        "",
        `echo "==> 1/${total} Pacotes (openssh-server${reverse ? ", autossh" : ""})"`,
        // Falha parcial do `update` (índice com hash divergente no espelho) não impede a instalação com os índices antigos.
        'sudo apt-get update -qq || echo "Aviso: parte dos índices do apt não atualizou; seguindo com os índices atuais."',
        `sudo apt-get install -y -qq --no-install-recommends openssh-server${reverse ? " autossh" : ""}`,
        `test -x /usr/sbin/sshd${reverse ? " && command -v autossh >/dev/null" : ""} || { echo "Os pacotes não foram instalados: rode \\"sudo apt-get install -y --no-install-recommends openssh-server${reverse ? " autossh" : ""}\\" e veja o erro."; exit 1; }`,
        "",
        `echo "==> 2/${total} Chave do servidor no authorized_keys"`,
        "mkdir -p ~/.ssh && chmod 700 ~/.ssh && touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys",
        'grep -qxF "$PUBKEY" ~/.ssh/authorized_keys || echo "$PUBKEY" >> ~/.ssh/authorized_keys',
        "",
        `echo "==> 3/${total} Docker sem sudo"`,
        `docker version --format '{{.Server.Version}}' >/dev/null || { echo "O Docker não respondeu sem sudo: inicie o dockerd e confira o grupo docker (sudo usermod -aG docker $USER)."; exit 1; }`,
        "",
        `echo "==> 4/${total} WSL: systemd${options.mirrored ? ", rede espelhada" : ""} e sem desligar por ociosidade"`,
        "if ! grep -qs '^systemd=true' /etc/wsl.conf; then printf '\\n[boot]\\nsystemd=true\\n' | sudo tee -a /etc/wsl.conf >/dev/null; RESTART=1; fi",
        "if command -v cmd.exe >/dev/null && command -v wslpath >/dev/null; then",
        `WINHOME=$(wslpath "$(cmd.exe /c 'echo %USERPROFILE%' 2>/dev/null | tr -d '\\r')")`,
        'WSLCONFIG="$WINHOME/.wslconfig"',
        'touch "$WSLCONFIG"',
        "wslset() { if grep -qs \"^$1=\" \"$WSLCONFIG\"; then sed -i \"s/^$1=.*/$1=$2/\" \"$WSLCONFIG\"; elif grep -qs '^\\[wsl2\\]' \"$WSLCONFIG\"; then sed -i \"/^\\[wsl2\\]/a $1=$2\" \"$WSLCONFIG\"; else printf '\\n[wsl2]\\n%s=%s\\n' \"$1\" \"$2\" >> \"$WSLCONFIG\"; fi; RESTART=1; }",
        'grep -qs "^vmIdleTimeout=-1" "$WSLCONFIG" || wslset vmIdleTimeout -1',
        ...(options.mirrored ? ['grep -qs "^networkingMode=mirrored" "$WSLCONFIG" || wslset networkingMode mirrored'] : []),
        "else",
        `    echo "Aviso: sem acesso ao Windows (cmd.exe); ajuste o %USERPROFILE%\\.wslconfig à mão: [wsl2] vmIdleTimeout=-1${options.mirrored ? " e networkingMode=mirrored" : ""}."`,
        "fi",
        "",
    ]
    if (reverse) {
        lines.push(
            `echo "==> 5/${total} Acesso ao servidor ($SERVER)"`,
            'ssh -o BatchMode=yes -o ConnectTimeout=10 "$SERVER" true || { echo "Não foi possível entrar em $SERVER sem senha a partir do WSL."; exit 1; }',
            "",
            `echo "==> 6/${total} Serviço do túnel de controle (${LOCAL_DOCKER_CONTROL_SERVICE})"`,
            `sudo tee /etc/systemd/system/${LOCAL_DOCKER_CONTROL_SERVICE}.service >/dev/null <<EOF`,
            "[Unit]",
            "Description=Opex - tunel de controle (SSH do PC publicado no servidor)",
            "After=network-online.target ssh.service",
            "Wants=network-online.target",
            "",
            "[Service]",
            "User=$USER",
            "Environment=AUTOSSH_GATETIME=0",
            "ExecStart=/usr/bin/autossh -M 0 -N -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -o ExitOnForwardFailure=yes -o BatchMode=yes -R $CONTROL_PORT:localhost:22 $SERVER",
            "Restart=always",
            "RestartSec=10",
            "",
            "[Install]",
            "WantedBy=multi-user.target",
            "EOF",
            "",
        )
    }
    const services = reverse ? `ssh ${LOCAL_DOCKER_CONTROL_SERVICE}` : "ssh"
    lines.push(
        'if [ "$(ps -p 1 -o comm=)" = "systemd" ]; then',
        "    sudo systemctl daemon-reload",
        `    for unit in ${services}; do sudo systemctl enable --now "$unit"; done`,
        ...(reverse ? [`    sudo systemctl restart ${LOCAL_DOCKER_CONTROL_SERVICE}`] : []),
        "fi",
        'if [ "$RESTART" = "1" ] || [ "$(ps -p 1 -o comm=)" != "systemd" ]; then',
        '    echo "Configuração do WSL alterada: no Windows, rode \\"wsl --shutdown\\", abra o WSL de novo e rode este script mais uma vez."',
        "else",
        '    echo "Pronto. Volte ao Opex e use \\"Testar conexão\\"."',
        "fi",
    )
    return `${lines.join("\n")}\n`
}

export interface ManualStep {
    title: string
    description: string
    commands: string[]
}

/** O mesmo preparo do script, em passos para fazer à mão no terminal do WSL (seção recolhida). */
export function manualSteps(settings: LocalDockerSettings, publicKey: string | null, options: { mirrored: boolean }): ManualStep[] {
    const reverse = settings.mode === "reverse"
    const packages = `openssh-server${reverse ? " autossh" : ""}`
    const key = publicKey?.trim() ?? "<gere a chave do servidor primeiro>"
    const steps: ManualStep[] = [
        { title: "Pacotes", description: `Instale ${packages.replace(" ", " e ")}.`, commands: ["sudo apt-get update", `sudo apt-get install -y --no-install-recommends ${packages}`] },
        {
            title: "Chave do servidor",
            description: "Autorize a chave pública do servidor no seu usuário do WSL.",
            commands: ["mkdir -p ~/.ssh && chmod 700 ~/.ssh && touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys", `grep -qxF ${quote(key)} ~/.ssh/authorized_keys || echo ${quote(key)} >> ~/.ssh/authorized_keys`],
        },
        { title: "Docker sem sudo", description: "O Docker precisa responder sem sudo (usuário no grupo docker).", commands: ["docker version --format '{{.Server.Version}}'", "sudo usermod -aG docker $USER  # se o comando acima falhar"] },
        {
            title: "WSL",
            description: `Ligue o systemd em /etc/wsl.conf e, no %USERPROFILE%\\.wslconfig do Windows, [wsl2] vmIdleTimeout=-1${options.mirrored ? " e networkingMode=mirrored" : ""}; depois rode "wsl --shutdown" no Windows.`,
            commands: ["printf '\\n[boot]\\nsystemd=true\\n' | sudo tee -a /etc/wsl.conf"],
        },
    ]
    if (reverse) {
        steps.push(
            { title: "Acesso ao servidor", description: `O WSL precisa entrar em ${settings.serverSshHost} sem senha (chave no ~/.ssh/config).`, commands: [`ssh -o BatchMode=yes ${settings.serverSshHost} true`] },
            {
                title: "Túnel de controle",
                description: `Serviço systemd ${LOCAL_DOCKER_CONTROL_SERVICE} que publica o SSH do PC na porta ${settings.controlPort} do servidor (o script cria o arquivo da unit).`,
                commands: [`autossh -M 0 -N -o ServerAliveInterval=30 -o ExitOnForwardFailure=yes -o BatchMode=yes -R ${settings.controlPort}:localhost:22 ${settings.serverSshHost}`, `sudo systemctl enable --now ssh ${LOCAL_DOCKER_CONTROL_SERVICE}`],
            },
        )
    } else {
        steps.push({ title: "SSH", description: "Ligue o servidor SSH do WSL.", commands: ["sudo systemctl enable --now ssh"] })
    }
    return steps
}
