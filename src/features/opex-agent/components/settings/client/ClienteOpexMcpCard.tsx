"use client"

import { AnimatePresence, motion } from "framer-motion"
import { AlertTriangle, Plug } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { OPEX_MCP_TRANSPORT_LABELS } from "../../../mcp"
import { useOpexMcpRealtime, useOpexMcpServers } from "../../../hooks/useOpexMcpServers"

interface ClienteOpexMcpCardProps {
    /** Ids dos MCPs liberados para o cliente. */
    value: readonly string[]
    onChange: (next: string[]) => void
}

/**
 * MCPs do Agente Opex liberados para o portal do cliente (desligados por padrão). Os usuários do
 * cliente usam as ferramentas do MCP com as credenciais cadastradas pelo dono.
 */
export function ClienteOpexMcpCard({ value, onChange }: ClienteOpexMcpCardProps) {
    const query = useOpexMcpServers()
    useOpexMcpRealtime()
    const selected = new Set(value)
    const servers = query.data ?? []
    const anySelected = servers.some((server) => selected.has(server.id))

    const toggle = (id: string, enabled: boolean) => {
        const next = new Set(selected)
        if (enabled) next.add(id)
        else next.delete(id)
        onChange(servers.map((server) => server.id).filter((serverId) => next.has(serverId)))
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">MCPs</CardTitle>
                <CardDescription>Servidores MCP cadastrados em Provedores de IA › Agente Opex › MCPs. Ligue os que o agente deste cliente pode usar.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                <AnimatePresence initial={false}>
                    {anySelected && (
                        <motion.p
                            key="warning"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                            className="flex items-start gap-2 overflow-hidden text-xs text-warning"
                            role="note"
                        >
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> Os usuários do cliente acessam o sistema externo com as credenciais do MCP (as suas). As ferramentas seguem a
                            confirmação configurada no MCP.
                        </motion.p>
                    )}
                </AnimatePresence>
                {query.isLoading ? (
                    <Skeleton className="h-16 w-full" />
                ) : query.isError ? (
                    <ErrorState title="Não foi possível carregar os MCPs" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
                ) : servers.length === 0 ? (
                    <EmptyState icon={Plug} title="Nenhum MCP cadastrado" description="Cadastre MCPs na configuração do Agente Opex (Provedores de IA › Agente Opex › MCPs)." />
                ) : (
                    <ul className="space-y-2" aria-label="MCPs do cliente">
                        {servers.map((server) => {
                            const id = `cliente-mcp-${server.id}`
                            return (
                                <li key={server.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                                    <label htmlFor={id} className="min-w-0 cursor-pointer space-y-0.5">
                                        <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                                            {server.name}
                                            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{OPEX_MCP_TRANSPORT_LABELS[server.transport]}</span>
                                            {!server.enabled && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">Desabilitado no agente</span>}
                                        </span>
                                        <span className="block text-xs text-muted-foreground">
                                            {server.tools.length} {server.tools.length === 1 ? "ferramenta" : "ferramentas"}
                                            {server.description ? ` · ${server.description}` : ""}
                                        </span>
                                    </label>
                                    <Switch id={id} checked={selected.has(server.id)} onCheckedChange={(checked) => toggle(server.id, checked)} aria-label={`${server.name}: liberado para o cliente`} />
                                </li>
                            )
                        })}
                    </ul>
                )}
            </CardContent>
        </Card>
    )
}
