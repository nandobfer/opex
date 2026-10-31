import { format, isValid, parse } from "date-fns"
import type { CheckBranch } from "@/lib/check-tree"
import { buildOpexToolTree, type OpexToolMetaDto } from "@/features/opex-agent/tool-tree"
import { toolNeedsDestructiveScope } from "./scopes"
import type { ApiTokenScopeCatalogDto } from "./types"

/**
 * Apoio PURO da tela de escopos dos tokens: árvores do seletor de ferramentas e conversão da data de
 * expiração (o `DatePicker` usa `yyyy-MM-dd`; a API recebe ISO, fim do dia no fuso do navegador).
 */

/** Árvore das ferramentas (um módulo por grupo): sensível = exige o escopo destrutivo pelo token. */
export function buildTokenToolTree(tools: readonly OpexToolMetaDto[]): CheckBranch[] {
    const byName = new Map(tools.map((tool) => [tool.name, tool]))
    return buildOpexToolTree(tools).map((branch) => {
        const children = branch.children.map((leaf) => {
            const meta = "key" in leaf ? byName.get(leaf.key) : undefined
            return meta && toolNeedsDestructiveScope(meta) ? { ...leaf, sensitive: true } : leaf
        })
        return { ...branch, children, ...(children.some((leaf) => leaf.sensitive) ? { sensitive: true } : {}) }
    })
}

/** Árvore dos grupos (um módulo só, uma folha por grupo) para a concessão por grupo. */
export function buildTokenGroupTree(catalog: Pick<ApiTokenScopeCatalogDto, "groups" | "tools">): CheckBranch[] {
    const count = (id: string) => catalog.tools.filter((tool) => tool.group === id).length
    return [
        {
            id: "token-groups",
            label: "Grupos de ferramentas",
            description: "Ferramentas novas de um grupo marcado entram sozinhas",
            ...(catalog.tools.some(toolNeedsDestructiveScope) ? { sensitive: true } : {}),
            children: catalog.groups.map((group) => ({
                key: group.id,
                label: `${group.label} (${count(group.id)})`,
                description: group.description,
                ...(catalog.tools.some((tool) => tool.group === group.id && toolNeedsDestructiveScope(tool)) ? { sensitive: true } : {}),
            })),
        },
    ]
}

/** `yyyy-MM-dd` → ISO do fim desse dia (fuso do navegador); vazio = sem expiração. */
export function expiryFromDate(value: string): string | null {
    if (!value) return null
    const day = parse(value, "yyyy-MM-dd", new Date())
    if (!isValid(day)) return null
    day.setHours(23, 59, 59, 999)
    return day.toISOString()
}

/** ISO da expiração → `yyyy-MM-dd` do `DatePicker`. */
export function dateFromExpiry(value: string | null | undefined): string {
    if (!value) return ""
    const date = new Date(value)
    return isValid(date) ? format(date, "yyyy-MM-dd") : ""
}
