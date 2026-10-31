import { ENV_EDITABLE_KEYS, ENV_MASK_EMPTY, ENV_MASK_SET, ENV_READ_ONLY_KEYS, ENV_WRITE_ONLY_KEYS } from "./constants"
import type { EnvEntryDto, EnvEntryKind } from "./types"

/**
 * Leitura e edição (puras) do `.env` do Engramind preservando comentários, linhas em branco, a ordem
 * e as variáveis desconhecidas. Os valores sensíveis chegam do host já trocados por marcadores
 * (`ENV_MASK_SET`/`ENV_MASK_EMPTY`) e são repostos lá mesmo na gravação: o segredo nunca passa pelo
 * servidor do Opex (exceto o novo valor de uma variável "só gravar", que vai direto para o host).
 */

export type EnvLine = { type: "entry"; key: string; value: string; raw: string } | { type: "other"; raw: string }

const ENTRY = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/

/** Valor sem aspas nem comentário de fim de linha (só fora de aspas). */
export function unquoteEnvValue(rawValue: string): string {
    const value = rawValue.trim()
    if (value.startsWith('"')) {
        const end = value.indexOf('"', 1)
        const inner = end > 0 ? value.slice(1, end) : value.slice(1)
        return inner.replace(/\\(["\\$])/g, "$1").replace(/\\n/g, "\n")
    }
    if (value.startsWith("'")) {
        const end = value.indexOf("'", 1)
        return end > 0 ? value.slice(1, end) : value.slice(1)
    }
    const hash = value.search(/\s#/)
    return (hash >= 0 ? value.slice(0, hash) : value).trim()
}

export function parseEnvFile(content: string): EnvLine[] {
    const lines = content.split("\n")
    if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop()
    return lines.map((raw) => {
        const match = ENTRY.exec(raw)
        if (!match) return { type: "other", raw }
        return { type: "entry", key: match[1]!, value: unquoteEnvValue(match[2] ?? ""), raw }
    })
}

/** Linha `KEY=valor`, com aspas duplas quando o valor tem espaço, `#`, aspas ou `$`. */
export function formatEnvEntry(key: string, value: string): string {
    if (/^[A-Za-z0-9_.,:/=@+%*-]*$/.test(value)) return `${key}=${value}`
    return `${key}="${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\$/g, "\\$").replace(/\n/g, "\\n")}"`
}

/** Aplica as mudanças no lugar (a última ocorrência da chave) e acrescenta no fim as que não existem. */
export function applyEnvChanges(content: string, changes: Readonly<Record<string, string>>): string {
    const lines = parseEnvFile(content)
    const lastIndex = new Map<string, number>()
    lines.forEach((line, index) => {
        if (line.type === "entry") lastIndex.set(line.key, index)
    })
    const out = lines.map((line) => line.raw)
    const appended: string[] = []
    for (const [key, value] of Object.entries(changes)) {
        const index = lastIndex.get(key)
        if (index === undefined) appended.push(formatEnvEntry(key, value))
        else out[index] = formatEnvEntry(key, value)
    }
    return [...out, ...appended].join("\n") + "\n"
}

const WRITE_ONLY: readonly string[] = ENV_WRITE_ONLY_KEYS
const READ_ONLY: readonly string[] = ENV_READ_ONLY_KEYS
const EDITABLE: readonly string[] = ENV_EDITABLE_KEYS

export function envKindOf(key: string): EnvEntryKind {
    if (READ_ONLY.includes(key)) return "read-only"
    if (WRITE_ONLY.includes(key)) return "write-only"
    if (EDITABLE.includes(key)) return "editable"
    return "unknown"
}

/** Entradas da tela a partir do conteúdo mascarado. Sensíveis: só configurada/não (nunca o valor). */
export function envEntriesOf(maskedContent: string): EnvEntryDto[] {
    const byKey = new Map<string, string>()
    for (const line of parseEnvFile(maskedContent)) if (line.type === "entry") byKey.set(line.key, line.value)
    const keys = [...EDITABLE, ...WRITE_ONLY, ...READ_ONLY, ...[...byKey.keys()].filter((key) => envKindOf(key) === "unknown")]
    return keys.map((key) => {
        const kind = envKindOf(key)
        const value = byKey.get(key)
        if (kind === "read-only" || kind === "write-only") return { key, kind, configured: value === ENV_MASK_SET || (value !== undefined && value !== ENV_MASK_EMPTY && value !== "") }
        return { key, kind, value: value ?? "" }
    })
}

/** Valores atuais (não sensíveis) do conteúdo mascarado. */
export function envValuesOf(maskedContent: string): Record<string, string> {
    const out: Record<string, string> = {}
    for (const line of parseEnvFile(maskedContent)) if (line.type === "entry" && envKindOf(line.key) !== "read-only" && envKindOf(line.key) !== "write-only") out[line.key] = line.value
    return out
}

export { ENV_MASK_EMPTY, ENV_MASK_SET }
