import { OPENCODE_RESOURCE_KINDS, type OpencodeResourceKind } from "./constants"

/**
 * Id estável de um recurso: base64url de `[tipo, escopo, nome]`. Vai na URL e nas ferramentas do
 * Agente Opex; não carrega segredo.
 */

export interface ResourceKey {
    kind: OpencodeResourceKind
    scope: string
    name: string
}

const toBase64Url = (text: string) => Buffer.from(text, "utf8").toString("base64url")
const fromBase64Url = (text: string) => Buffer.from(text, "base64url").toString("utf8")

export function encodeResourceId(key: ResourceKey): string {
    return toBase64Url(JSON.stringify([key.kind, key.scope, key.name]))
}

/** `null` quando o id não é válido. */
export function decodeResourceId(id: string): ResourceKey | null {
    try {
        const parsed: unknown = JSON.parse(fromBase64Url(id))
        if (!Array.isArray(parsed) || parsed.length !== 3) return null
        const [kind, scope, name] = parsed as unknown[]
        if (typeof kind !== "string" || !(OPENCODE_RESOURCE_KINDS as readonly string[]).includes(kind)) return null
        if (typeof scope !== "string" || !scope || typeof name !== "string" || !name) return null
        return { kind: kind as OpencodeResourceKind, scope, name }
    } catch {
        return null
    }
}
