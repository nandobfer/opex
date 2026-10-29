import { OPENCODE_QUOTA_CLI_GLOB, OPENCODE_QUOTA_DEFAULT_PATH, OPENCODE_QUOTA_EXPORT_MARKER, OPENCODE_QUOTA_MISSING_MARKER, OPENCODE_QUOTA_SNAPSHOT_MARKER } from "./constants"

/** Comandos (no host do OpenCode) que imprimem a quota do `opencode-quota`. */

const quote = (text: string) => `'${text.replace(/'/g, `'\\''`)}'`

/** Caminho customizado: absoluto ou em `~/`, sem quebra de linha nem NUL. */
export function isValidQuotaExportPath(path: string): boolean {
    return /^(\/|~\/)/.test(path) && !/[\n\r\0]/.test(path)
}

/** Expressão de shell do caminho: o padrão expande `$XDG_CACHE_HOME`/`$HOME`; o customizado vai entre aspas. */
function pathExpression(path: string | undefined): string {
    const custom = path?.trim()
    if (!custom) return `"${OPENCODE_QUOTA_DEFAULT_PATH}"`
    if (!isValidQuotaExportPath(custom)) throw new Error("Caminho do arquivo de quota inválido: use um caminho absoluto ou começando com ~/")
    return custom.startsWith("~/") ? `"$HOME"/${quote(custom.slice(2))}` : quote(custom)
}

/** Imprime o arquivo de export ou o marcador de ausente. */
export function quotaExportCommand(path?: string): string {
    return `f=${pathExpression(path)}; if [ -f "$f" ]; then cat "$f"; else echo ${OPENCODE_QUOTA_MISSING_MARKER}; fi`
}

/**
 * Prefere o snapshot do plugin (`opencode-quota show --json`, a última quota conhecida de cada
 * provedor, a mesma que o TUI desenha; não consulta provedores) pelo executável já instalado pelo
 * OpenCode, sem `npx`. Sem executável, sem `node` ou com falha, cai no arquivo de export. A primeira
 * linha diz a origem.
 */
export function quotaReadCommand(path?: string): string {
    const exportCommand = quotaExportCommand(path)
    return [
        `cd "$HOME" 2>/dev/null`,
        `b=$(ls -1t ${OPENCODE_QUOTA_CLI_GLOB} 2>/dev/null | head -n 1)`,
        `if [ -n "$b" ] && command -v node >/dev/null 2>&1 && s=$(node "$b" show --json 2>/dev/null); then echo ${OPENCODE_QUOTA_SNAPSHOT_MARKER}; printf '%s\\n' "$s"; else echo ${OPENCODE_QUOTA_EXPORT_MARKER}; ${exportCommand}; fi`,
    ].join("; ")
}
