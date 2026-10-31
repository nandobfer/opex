"use client"

import { useMemo } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { CheckTree } from "@/components/ui/check-tree/CheckTree"
import { OptionTabs } from "@/components/ui/option-tabs"
import type { ApiTokenScopeSelection, ToolGrantMode } from "../../api-tokens/scopes"
import { toolNeedsDestructiveScope } from "../../api-tokens/scopes"
import type { ApiTokenScopeCatalogDto } from "../../api-tokens/types"
import { buildTokenGroupTree, buildTokenToolTree } from "../../api-tokens/ui"
import { SensitiveToolBadge } from "./SensitiveToolBadge"

const MODES: { value: ToolGrantMode; label: string; title: string }[] = [
    { value: "all", label: "Todas", title: "Todas as ferramentas, inclusive as futuras" },
    { value: "groups", label: "Por grupo", title: "Grupos inteiros (ferramenta nova do grupo entra sozinha)" },
    { value: "tools", label: "Ferramentas", title: "Lista explícita (fixa)" },
]

const fade = { initial: { opacity: 0, y: 4 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 }, transition: { duration: 0.18 } }

interface ApiTokenToolsPickerProps {
    catalog: ApiTokenScopeCatalogDto
    selection: ApiTokenScopeSelection
    onChange: (next: ApiTokenScopeSelection) => void
}

/** Ferramentas do MCP do dono concedidas ao token: todas, por grupo ou lista explícita (com busca e "todas"). */
export function ApiTokenToolsPicker({ catalog, selection, onChange }: ApiTokenToolsPickerProps) {
    const toolTree = useMemo(() => buildTokenToolTree(catalog.tools), [catalog.tools])
    const groupTree = useMemo(() => buildTokenGroupTree(catalog), [catalog])
    const alwaysOn = useMemo(() => new Set(catalog.tools.filter((tool) => tool.alwaysOn).map((tool) => tool.name)), [catalog.tools])
    const byName = useMemo(() => new Map(catalog.tools.map((tool) => [tool.name, tool])), [catalog.tools])
    const sensitiveGroups = useMemo(() => new Set<string>(catalog.tools.filter(toolNeedsDestructiveScope).map((tool) => tool.group)), [catalog.tools])
    const selectedTools = useMemo(() => new Set([...selection.tools, ...alwaysOn]), [selection.tools, alwaysOn])

    return (
        <div className="space-y-3">
            <OptionTabs aria-label="Concessão de ferramentas" options={MODES} value={selection.toolMode} onChange={(toolMode) => onChange({ ...selection, toolMode })} className="w-full" />
            {selection.toolMode !== "all" && (
                <div className="flex justify-end gap-1">
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                            onChange(
                                selection.toolMode === "groups"
                                    ? { ...selection, groups: catalog.groups.map((group) => group.id) }
                                    : { ...selection, tools: catalog.tools.filter((tool) => !tool.alwaysOn).map((tool) => tool.name) },
                            )
                        }
                    >
                        Selecionar tudo
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => onChange(selection.toolMode === "groups" ? { ...selection, groups: [] } : { ...selection, tools: [] })}>
                        Limpar
                    </Button>
                </div>
            )}
            <AnimatePresence mode="wait" initial={false}>
                {selection.toolMode === "all" ? (
                    <motion.p key="all" {...fade} className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                        Todas as {catalog.tools.length} ferramentas do MCP do dono, inclusive as que forem adicionadas depois.
                    </motion.p>
                ) : selection.toolMode === "groups" ? (
                    <motion.div key="groups" {...fade}>
                        <CheckTree
                            tree={groupTree}
                            selected={new Set(selection.groups)}
                            onChange={(next) => onChange({ ...selection, groups: [...next] })}
                            searchPlaceholder="Buscar grupo..."
                            renderLeafMeta={(key) => (sensitiveGroups.has(key) ? <SensitiveToolBadge label="Tem destrutivas" /> : null)}
                        />
                    </motion.div>
                ) : (
                    <motion.div key="tools" {...fade}>
                        <CheckTree
                            tree={toolTree}
                            selected={selectedTools}
                            lockedKeys={alwaysOn}
                            onChange={(next) => onChange({ ...selection, tools: [...next].filter((name) => !alwaysOn.has(name)) })}
                            searchPlaceholder="Buscar ferramenta..."
                            renderLeafMeta={(key) => {
                                const meta = byName.get(key)
                                if (!meta) return null
                                if (meta.alwaysOn) return <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">Sempre liberada</span>
                                return toolNeedsDestructiveScope(meta) ? <SensitiveToolBadge /> : null
                            }}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
