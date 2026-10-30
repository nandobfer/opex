"use client"

import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { AlertTriangle, CheckCircle2, CircleDashed, Pencil, Trash2, Users } from "lucide-react"
import { IconAction } from "@/components/ui/icon-action"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { OPEX_MCP_TRANSPORT_LABELS, safeMcpUrl, type OpexMcpServerDto } from "../../../mcp"

interface OpexMcpServerItemProps {
    server: OpexMcpServerDto
    onToggle: (enabled: boolean) => void
    onEdit: () => void
    onDelete: () => void
}

function endpointOf(server: OpexMcpServerDto): string {
    if (server.transport === "stdio") return [server.command, ...server.args].join(" ")
    return safeMcpUrl(server.url) || server.url
}

/** Situação da última conexão (turno do agente, teste ou ferramenta). */
function McpStatus({ server }: { server: OpexMcpServerDto }) {
    if (server.lastError) {
        return (
            <p className="flex items-start gap-1.5 text-xs text-destructive" role="status">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> Falha na última conexão: {server.lastError}
            </p>
        )
    }
    if (server.lastCheckedAt) {
        return (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
                <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden /> Conectado {formatDistanceToNow(new Date(server.lastCheckedAt), { addSuffix: true, locale: ptBR })} · {server.tools.length}{" "}
                {server.tools.length === 1 ? "ferramenta" : "ferramentas"}
            </p>
        )
    }
    return (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
            <CircleDashed className="h-3.5 w-3.5" aria-hidden /> Ainda não conectado{server.tools.length ? ` · ${server.tools.length} ferramentas no último teste` : ""}
        </p>
    )
}

/** Linha de um MCP: identificação, endereço/comando, situação, clientes e ações. */
export function OpexMcpServerItem({ server, onToggle, onEdit, onDelete }: OpexMcpServerItemProps) {
    const switchId = `opex-mcp-enabled-${server.id}`
    return (
        <div className={cn("flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3 transition-opacity", !server.enabled && "opacity-70")}>
            <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{server.name}</span>
                    <code className="text-[11px] text-muted-foreground">mcp_{server.slug}_*</code>
                    <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{OPEX_MCP_TRANSPORT_LABELS[server.transport]}</span>
                    {server.clientCount > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            <Users className="h-3 w-3" aria-hidden /> {server.clientCount} {server.clientCount === 1 ? "cliente" : "clientes"}
                        </span>
                    )}
                </div>
                {server.description && <p className="text-sm text-muted-foreground">{server.description}</p>}
                <p className="truncate font-mono text-xs text-muted-foreground" title={endpointOf(server)}>
                    {endpointOf(server)}
                </p>
                <McpStatus server={server} />
            </div>
            <div className="flex items-center gap-1">
                <label htmlFor={switchId} className="mr-1 text-xs text-muted-foreground">
                    {server.enabled ? "Habilitado" : "Desabilitado"}
                </label>
                <Switch id={switchId} checked={server.enabled} onCheckedChange={onToggle} aria-label={`${server.name}: habilitado`} />
                <IconAction label="Editar" icon={Pencil} onClick={onEdit} />
                <IconAction label="Excluir" icon={Trash2} tone="danger" onClick={onDelete} />
            </div>
        </div>
    )
}
