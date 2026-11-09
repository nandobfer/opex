"use client"

import { ArrowUpCircle, Pencil, PlugZap, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { ResourceRowFrame, ResourceVersionText, type ResourceRowAction } from "@/components/resources/ResourceRowFrame"
import type { McpRuntimeStatus, OpencodeResourceDto } from "../types"
import { KIND_UI } from "./kind-ui"

const STATUS: Record<McpRuntimeStatus, { label: string; variant: "success" | "warning" | "destructive" | "secondary" | "outline" }> = {
    connected: { label: "Conectado", variant: "success" },
    pending: { label: "Conectando", variant: "warning" },
    disabled: { label: "Desligado", variant: "secondary" },
    failed: { label: "Falhou", variant: "destructive" },
    needs_auth: { label: "Precisa de login", variant: "warning" },
    unknown: { label: "Sem situação", variant: "outline" },
}

const ORIGIN_LABEL: Record<OpencodeResourceDto["origin"], string> = { builtin: "Nativo", file: "Arquivo", config: "JSON", package: "Pacote", local: "Local" }

export interface ResourceRowActions {
    onToggle: (item: OpencodeResourceDto, enabled: boolean) => void
    onEdit: (item: OpencodeResourceDto) => void
    onRemove: (item: OpencodeResourceDto) => void
    onUpdate: (item: OpencodeResourceDto) => void
    onTest: (item: OpencodeResourceDto) => void
}

function rowActions(item: OpencodeResourceDto, actions: ResourceRowActions): ResourceRowAction[] {
    const list: ResourceRowAction[] = []
    if (item.editable && item.enabled) list.push({ key: "edit", label: "Editar", icon: Pencil, onSelect: () => actions.onEdit(item) })
    if (item.version?.outdated && item.enabled) list.push({ key: "update", label: "Atualizar", icon: ArrowUpCircle, onSelect: () => actions.onUpdate(item) })
    if (item.kind === "mcp") list.push({ key: "test", label: "Testar conexão", icon: PlugZap, onSelect: () => actions.onTest(item) })
    if (item.removable) list.push({ key: "remove", label: KIND_UI[item.kind].removeVerb, icon: Trash2, onSelect: () => actions.onRemove(item), destructive: true })
    return list
}

/** Uma linha da lista de recursos: nome, selos, versão, situação (MCP), liga/desliga e ações. */
export function ResourceRow({ item, actions, busy }: { item: OpencodeResourceDto; actions: ResourceRowActions; busy?: boolean }) {
    const version = item.version
    return (
        <ResourceRowFrame
            name={item.name}
            enabled={item.enabled}
            description={item.description}
            badges={
                <>
                    <Badge variant="outline" className="text-[11px]">
                        {ORIGIN_LABEL[item.origin]}
                    </Badge>
                    {item.status ? (
                        <Badge variant={STATUS[item.status.state].variant} className="text-[11px]" title={item.status.error ?? undefined}>
                            {STATUS[item.status.state].label}
                        </Badge>
                    ) : null}
                    {version ? <ResourceVersionText installed={version.installed} available={version.available} outdated={version.outdated} /> : null}
                    {item.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-[11px] font-normal">
                            {tag}
                        </Badge>
                    ))}
                </>
            }
            extra={item.status?.error ? <p className="line-clamp-2 text-xs text-destructive">{item.status.error}</p> : null}
            switchDisabled={item.builtin || busy}
            onToggle={(checked) => actions.onToggle(item, checked)}
            actions={rowActions(item, actions)}
            menuDisabled={item.builtin && item.kind !== "mcp"}
        />
    )
}
