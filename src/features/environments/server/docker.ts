import { stringify as stringifyYaml } from "yaml"
import { shellQuote, type CommandResult, type EnvironmentHost, type RunOptions } from "./runner"
import {
    DOCKER_PS_FORMAT,
    parseComposePsOutput,
    parseDockerImagesOutput,
    parseDockerLogLines,
    parseDockerPsLabels,
    type ParsedContainer,
    type ParsedImage,
    type ParsedProjectContainer,
} from "../parsers"
import type { ComposeSummary } from "../compose-types"

/**
 * Comandos Docker/Compose do módulo Ambientes. Os **construtores de comando são puros** (testáveis)
 * e a execução passa pelo `EnvironmentHost` (local via OpenCode, remoto via SSH).
 *
 * O isolamento de uma publicação nova é por projeto Compose (`-p <slug-repo>-<slug-ambiente>`) e um
 * override fora do checkout define imagem, porta, recursos e variáveis. Mas **status, logs e
 * descoberta** usam `docker ps`/`docker logs` por **label de projeto**, o que funciona tanto para o
 * projeto criado pelo Opex quanto para um projeto **já em execução** adotado pelo ambiente — sem
 * exigir o override nem o arquivo do compose.
 */

export interface ComposeInvocation {
    projectName: string
    composeFile: string
    overrideFile?: string | null
}

/** Prefixo do comando compose com projeto e arquivos (`-p` + `-f` base + `-f` override). */
export function composeCommand(invocation: ComposeInvocation): string {
    const files = [invocation.composeFile, ...(invocation.overrideFile ? [invocation.overrideFile] : [])]
    return `docker compose -p ${shellQuote(invocation.projectName)} ${files.map((file) => `-f ${shellQuote(file)}`).join(" ")}`
}

/** Porta do container: primeiro mapeamento publicado do serviço (`"3000:3000"` ou `"3000"`). */
export function inferContainerPort(summary: ComposeSummary, service: string | null): number | null {
    const target = service ? summary.services.find((item) => item.name === service) : summary.services[0]
    if (!target || target.ports.length === 0) return null
    const first = target.ports[0].replace(/\/.*$/, "").replace(/^[0-9.]+:/, "")
    const parts = first.split(":").filter(Boolean)
    const port = Number(parts[parts.length - 1])
    return Number.isInteger(port) && port > 0 && port <= 65_535 ? port : null
}

export interface ComposeOverrideInput {
    service: string
    image?: string | null
    publishedPort?: number | null
    containerPort?: number | null
    cpus?: number | null
    memoryMb?: number | null
}

/** Conteúdo do override do Compose (fora do checkout), com imagem, porta e limites. */
export function buildComposeOverride(input: ComposeOverrideInput): string {
    const service: Record<string, unknown> = {}
    if (input.image) service.image = input.image
    if (input.publishedPort && input.containerPort) service.ports = [`${input.publishedPort}:${input.containerPort}`]
    if (input.cpus || input.memoryMb) {
        service.deploy = {
            resources: {
                limits: {
                    ...(input.cpus ? { cpus: String(input.cpus) } : {}),
                    ...(input.memoryMb ? { memory: `${input.memoryMb}M` } : {}),
                },
            },
        }
    }
    return stringifyYaml({ services: { [input.service]: service } })
}

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------

export interface GitSyncInput {
    repoUrl: string
    branch: string
    directory: string
}

/**
 * Clona (se preciso) ou atualiza o repositório e devolve o SHA publicado. Num checkout existente
 * **não** descarta alterações locais às cegas: exige a árvore limpa (o `.env` não é versionado e
 * permanece); havendo alterações, o comando falha com mensagem clara.
 */
