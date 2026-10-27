"use client"

import { useMemo } from "react"
import { ShieldCheck } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CheckTree } from "@/components/ui/check-tree/CheckTree"
import { cn } from "@/lib/utils"
import { buildOpexClientToolTree, findOpexClientTool, OPEX_CLIENT_CONTEXT_TOOL, OPEX_CLIENT_TOOL_GROUP_LABELS, type OpexClientToolGroup, type OpexClientToolRisk } from "../../../client-tools"

interface ClienteOpexToolsCardProps {
    value: readonly string[]
    onChange: (next: string[]) => void
}

const RISK_BADGES: Record<OpexClientToolRisk, { label: string; className: string }> = {
    read: { label: "Leitura", className: "bg-muted text-muted-foreground" },
    write: { label: "Altera", className: "bg-primary/10 text-primary" },
    destructive: { label: "Destrutiva", className: "bg-warning/15 text-warning" },
}

const LOCKED = new Set([OPEX_CLIENT_CONTEXT_TOOL])

function AdminOnlyBadge() {
    return (
        <Badge variant="outline" className="gap-1 text-[10px] font-medium">
            <ShieldCheck className="h-3 w-3" aria-hidden /> Só admin do cliente
        </Badge>
    )
}

function OptInBadge() {
    return (
        <Badge variant="outline" className="text-[10px] font-medium" title="Clientes existentes e novos começam sem estas ferramentas">
            Desligado por padrão
        </Badge>
    )
}

/**
 * Seleção, ferramenta a ferramenta, do que o Agente Opex pode usar no portal, na mesma árvore da
 * seleção do dono (`CheckTree`). Contexto fica sempre ligado; as de admin só chegam ao admin do
 * cliente, mesmo marcadas. Destrutivas sempre pedem confirmação no portal.
 */
export function ClienteOpexToolsCard({ value, onChange }: ClienteOpexToolsCardProps) {
    const tree = useMemo(() => buildOpexClientToolTree(), [])
    const selected = useMemo(() => new Set([...value, OPEX_CLIENT_CONTEXT_TOOL]), [value])

    const renderLeafMeta = (key: string) => {
        const tool = findOpexClientTool(key)
        if (!tool) return null
        const badge = RISK_BADGES[tool.risk]
        return (
            <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                <code className="text-[10px] text-muted-foreground">{tool.name}</code>
                <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", badge.className)}>{badge.label}</span>
                {tool.name === OPEX_CLIENT_CONTEXT_TOOL && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">Sempre ligada</span>}
                {tool.adminOnly && !OPEX_CLIENT_TOOL_GROUP_LABELS[tool.group].adminOnly && <AdminOnlyBadge />}
            </span>
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Ferramentas do cliente</CardTitle>
                <CardDescription>
                    Escolha o que o agente pode usar no portal. Toda consulta e ação continua limitada ao cliente e ao papel do usuário no servidor, mesmo com a ferramenta ligada. As destrutivas sempre
                    pedem Confirmar/Cancelar no chat.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <CheckTree
                    tree={tree}
                    selected={selected}
                    lockedKeys={LOCKED}
                    renderLeafMeta={renderLeafMeta}
                    renderModuleMeta={(id) => {
                        const group = OPEX_CLIENT_TOOL_GROUP_LABELS[id as OpexClientToolGroup]
                        if (group?.adminOnly) return <AdminOnlyBadge />
                        if (group?.optIn) return <OptInBadge />
                        return null
                    }}
                    searchPlaceholder="Buscar ferramenta..."
                    emptyText="Nenhuma ferramenta encontrada."
                    onChange={(next) => onChange([...next])}
                />
            </CardContent>
        </Card>
    )
}
