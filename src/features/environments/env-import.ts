import { ENV_KEY_PATTERN } from "./schemas"

/** Variável lida de um conteúdo `.env`. */
export interface ImportedEnvVar {
    key: string
    value: string
}

export interface ParsedEnvText {
    entries: ImportedEnvVar[]
    /** Linhas sem `=` ou com nome fora do formato aceito (linhas em branco e comentários não contam). */
    ignored: number
}

/** Tira só o par de aspas (`"` ou `'`) que envolve o valor inteiro; o miolo fica literal. */
function unquote(value: string): string {
    if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value[value.length - 1] === value[0]) return value.slice(1, -1)
    return value
}

/**
 * Lê um conteúdo no formato `.env` (puro): um `CHAVE=VALOR` por linha; linha em branco e linha que
 * começa com `#` (com ou sem espaços antes) são ignoradas sem contar; o valor é tudo depois do
 * primeiro `=` (com `=`, `:`, `/`, espaços e `#` preservados), sem os espaços das pontas.
 */
export function parseEnvText(text: string): ParsedEnvText {
    const entries: ImportedEnvVar[] = []
    let ignored = 0
    for (const raw of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
        const line = raw.trim()
        if (!line || line.startsWith("#")) continue
        const equals = line.indexOf("=")
        const key = equals < 0 ? "" : line.slice(0, equals).trim()
        if (!key || !ENV_KEY_PATTERN.test(key)) {
            ignored++
            continue
        }
        entries.push({ key, value: unquote(line.slice(equals + 1).trim()) })
    }
    return { entries, ignored }
}

/** Variável do formulário (com `keep` quando o valor salvo não pôde ser lido). */
export interface FormEnvVar {
    key: string
    value: string
    keep?: boolean
}

/**
 * Upsert das variáveis importadas na lista do formulário (puro): a que já existe (inclusive uma
 * acrescentada antes no mesmo conteúdo) recebe o valor importado e conta como atualizada; a nova
 * entra no fim; nenhuma é removida.
 */
export function upsertEnvVars(current: FormEnvVar[], entries: ImportedEnvVar[]): { next: FormEnvVar[]; added: number; updated: number } {
    const next = current.map((item) => ({ ...item }))
    let added = 0
    let updated = 0
    for (const entry of entries) {
        const index = next.findIndex((item) => item.key.trim() === entry.key)
        if (index >= 0) {
            next[index] = { key: entry.key, value: entry.value }
            updated++
        } else {
            next.push({ key: entry.key, value: entry.value })
            added++
        }
    }
    return { next, added, updated }
}

/** Resumo da importação ("N variável(is) adicionada(s), M atualizada(s), K linha(s) ignorada(s)"). */
export const importSummary = (result: { added: number; updated: number; ignored: number }) =>
    `${result.added} variável(is) adicionada(s), ${result.updated} atualizada(s), ${result.ignored} linha(s) ignorada(s)`

export const NO_VARIABLES_FOUND = "Nenhuma variável encontrada"

/** Limite do arquivo importado (o formulário aceita no máximo 100 variáveis de até 10 mil caracteres). */
export const ENV_IMPORT_MAX_BYTES = 1024 * 1024
