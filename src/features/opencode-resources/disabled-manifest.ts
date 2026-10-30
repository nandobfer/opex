import { z } from "zod"
import { OPENCODE_DISABLED_DIR, OPENCODE_RESOURCE_KINDS, type OpencodeResourceKind } from "./constants"

/**
 * Itens desligados sem remover: o arquivo/pasta vai para `~/.config/opencode/.opex-disabled/...` e a
 * entrada do JSON (plugins, agentes e comandos do config) fica guardada aqui. O manifesto mora no host,
 * ao lado dos itens — sobrevive à perda do banco do Opex. Módulo puro.
 */

const entrySchema = z.object({
    kind: z.enum(OPENCODE_RESOURCE_KINDS),
    scope: z.string(),
    name: z.string(),
    /** Item em arquivo: onde estava e para onde foi. */
    originalPath: z.string().nullable().default(null),
    storedPath: z.string().nullable().default(null),
    /** Item do JSON: arquivo de configuração e o valor removido dele. */
    configPath: z.string().nullable().default(null),
    configEntry: z.unknown().optional(),
    disabledAt: z.string(),
})
export type DisabledEntry = z.infer<typeof entrySchema>

const manifestSchema = z.object({ version: z.literal(1), entries: z.array(entrySchema) })
export type DisabledManifest = z.infer<typeof manifestSchema>

export const emptyManifest = (): DisabledManifest => ({ version: 1, entries: [] })

export function parseManifest(text: string | null): DisabledManifest {
    if (!text?.trim()) return emptyManifest()
    try {
        const parsed = manifestSchema.safeParse(JSON.parse(text))
        return parsed.success ? parsed.data : emptyManifest()
    } catch {
        return emptyManifest()
    }
}

export const serializeManifest = (manifest: DisabledManifest) => `${JSON.stringify(manifest, null, 2)}\n`

const same = (entry: DisabledEntry, kind: OpencodeResourceKind, scope: string, name: string) => entry.kind === kind && entry.scope === scope && entry.name === name

export function findDisabled(manifest: DisabledManifest, kind: OpencodeResourceKind, scope: string, name: string): DisabledEntry | undefined {
    return manifest.entries.find((entry) => same(entry, kind, scope, name))
}

export function withDisabled(manifest: DisabledManifest, entry: DisabledEntry): DisabledManifest {
    return { version: 1, entries: [...manifest.entries.filter((item) => !same(item, entry.kind, entry.scope, entry.name)), entry] }
}

export function withoutDisabled(manifest: DisabledManifest, kind: OpencodeResourceKind, scope: string, name: string): DisabledManifest {
    return { version: 1, entries: manifest.entries.filter((item) => !same(item, kind, scope, name)) }
}

export function disabledFor(manifest: DisabledManifest, kind: OpencodeResourceKind, scope: string): DisabledEntry[] {
    return manifest.entries.filter((entry) => entry.kind === kind && entry.scope === scope)
}

export const disabledRoot = (home: string) => `${home.replace(/\/+$/, "")}/${OPENCODE_DISABLED_DIR}`
export const manifestPath = (home: string) => `${disabledRoot(home)}/manifest.json`

/** Destino de um item em arquivo desligado. */
export function storedPathFor(home: string, scope: string, kind: OpencodeResourceKind, originalPath: string): string {
    const base = originalPath.replace(/\/+$/, "").split("/").at(-1) ?? "item"
    return `${disabledRoot(home)}/${scope.replace(/[^a-z0-9-]+/gi, "-")}/${kind}/${base}`
}
