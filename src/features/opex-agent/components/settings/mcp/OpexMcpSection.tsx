"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Plug, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import type { OpexMcpServerDto } from "../../../mcp"
import { useDeleteOpexMcpServer, useOpexMcpRealtime, useOpexMcpServers, useToggleOpexMcpServer } from "../../../hooks/useOpexMcpServers"
import { OpexMcpDialog } from "./OpexMcpDialog"
import { OpexMcpServerItem } from "./OpexMcpServerItem"

type DialogState = { open: false } | { open: true; server: OpexMcpServerDto | null }

/**
 * Seção "MCPs" do Agente Opex: lista, cadastra, edita, habilita/desabilita e exclui os servidores MCP
 * cujas ferramentas o agente usa nas conversas. Salva sozinha (cada ação grava na hora), com tempo real.
 */
export function OpexMcpSection() {
    const query = useOpexMcpServers()
    const toggle = useToggleOpexMcpServer()
    const remove = useDeleteOpexMcpServer()
    const [dialog, setDialog] = useState<DialogState>({ open: false })
    const [removing, setRemoving] = useState<OpexMcpServerDto | null>(null)
    useOpexMcpRealtime()

    const servers = query.data ?? []
    const openNew = () => setDialog({ open: true, server: null })

    return (
        <Card>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
                <div className="space-y-1.5">
                    <CardTitle className="text-base">MCPs</CardTitle>
                    <CardDescription>
                        Servidores Model Context Protocol: as ferramentas dos MCPs habilitados entram para o agente em cada conversa, com o nome mcp_{"{identificador}"}_{"{ferramenta}"}. Um MCP que não conecta fica de fora do turno
                        e o agente é avisado. Headers e variáveis são gravados cifrados e nunca voltam para a tela.
                    </CardDescription>
                </div>
                <Button type="button" className="gap-1.5" onClick={openNew}>
                    <Plus className="h-4 w-4" aria-hidden /> Cadastrar MCP
                </Button>
            </CardHeader>
            <CardContent>
                {query.isLoading ? (
                    <div className="space-y-2">
                        <Skeleton className="h-20 w-full" />
                        <Skeleton className="h-20 w-full" />
                    </div>
                ) : query.isError ? (
                    <ErrorState title="Não foi possível carregar os MCPs" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
                ) : servers.length === 0 ? (
                    <EmptyState icon={Plug} title="Nenhum MCP cadastrado" description="Cadastre um MCP por URL (HTTP ou SSE) ou por comando (stdio) para o agente usar as ferramentas dele." actionLabel="Cadastrar MCP" onAction={openNew} />
                ) : (
                    <ul className="space-y-2" aria-label="MCPs cadastrados">
                        <AnimatePresence initial={false}>
                            {servers.map((server) => (
                                <motion.li key={server.id} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
                                    <OpexMcpServerItem
                                        server={server}
                                        onToggle={(enabled) => toggle.mutate({ id: server.id, enabled })}
                                        onEdit={() => setDialog({ open: true, server })}
                                        onDelete={() => setRemoving(server)}
                                    />
                                </motion.li>
                            ))}
                        </AnimatePresence>
                    </ul>
                )}
            </CardContent>

            <OpexMcpDialog open={dialog.open} server={dialog.open ? dialog.server : null} onClose={() => setDialog({ open: false })} />
            <ConfirmDialog
                open={removing !== null}
                onOpenChange={(open) => !open && setRemoving(null)}
                title={`Excluir o MCP ${removing?.name ?? ""}?`}
                description="As ferramentas dele saem do agente e dos clientes que o tinham liberado. Para só pausar, desabilite o MCP."
                confirmLabel="Excluir"
                variant="destructive"
                pending={remove.isPending}
                onConfirm={() => {
                    if (!removing) return
                    remove.mutate(removing.id, { onSuccess: () => setRemoving(null) })
                }}
            />
        </Card>
    )
}
