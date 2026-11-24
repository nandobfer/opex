"use client"

import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useDisconnectMcpOauth } from "../hooks/useMcpOauth"
import type { OpencodeResourceDto } from "../types"
import { McpAuthorizeDialog } from "./McpAuthorizeDialog"

/** Diálogos do OAuth dos MCPs (Autorizar e a confirmação de Desconectar). */
export function McpOauthDialogs({ authorizing, disconnecting, onCloseAuthorize, onCloseDisconnect }: { authorizing: OpencodeResourceDto | null; disconnecting: OpencodeResourceDto | null; onCloseAuthorize: () => void; onCloseDisconnect: () => void }) {
    const disconnect = useDisconnectMcpOauth()
    return (
        <>
            <McpAuthorizeDialog target={authorizing} onClose={onCloseAuthorize} />
            <ConfirmDialog
                open={disconnecting !== null}
                onOpenChange={(open) => !open && onCloseDisconnect()}
                title={`Desconectar o MCP "${disconnecting?.name ?? ""}"?`}
                description="A credencial OAuth sai do OpenCode do host: os agentes perdem este MCP até você autorizar de novo."
                confirmLabel="Desconectar"
                variant="destructive"
                pending={disconnect.isPending}
                onConfirm={() => disconnecting && disconnect.mutate(disconnecting.id, { onSuccess: onCloseDisconnect })}
            />
        </>
    )
}
