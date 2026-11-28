import { isMap, parseDocument, YAMLMap, YAMLSeq, type Document, type Tags } from "yaml"

/**
 * YAML avançado dos serviços (OPE-211): o conteúdo do bloco `services:` do override (serviço → chaves),
 * puro e igual na tela e no servidor. As tags do compose `!reset` e `!override` são aceitas.
 */
export const OVERRIDE_YAML_MAX_BYTES = 64 * 1024

/** Chaves que o Opex controla no override (variáveis extras, limites e o build). */
export const OVERRIDE_YAML_FORBIDDEN_KEYS = ["env_file", "build", "deploy", "mem_limit", "memswap_limit", "cpus"] as const

const SERVICE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$/

/** Tags do compose (`!reset`/`!override`) para ler e gravar o override sem perder o significado. */
export const COMPOSE_TAGS: Tags = [
    { tag: "!reset", resolve: (value: string) => (value === "" || value === "null" || value === "~" ? null : value), identify: () => false },
    { tag: "!override", resolve: (value: string) => value, identify: () => false },
    { tag: "!reset", collection: "seq", nodeClass: YAMLSeq, identify: () => false },
    { tag: "!reset", collection: "map", nodeClass: YAMLMap, identify: () => false },
    { tag: "!override", collection: "seq", nodeClass: YAMLSeq, identify: () => false },
    { tag: "!override", collection: "map", nodeClass: YAMLMap, identify: () => false },
]

export interface OverrideYamlProblem {
    message: string
    line?: number
}

const bytes = (value: string) => new TextEncoder().encode(value).length

/** Documento do YAML avançado (`null` = vazio). Erros de sintaxe ficam em `errors`. */
export function parseOverrideYaml(content: string): Document | null {
    if (!content.trim()) return null
    return parseDocument(content, { customTags: COMPOSE_TAGS })
}

/** Problema do YAML avançado (`null` = ok, inclusive vazio). */
export function overrideYamlProblem(content: string): OverrideYamlProblem | null {
    if (!content.trim()) return null
    if (bytes(content) > OVERRIDE_YAML_MAX_BYTES) return { message: "O YAML avançado passa de 64 KB" }
    const doc = parseOverrideYaml(content)!
    const error = doc.errors[0]
    if (error) {
        const line = error.linePos?.[0]?.line
        return { message: line ? `YAML inválido na linha ${line}: ${error.message.split("\n")[0]}` : `YAML inválido: ${error.message.split("\n")[0]}`, ...(line ? { line } : {}) }
    }
    if (!isMap(doc.contents)) return { message: "O YAML avançado deve ser um mapa de serviços (serviço: chaves), como o bloco services: do compose" }
    for (const pair of doc.contents.items) {
        const name = String((pair.key as { value?: unknown } | null)?.value ?? pair.key)
        if (!SERVICE_NAME.test(name)) return { message: `Nome de serviço inválido no YAML avançado: ${name}` }
        if (!isMap(pair.value)) return { message: `No YAML avançado, ${name} deve ter as chaves do serviço (mapa)` }
        for (const item of pair.value.items) {
            const key = String((item.key as { value?: unknown } | null)?.value ?? item.key)
            if ((OVERRIDE_YAML_FORBIDDEN_KEYS as readonly string[]).includes(key)) return { message: `${name}.${key} não pode ir no YAML avançado: o Opex controla essa chave (variáveis extras, limites ou build)` }
        }
    }
    return null
}

/** Chaves de cada serviço no YAML avançado (vazio quando o YAML é vazio ou inválido). */
export function overrideYamlKeys(content: string): Record<string, string[]> {
    const doc = parseOverrideYaml(content)
    if (!doc || doc.errors.length || !isMap(doc.contents)) return {}
    const result: Record<string, string[]> = {}
    for (const pair of doc.contents.items) {
        if (!isMap(pair.value)) continue
        const name = String((pair.key as { value?: unknown } | null)?.value ?? pair.key)
        result[name] = pair.value.items.map((item) => String((item.key as { value?: unknown } | null)?.value ?? item.key))
    }
    return result
}

/** Nós de cada serviço do YAML avançado (para o merge no override). */
export function overrideYamlServices(content: string): Map<string, YAMLMap> {
    const doc = parseOverrideYaml(content)
    const result = new Map<string, YAMLMap>()
    if (!doc || doc.errors.length || !isMap(doc.contents)) return result
    for (const pair of doc.contents.items) {
        if (isMap(pair.value)) result.set(String((pair.key as { value?: unknown } | null)?.value ?? pair.key), pair.value)
    }
    return result
}
