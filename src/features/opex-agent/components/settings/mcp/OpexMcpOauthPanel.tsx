"use client"

import { useState } from "react"
import { KeyRound, Loader2, Unplug } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { OauthStatusBadge } from "@/components/ui/oauth-status-badge"
import type { OpexMcpServerDto } from "../../../mcp"
import { useDisconnectOpexMcpOauth, useStartOpexMcpOauth } from "../../../hooks/useOpexMcpServers"
import { oauthBadgeOf } from "./mcp-oauth-ui"

interface OpexMcpOauthPanelProps {
    server: OpexMcpServerDto
    /** O formulário tem alterações não salvas (autorizar usa o MCP salvo). */
    dirty: boolean
    disabled: boolean
}

/** Situação OAuth do MCP salvo, com Autorizar (vai ao provedor e volta) e Desconectar. */
export function OpexMcpOauthPanel({ server, dirty, disabled }: OpexMcpOauthPanelProps) {
    const start = useStartOpexMcpOauth()
    const disconnect = useDisconnectOpexMcpOauth()
    const [confirming, setConfirming] = useState(false)
    const oauth = server.oauth
    if (!oauth) return null
    const badge = oauthBadgeOf(oauth.status)
    const authorized = oauth.status === "authorized"

    const authorize = () => {
        if (dirty) {
            toast.error("Salve as alterações antes de autorizar: a autorização usa o MCP salvo.")
            return
        }
        start.mutate(server.id)
    }

    return (
        <div className="space-y-2 rounded-lg border p-3" data-testid="opex-mcp-oauth-panel">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-1">
                    <OauthStatusBadge tone={badge.tone} label={badge.label} title={oauth.lastError} />
                    <p className="text-xs text-muted-foreground">
                        {authorized && oauth.authorizedAt ? `Autorizado ${formatDistanceToNow(new Date(oauth.authorizedAt), { addSuffix: true, locale: ptBR })}. O token é renovado sozinho.` : "Autorize para o Opex receber o token do servidor (você faz login no provedor e volta para cá)."}
                        {oauth.dynamicClient && " Cliente registrado automaticamente no provedor."}
                    </p>
                    {oauth.lastError && <p className="text-xs text-destructive">{oauth.lastError}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {(authorized || oauth.dynamicClient) && (
                        <Button type="button" variant="ghost" size="sm" className="gap-1.5" disabled={disabled || disconnect.isPending} onClick={() => setConfirming(true)}>
                            <Unplug className="h-4 w-4" aria-hidden /> Desconectar
                        </Button>
                    )}
                    <Button type="button" variant={authorized ? "outline" : "default"} size="sm" className="gap-1.5" disabled={disabled || start.isPending} onClick={authorize}>
                        {start.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <KeyRound className="h-4 w-4" aria-hidden />}
                        {authorized ? "Autorizar de novo" : "Autorizar"}
                    </Button>
                </div>
            </div>
            <ConfirmDialog
                open={confirming}
                onOpenChange={setConfirming}
                title={`Desconectar o OAuth do MCP ${server.name}?`}
                description="O token é revogado no provedor (quando ele permite) e apagado do Opex. O agente perde as ferramentas deste MCP até você autorizar de novo."
                confirmLabel="Desconectar"
                variant="destructive"
                pending={disconnect.isPending}
                onConfirm={() => disconnect.mutate(server.id, { onSuccess: () => setConfirming(false) })}
            />
        </div>
    )
}
