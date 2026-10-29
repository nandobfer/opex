"use client"

import { useMemo, useState } from "react"
import Fuse from "fuse.js"
import { motion } from "framer-motion"
import { KeyRound, RefreshCw, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { usePageVirtualizer } from "@/hooks/usePageVirtualizer"
import { apiErrorMessage } from "@/lib/api"
import { useOpencodeAccounts, useOpencodeAccountsRealtime } from "../hooks/useOpencodeAccounts"
import type { OpencodeAuthProviderDto } from "../types"
import { AuthProviderRow } from "./AuthProviderRow"
import { AddAccountDialog } from "./AddAccountDialog"

const ROW_ESTIMATE = 60
/** Acima disto a lista é virtualizada (a busca mostra todos os providers do OpenCode, centenas). */
const VIRTUALIZE_ABOVE = 50

interface ProviderListProps {
    rows: readonly OpencodeAuthProviderDto[]
    expanded: string | null
    onToggle: (id: string) => void
    onAdd: (row: OpencodeAuthProviderDto) => void
}

function PlainProviderList({ rows, expanded, onToggle, onAdd }: ProviderListProps) {
    return rows.map((row) => (
        <div key={row.id} className="border-b last:border-b-0">
            <AuthProviderRow row={row} expanded={expanded === row.id} onToggle={() => onToggle(row.id)} onAdd={() => onAdd(row)} />
        </div>
    ))
}

function VirtualProviderList({ rows, expanded, onToggle, onAdd }: ProviderListProps) {
    const { anchorRef, virtualizer, items, padTop, padBottom } = usePageVirtualizer({ count: rows.length, estimateSize: ROW_ESTIMATE })
    return (
        <div ref={anchorRef} style={{ paddingTop: padTop, paddingBottom: padBottom }}>
            {items.map((item) => {
                const row = rows[item.index]
                if (!row) return null
                // Linhas expandem: a altura real é medida (`measureElement`).
                return (
                    <div key={row.id} ref={virtualizer.measureElement} data-index={item.index} className="border-b last:border-b-0">
                        <AuthProviderRow row={row} expanded={expanded === row.id} onToggle={() => onToggle(row.id)} onAdd={() => onAdd(row)} />
                    </div>
                )
            })}
        </div>
    )
}

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
    const List = visible.length > VIRTUALIZE_ABOVE ? VirtualProviderList : PlainProviderList

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
                <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => void accounts.refetch()} disabled={dirty || accounts.isFetching}>
                    <motion.span animate={{ rotate: accounts.isFetching ? 360 : 0 }} transition={accounts.isFetching ? { repeat: Infinity, duration: 0.9, ease: "linear" } : { duration: 0.2 }} className="inline-flex">
                        <RefreshCw className="h-4 w-4" aria-hidden />
                    </motion.span>
                    Atualizar
                </Button>
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
                            <div className="relative flex-1">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                                <Input value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Buscar provider (todos)" aria-label="Buscar provider" className="pl-9" />
                            </div>
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
                            <List rows={visible} expanded={expanded} onToggle={toggle} onAdd={setAdding} />
                        </div>
                    </>
                )}
            </CardContent>
            <AddAccountDialog key={adding?.id ?? "closed"} provider={adding} onClose={() => setAdding(null)} />
        </Card>
    )
}
