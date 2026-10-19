"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Ban, ShieldCheck } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { ToggleRow } from "@/components/ui/toggle-card"
import { OPEX_CLIENT_CONTEXT_TOOL, OPEX_CLIENT_TOOL_GROUPS, OPEX_CLIENT_TOOL_GROUP_LABELS, OPEX_CLIENT_TOOLS, type OpexClientToolGroup } from "../../../client-tools"
import { cn } from "@/lib/utils"

interface ClienteOpexToolsCardProps {
    value: readonly string[]
    onChange: (next: string[]) => void
}

const RISK_LABEL: Record<string, string> = { read: "Leitura", write: "Alteração", destructive: "Destrutiva" }

/**
 * Seleção, ferramenta a ferramenta, do que o Agente Opex pode usar no portal. Contexto fica sempre
 * ligado; cada grupo tem a caixa "todas" (estado intermediário quando só parte está marcada). As de
 * admin só chegam ao admin do cliente, mesmo marcadas.
 */
export function ClienteOpexToolsCard({ value, onChange }: ClienteOpexToolsCardProps) {
    const selected = new Set(value)
    const groups = OPEX_CLIENT_TOOL_GROUPS.filter((group) => group !== "context")

    const toggleTool = (name: string, checked: boolean) => {
        const next = new Set(selected)
        if (checked) next.add(name)
        else next.delete(name)
        onChange([...next])
    }

    const toggleGroup = (group: OpexClientToolGroup, checked: boolean) => {
        const names = OPEX_CLIENT_TOOLS.filter((tool) => tool.group === group && tool.name !== OPEX_CLIENT_CONTEXT_TOOL).map((tool) => tool.name)
        const next = new Set(selected)
        for (const name of names) {
            if (checked) next.add(name)
            else next.delete(name)
        }
        onChange([...next])
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Ferramentas do cliente</CardTitle>
                <CardDescription>
                    Escolha o que o agente pode usar no portal. Toda consulta e ação continua limitada ao cliente e ao papel do usuário no servidor, mesmo com a ferramenta ligada.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                <ToggleRow
                    id="opex-client-context"
                    label="Contexto"
                    description="Visão geral do portal (cliente, usuário, papel e repositórios) — sempre disponível."
                    disabled
                    right={
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400">Sempre ativo</span>
                            <Checkbox checked disabled aria-label="Contexto sempre ativo" />
                        </div>
                    }
                />

                {groups.map((group) => {
                    const meta = OPEX_CLIENT_TOOL_GROUP_LABELS[group]
                    const tools = OPEX_CLIENT_TOOLS.filter((tool) => tool.group === group)
                    const selectedCount = tools.filter((tool) => selected.has(tool.name)).length
                    const all = selectedCount === tools.length
                    const some = selectedCount > 0 && !all
                    return (
                        <section key={group} className="space-y-2">
                            <ToggleRow
                                id={`opex-client-group-${group}`}
                                label={
                                    <span className="flex flex-wrap items-center gap-1.5">
                                        {meta.label} ({selectedCount}/{tools.length})
                                        {meta.adminOnly && (
                                            <Badge variant="outline" className="gap-1 text-[10px] font-medium">
                                                <ShieldCheck className="h-3 w-3" aria-hidden /> Só admin do cliente
                                            </Badge>
                                        )}
                                    </span>
                                }
                                description={meta.description}
                                right={<Checkbox checked={all} indeterminate={some} aria-label={`Marcar todas as ferramentas de ${meta.label}`} onCheckedChange={(checked) => toggleGroup(group, checked)} />}
                            />
                            <div className="grid gap-1.5 md:grid-cols-2">
                                {tools.map((tool) => (
                                    <label
                                        key={tool.name}
                                        htmlFor={`opex-client-tool-${tool.name}`}
                                        className={cn(
                                            "flex cursor-pointer items-start gap-2 rounded-lg border border-transparent px-2 py-1.5 transition-colors hover:border-border hover:bg-muted/40",
                                            selected.has(tool.name) && "border-border/60",
                                        )}
                                    >
                                        <Checkbox
                                            id={`opex-client-tool-${tool.name}`}
                                            className="mt-0.5"
                                            checked={selected.has(tool.name)}
                                            onCheckedChange={(checked) => toggleTool(tool.name, checked)}
                                        />
                                        <span className="min-w-0 space-y-0.5">
                                            <span className="flex flex-wrap items-center gap-1.5 text-sm">
                                                {tool.label}
                                                <span className={cn("text-[10px] uppercase tracking-wide", tool.risk === "read" ? "text-muted-foreground" : tool.risk === "write" ? "text-warning" : "text-destructive")}>
                                                    {RISK_LABEL[tool.risk]}
                                                </span>
                                            </span>
                                            <span className="block text-xs text-muted-foreground">{tool.hint}</span>
                                        </span>
                                    </label>
                                ))}
                            </div>
                            <AnimatePresence initial={false}>
                                {!some && !all && (
                                    <motion.p
                                        key={`${group}-off`}
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: "auto" }}
                                        exit={{ opacity: 0, height: 0 }}
                                        transition={{ duration: 0.18 }}
                                        className="flex items-center gap-1.5 overflow-hidden pl-2 text-xs text-muted-foreground"
                                    >
                                        <Ban className="h-3 w-3 shrink-0" aria-hidden /> Nenhuma ferramenta deste grupo fica disponível.
                                    </motion.p>
                                )}
                            </AnimatePresence>
                        </section>
                    )
                })}
            </CardContent>
        </Card>
    )
}
