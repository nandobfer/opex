/**
 * Normaliza um documento (Mongoose ou lean) em snapshot para auditoria, removendo campos
 * técnicos. `allowList` fixa o formato. (Copiado do Smart Desk.)
 */
const EXCLUDED_KEYS = new Set(["_id", "__v", "_auditContext", "createdBy", "createdAt", "updatedBy", "updatedAt", "id"])

type AnyDoc = Record<string, unknown> & {
    toObject?: (opts?: { virtuals?: boolean }) => Record<string, unknown>
}

export function snapshotForAudit(
    doc: AnyDoc | null | undefined,
    allowList?: readonly string[],
): Record<string, unknown> | undefined {
    if (!doc) return undefined

    const plain: Record<string, unknown> =
        typeof doc.toObject === "function" ? doc.toObject({ virtuals: false }) : { ...(doc as Record<string, unknown>) }

    if (allowList) {
        const out: Record<string, unknown> = {}
        for (const key of allowList) {
            if (plain[key] !== undefined) out[key] = plain[key]
        }
        return out
    }

    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(plain)) {
        if (!EXCLUDED_KEYS.has(key)) out[key] = value
    }
    return out
}

/** Apenas os campos que mudaram entre dois snapshots (antes/depois). */
export function diffSnapshots(
    before: Record<string, unknown> | undefined,
    after: Record<string, unknown> | undefined,
): { antes: Record<string, unknown>; depois: Record<string, unknown> } {
    const antes: Record<string, unknown> = {}
    const depois: Record<string, unknown> = {}
    const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])
    for (const key of keys) {
        const a = before?.[key]
        const b = after?.[key]
        if (JSON.stringify(a) !== JSON.stringify(b)) {
            antes[key] = a
            depois[key] = b
        }
    }
    return { antes, depois }
}
