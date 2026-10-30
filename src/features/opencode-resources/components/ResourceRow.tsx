"use client"

import { ArrowUpCircle, MoreHorizontal, Pencil, PlugZap, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
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

/** Uma linha da lista de recursos: nome, selos, versão, situação (MCP), liga/desliga e ações. */
export function ResourceRow({ item, actions, busy }: { item: OpencodeResourceDto; actions: ResourceRowActions; busy?: boolean }) {
    const ui = KIND_UI[item.kind]
    const version = item.version
    return (
        <div className={cn("flex items-start gap-3 px-4 py-3 transition-colors", !item.enabled && "opacity-70")}>
            <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-mono text-sm font-medium text-foreground">{item.name}</span>
                    <Badge variant="outline" className="text-[11px]">
                        {ORIGIN_LABEL[item.origin]}
                    </Badge>
                    {item.status ? (
                        <Badge variant={STATUS[item.status.state].variant} className="text-[11px]" title={item.status.error ?? undefined}>
                            {STATUS[item.status.state].label}
                        </Badge>
                    ) : null}
                    {version ? (
                        <span className={cn("font-mono text-[11px]", version.outdated ? "text-warning" : "text-muted-foreground")} title="Instalada → disponível">
                            {version.installed ?? "última"}
                            {version.available && version.available !== version.installed ? ` → ${version.available}` : ""}
                        </span>
                    ) : null}
                    {item.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-[11px] font-normal">
                            {tag}
                        </Badge>
                    ))}
                </div>
                {item.description ? <p className="line-clamp-2 text-xs text-muted-foreground">{item.description}</p> : null}
                {item.status?.error ? <p className="line-clamp-2 text-xs text-destructive">{item.status.error}</p> : null}
            </div>
            <div className="flex shrink-0 items-center gap-1">
                <Switch checked={item.enabled} disabled={item.builtin || busy} onCheckedChange={(checked) => actions.onToggle(item, checked)} aria-label={item.enabled ? `Desligar ${item.name}` : `Ligar ${item.name}`} />
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Ações de ${item.name}`} disabled={item.builtin && item.kind !== "mcp"}>
                            <MoreHorizontal className="h-4 w-4" aria-hidden />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        {item.editable && item.enabled ? (
                            <DropdownMenuItem onSelect={() => actions.onEdit(item)}>
                                <Pencil className="mr-2 h-4 w-4" aria-hidden /> Editar
                            </DropdownMenuItem>
                        ) : null}
                        {version?.outdated && item.enabled ? (
                            <DropdownMenuItem onSelect={() => actions.onUpdate(item)}>
                                <ArrowUpCircle className="mr-2 h-4 w-4" aria-hidden /> Atualizar
                            </DropdownMenuItem>
                        ) : null}
                        {item.kind === "mcp" ? (
                            <DropdownMenuItem onSelect={() => actions.onTest(item)}>
                                <PlugZap className="mr-2 h-4 w-4" aria-hidden /> Testar conexão
                            </DropdownMenuItem>
                        ) : null}
                        {item.removable ? (
                            <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => actions.onRemove(item)}>
                                    <Trash2 className="mr-2 h-4 w-4" aria-hidden /> {ui.removeVerb}
                                </DropdownMenuItem>
                            </>
                        ) : null}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    )
}