export async function gitSync(host: EnvironmentHost, input: GitSyncInput, options: RunOptions = {}): Promise<{ result: CommandResult; commitSha: string | null }> {
    const dir = shellQuote(input.directory)
    const url = shellQuote(input.repoUrl)
    const branch = shellQuote(input.branch)
    const command =
        `if [ -d ${dir}/.git ]; then ` +
        `git -C ${dir} fetch --prune origin ${branch} && ` +
        `git -C ${dir} diff --quiet && git -C ${dir} diff --cached --quiet && ` +
        `git -C ${dir} checkout -f ${branch} && git -C ${dir} reset --hard origin/${branch}; ` +
        `else mkdir -p "$(dirname ${dir})" && git clone --branch ${branch} --single-branch ${url} ${dir}; fi; ` +
        `git -C ${dir} rev-parse HEAD`
    const result = await host.run(command, options)
    const commitSha = result.exitCode === 0 ? (result.output.split("\n").find((line) => /^[a-f0-9]{40}$/.test(line.trim()))?.trim() ?? null) : null
    return { result, commitSha }
}

export function buildCommand(invocation: ComposeInvocation, envFile?: string | null): string {
    const env = envFile ? ` --env-file ${shellQuote(envFile)}` : ""
    return `${composeCommand(invocation)}${env} build`
}

export function upCommand(invocation: ComposeInvocation, service?: string | null): string {
    return `${composeCommand(invocation)} up -d --no-build --pull never${service ? ` ${shellQuote(service)}` : ""}`
}

export function psCommand(invocation: ComposeInvocation): string {
    return `${composeCommand(invocation)} ps --format json`
}

export function imagesCommand(projectName: string): string {
    return `docker images --format '{{json .}}' --filter label=com.docker.compose.project=${shellQuote(projectName)}`
}

/** Todos os containers (inclusive parados) com a identidade do projeto Compose, numa única chamada. */
export function listContainersCommand(): string {
    return `docker ps -a --no-trunc --format '${DOCKER_PS_FORMAT}'`
}

/** Container do serviço (`docker compose` nomeia `<projeto>-<serviço>-<n>`), para logs. */
export function logsCommand(invocation: ComposeInvocation, options: { service?: string | null; since?: string; tail?: number }): string {
    const since = options.since ? ` --since ${shellQuote(options.since)}` : ` --tail ${options.tail ?? 200}`
    return `${composeCommand(invocation)} logs --no-color --timestamps${since}${options.service ? ` ${shellQuote(options.service)}` : ""}`
}

/** Logs de um **container específico** (funciona também para projeto adotado, sem o compose). */
export function containerLogsCommand(container: string, options: { since?: string; tail?: number } = {}): string {
    const range = options.since ? ` --since ${shellQuote(options.since)}` : ` --tail ${options.tail ?? 200}`
    return `docker logs --timestamps${range} ${shellQuote(container)}`
}

export async function composeBuild(host: EnvironmentHost, invocation: ComposeInvocation, options: RunOptions & { envFile?: string | null } = {}): Promise<CommandResult> {
    return host.run(buildCommand(invocation, options.envFile), options)
}

export async function composeUp(host: EnvironmentHost, invocation: ComposeInvocation, options: RunOptions & { service?: string | null } = {}): Promise<CommandResult> {
    return host.run(upCommand(invocation, options.service), options)
}

export async function composePs(host: EnvironmentHost, invocation: ComposeInvocation, options: RunOptions = {}): Promise<ParsedContainer[]> {
    const result = await host.run(psCommand(invocation), options)
    return result.exitCode === 0 ? parseComposePsOutput(result.output) : []
}

export async function listProjectImages(host: EnvironmentHost, projectName: string, options: RunOptions = {}): Promise<ParsedImage[]> {
    const result = await host.run(imagesCommand(projectName), options)
    return result.exitCode === 0 ? parseDockerImagesOutput(result.output) : []
}

/** Containers (com labels do projeto Compose) do host. Lista vazia quando o comando falha. */
export async function listHostContainers(host: EnvironmentHost, options: RunOptions = {}): Promise<ParsedProjectContainer[]> {
    const result = await host.run(listContainersCommand(), options)
    return result.exitCode === 0 ? parseDockerPsLabels(result.output) : []
}

/** Logs de um container específico já interpretados (`ts` + texto). */
export async function fetchContainerLogs(
    host: EnvironmentHost,
    container: string,
    options: RunOptions & { since?: string; tail?: number } = {},
): Promise<{ ts: string | null; text: string }[]> {
    const result = await host.run(containerLogsCommand(container, { since: options.since, tail: options.tail }), options)
    if (result.exitCode !== 0) return []
    return parseDockerLogLines(result.output)
}
