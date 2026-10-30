/**
 * Comandos executados por SSH no host do OpenCode (exceção à regra de Ambientes: só o ciclo de vida do
 * serviço). Funções puras; o executável e a versão passam por `quote` — nunca texto livre.
 */

export const quote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`

/** Prefixo que põe a pasta do executável no PATH (instalação por nvm/npm precisa do `node` ao lado). */
export function withBin(bin: string, args: string): string {
    const dir = bin.includes("/") ? bin.replace(/\/[^/]*$/, "") : ""
    return `${dir ? `PATH=${quote(dir)}:"$PATH" ` : ""}${quote(bin)} ${args}`
}

export const serviceCommand = (bin: string, action: "start" | "stop" | "restart" | "status") => withBin(bin, `service ${action}`)

export function upgradeCommand(bin: string, version: string): string {
    if (!/^\d+\.\d+\.\d+([-.][0-9A-Za-z.-]+)?$/.test(version)) throw new Error("Versão inválida")
    return `${withBin(bin, `upgrade ${quote(version)}`)} && ${serviceCommand(bin, "restart")}`
}

export const versionCommand = (bin: string) => withBin(bin, "--version")

/** Processo do serviço (`opencode serve --service`) vivo? Imprime o pid. */
export const servicePidCommand = () => `pgrep -u "$(id -u)" -f '[o]pencode.* serve --service' | head -n 1`

export const uptimeCommand = (pid: number) => `ps -o etimes= -p ${Math.trunc(pid)}`

export function logsCommand(lines: number): string {
    const n = Math.max(1, Math.min(1000, Math.trunc(lines)))
    return `tail -n ${n} "$HOME/.local/share/opencode/log/opencode.log" 2>/dev/null || true`
}

/** Executável do opencode no PATH do processo do OpenCode (shell da API). */
export const detectBinCommand = () => `command -v opencode`

/** Tira cores ANSI e linhas que parecem segredo (senha, token, chave). */
export function sanitizeLogs(text: string): string {
    return text
        .replace(/\u001b\[[0-9;]*[A-Za-z]/g, "")
        .split("\n")
        .map((line) => (/(password|passwd|secret|token|api[_-]?key|authorization)\s*[=:]/i.test(line) ? "[linha omitida: pode conter segredo]" : line))
        .join("\n")
        .trimEnd()
}
