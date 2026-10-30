"use client"

import { useMemo, useState } from "react"
import Fuse from "fuse.js"
import { KeyRound } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { SearchInput } from "@/components/list/SearchInput"
import { VirtualizedRows } from "@/components/list/VirtualizedRows"
import { RefreshButton } from "@/components/ui/refresh-button"
import { apiErrorMessage } from "@/lib/api"
import { useOpencodeAccounts, useOpencodeAccountsRealtime } from "../hooks/useOpencodeAccounts"
import type { OpencodeAuthProviderDto } from "../types"
import { AuthProviderRow } from "./AuthProviderRow"
import { AddAccountDialog } from "./AddAccountDialog"

const ROW_ESTIMATE = 60

/**
 * Aba Contas do OpenCode: os providers do servidor com a conta em uso, para adicionar, selecionar,
 * renomear ou remover contas sem abrir o TUI. Conectados primeiro; busca tolerante (fuse.js).
 */
export function OpencodeAccountsCard({ dirty }: { dirty: boolean }) {
    const accounts = useOpencodeAccounts(!dirty)
    useOpencodeAccountsRealtime()
    const [term, setTerm] = useState("")
    const [onlyConnected, setOnlyConnected] = useState(true)
    const [expanded, setExpanded] = useState<string | null>(null)
    const [adding, setAdding] = useState<OpencodeAuthProviderDto | null>(null)

    const rows = useMemo(() => accounts.data ?? [], [accounts.data])
    const connectedCount = rows.filter((row) => row.connected).length
    const fuse = useMemo(() => new Fuse(rows, { keys: ["name", "id", "providers"], threshold: 0.35, ignoreLocation: true }), [rows])
    const searching = term.trim().length > 0
    const matched = searching ? fuse.search(term.trim()).map((result) => result.item) : rows
    // Buscando, a lista mostra todos os providers: é assim que se conecta um provider novo.
    const visible = onlyConnected && !searching ? matched.filter((row) => row.connected) : matched
    const toggle = (id: string) => setExpanded((current) => (current === id ? null : id))

    return (
        <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <div className="space-y-1.5">
                    <CardTitle className="text-base">
                        Contas dos providers
                        {accounts.data ? <span className="ml-2 font-mono text-xs text-muted-foreground">{connectedCount} conectados</span> : null}
                    </CardTitle>
                    <CardDescription>Adicione ou selecione a conta que cada provider usa no OpenCode, como em Providers no TUI. Chaves e tokens nunca são exibidos.</CardDescription>
                </div>
                <RefreshButton onClick={() => void accounts.refetch()} fetching={accounts.isFetching} disabled={dirty} />
            </CardHeader>
            <CardContent className="space-y-3">
                {dirty ? (
                    <p className="text-sm text-muted-foreground">Salve as alterações da configuração para gerenciar as contas.</p>
                ) : accounts.isLoading ? (
                    <Skeleton className="h-40 w-full" />
                ) : accounts.isError ? (
                    <ErrorState title="Não foi possível listar os providers" description={apiErrorMessage(accounts.error, "Confira a configuração e teste a conexão.")} onRetry={() => void accounts.refetch()} />
                ) : rows.length === 0 ? (
                    <EmptyState icon={KeyRound} title="Nenhum provider no OpenCode" description="O servidor não informou providers. Confira a versão do OpenCode (2.x)." actionLabel="Tentar novamente" onAction={() => void accounts.refetch()} />
                ) : (
                    <>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                            <SearchInput value={term} onChange={setTerm} placeholder="Buscar provider (todos)" label="Buscar provider" />
                            <div className="flex shrink-0 items-center gap-2">
                                <Switch id="opencode-only-connected" checked={onlyConnected} onCheckedChange={setOnlyConnected} disabled={searching} />
                                <Label htmlFor="opencode-only-connected" className="text-sm">
                                    Só conectados
                                </Label>
                            </div>
                        </div>
                        <div className="rounded-md border" role="list" aria-label="Providers do OpenCode">
                            {visible.length === 0 && (
                                <EmptyState
                                    icon={KeyRound}
                                    title={searching ? "Nenhum provider encontrado" : "Nenhum provider conectado"}
                                    description={searching ? "Tente outro nome." : "Desligue \"Só conectados\" ou busque um provider para adicionar a primeira conta."}
                                    actionLabel={searching ? undefined : "Mostrar todos"}
                                    onAction={searching ? undefined : () => setOnlyConnected(false)}
                                />
                            )}
                            <VirtualizedRows
                                rows={visible}
                                rowKey={(row) => row.id}
                                estimateSize={ROW_ESTIMATE}
                                rowClassName="border-b last:border-b-0"
                                renderRow={(row) => <AuthProviderRow row={row} expanded={expanded === row.id} onToggle={() => toggle(row.id)} onAdd={() => setAdding(row)} />}
                            />
                        </div>
                    </>
                )}
            </CardContent>
            <AddAccountDialog key={adding?.id ?? "closed"} provider={adding} onClose={() => setAdding(null)} />
        </Card>
    )
}
