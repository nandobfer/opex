/**
 * Log de build da prévia (aba "Build (N)" da mesa). Módulo puro: cliente e servidor.
 *
 * O log de um build é a saída do comando que o app roda no host na etapa "Subindo a prévia" — o
 * `docker compose … up -d --build` (prévia Local) ou o script da prévia no GitHub Action — com uma
 * seção por execução (a primeira e cada uma depois de uma correção do agente).
 */

export const BUILD_STATUSES = ["running", "succeeded", "unhealthy", "failed", "interrupted"] as const
export type BuildStatus = (typeof BUILD_STATUSES)[number]

export const BUILD_STATUS_LABELS: Record<BuildStatus, string> = {
    running: "Em andamento",
    succeeded: "Concluído",
    unhealthy: "Prévia sem resposta",
    failed: "Falhou",
    interrupted: "Interrompido",
}

/** Build da mesa na aba "Build (N)" (sem o log, que vem pelo stream). */
export interface WorkbenchBuildDto {
    id: string
    number: number
    status: BuildStatus
    startedAt: string
    endedAt: string | null
    port: number | null
    local: boolean
    /** `local` = `docker compose` no host; `github` = script da prévia no GitHub Action. */
    method: "local" | "github"
    commands: string[]
    logChars: number
    droppedChars: number
    message: string | null
}

/** Teto do log gravado por build (acima disso guarda o final). */
export const BUILD_LOG_MAX_CHARS = 2_000_000

/** Linha do stream NDJSON do log de um build. `offset` = posição absoluta no log (conta o que foi descartado). */
export type BuildLogLine =
    | { type: "snapshot"; offset: number; text: string; status: BuildStatus; message: string | null }
    | { type: "append"; offset: number; text: string }
    | { type: "status"; status: BuildStatus; message: string | null }
    | { type: "ping"; ts: string }

/** Aplica o teto: mantém o final e soma o que saiu do início. */
export function capBuildLog(log: string, dropped: number, max = BUILD_LOG_MAX_CHARS): { log: string; dropped: number } {
    if (log.length <= max) return { log, dropped }
    const cut = log.length - max
    return { log: log.slice(cut), dropped: dropped + cut }
}

/** Cabeçalho de cada execução de comando no log (negrito, com a hora). */
export function buildSectionHeader(command: string, at: Date, first: boolean): string {
    const time = at.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "America/Sao_Paulo" })
    return `${first ? "" : "\n"}\x1b[1;35m$ ${command}\x1b[0m \x1b[90m(${time})\x1b[0m\n`
}

/** Fim de uma execução do comando no log: o código de saída (verde = 0). */
export function buildExitLine(exitCode: number | null): string {
    if (exitCode === 0) return "\n\x1b[32m✔ exit 0\x1b[0m\n"
    return `\n\x1b[31m✖ ${exitCode === null ? "o comando não terminou" : `exit ${exitCode}`}\x1b[0m\n`
}

/** Separador no log enquanto o agente prepara a prévia (dump do banco e/ou commit) antes do comando. */
export function buildPrepareSeparator(what: string): string {
    return `\x1b[90m— agente preparando a prévia (${what}) —\x1b[0m\n`
}

/**
 * Falha do build que não vai para a correção do agente (mensagem) ou `null` (o agente corrige):
 * 124 = o `timeout` do job estourou o limite do build; 137/143 = processo morto pelo sistema
 * (SIGKILL, ex.: falta de memória; SIGTERM).
 */
export function terminalBuildFailure(exitCode: number, timeoutMinutes: number): string | null {
    if (exitCode === 124) return `O build da prévia excedeu o tempo limite (${timeoutMinutes} min)`
    if (exitCode === 137) return "O build da prévia foi encerrado pelo sistema (exit 137: falta de memória ou SIGKILL)"
    if (exitCode === 143) return "O build da prévia foi encerrado pelo sistema (exit 143: SIGTERM)"
    return null
}

/** Separador no log enquanto o agente corrige o código entre duas execuções do build. */
export function buildFixSeparator(round: number): string {
    return `\n\x1b[90m— agente corrigindo o código (correção ${round}) —\x1b[0m\n`
}

/** Estado do log no navegador: `end` = posição absoluta do fim do que já foi escrito no terminal. */
export interface BuildLogViewState {
    loaded: boolean
    end: number
    status: BuildStatus | null
    message: string | null
}

export const INITIAL_BUILD_LOG_VIEW: BuildLogViewState = { loaded: false, end: 0, status: null, message: null }

/**
 * Aplica uma linha do stream. Devolve o novo estado e o que fazer no terminal: `reset` (limpar e
 * escrever o texto), `write` (anexar) ou `resync` (faltou um trecho: reconectar para um novo snapshot).
 */
export function applyBuildLogLine(state: BuildLogViewState, line: BuildLogLine): { state: BuildLogViewState; reset?: string; write?: string; resync?: true } {
    switch (line.type) {
        case "snapshot":
            return {
                state: { loaded: true, end: line.offset + line.text.length, status: line.status, message: line.message },
                reset: line.offset > 0 ? `${BUILD_LOG_TRUNCATED}${line.text}` : line.text,
            }
        case "append": {
            if (!state.loaded) return { state }
            if (line.offset > state.end) return { state, resync: true }
            const text = line.text.slice(state.end - line.offset)
            if (!text) return { state }
            return { state: { ...state, end: state.end + text.length }, write: text }
        }
        case "status":
            return { state: { ...state, status: line.status, message: line.message } }
        case "ping":
            return { state }
    }
}

/** Divide um pedaço NDJSON do stream do log em linhas completas e o resto. */
export function splitBuildLogChunk(buffer: string): { lines: BuildLogLine[]; rest: string } {
    const parts = buffer.split("\n")
    const rest = parts.pop() ?? ""
    const lines: BuildLogLine[] = []
    for (const part of parts) {
        if (!part.trim()) continue
        try {
            lines.push(JSON.parse(part) as BuildLogLine)
        } catch {
            // linha corrompida: ignora
        }
    }
    return { lines, rest }
}

const GITHUB_RUN_URL = /https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/actions\/runs\/\d+/g

/** Última URL de execução do GitHub Actions no trecho do log (o script da prévia remota a imprime). */
export function lastGithubRunUrl(text: string): string | null {
    const found = text.match(GITHUB_RUN_URL)
    return found ? found[found.length - 1]! : null
}

/** Aviso exibido quando o início do log foi descartado pelo teto. */
export const BUILD_LOG_TRUNCATED = "\x1b[90m…(início do log omitido)\x1b[0m\n"
