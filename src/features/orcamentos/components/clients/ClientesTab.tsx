"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { ChevronRight, Plus, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { formatNumberBR } from "@/lib/format"
import { cn } from "@/lib/utils"
import { GithubRepoLabel } from "@/features/github/components/shared"
import { repoLabelOption } from "@/features/github/components/RepoIndexProvider"
import { useGithubRepoIndex } from "@/features/github/hooks/useGithub"
import type { GithubRepoOption } from "@/features/github/types"
import { clienteConfigPath } from "../../constants"
import { formatFactorLabel } from "../../logic"
import { useCreateCliente, useOrcamentoClients } from "../../hooks/useOrcamentos"
import type { ClienteOrcamentoDto } from "../../types"
import { CopyPortalUrlButton } from "./CopyPortalUrlButton"
import { ClienteDialog } from "./ClienteDialog"
import { ClientTokenDialog } from "./ClientTokenDialog"

/** Aba Clientes: lista com o card inteiro levando à configuração do cliente. */
export function ClientesTab() {
    const query = useOrcamentoClients()
    const repoIndex = useGithubRepoIndex(true)
    const create = useCreateCliente()
    const [creating, setCreating] = useState(false)
    const [token, setToken] = useState<{ value: string; name: string } | null>(null)

    const list = query.data ?? []

    return (
        <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <div className="space-y-1.5">
                    <CardTitle className="text-base">Clientes</CardTitle>
                    <CardDescription>Abra um cliente para editar os dados, os usuários e o token do portal.</CardDescription>
                </div>
                <Button type="button" size="sm" className="gap-1.5" onClick={() => setCreating(true)}>
                    <Plus className="h-4 w-4" aria-hidden /> Novo cliente
                </Button>
            </CardHeader>
            <CardContent>
                {query.isLoading ? (
                    <div className="space-y-2">
                        <Skeleton className="h-20 w-full" />
                        <Skeleton className="h-20 w-full" />
                    </div>
                ) : query.isError ? (
                    <ErrorState title="Não foi possível carregar os clientes" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
                ) : list.length === 0 ? (
                    <EmptyState icon={Users} title="Nenhum cliente cadastrado" description="Cadastre um cliente para gerar o link do portal e receber pedidos de tarefa." actionLabel="Novo cliente" onAction={() => setCreating(true)} />
                ) : (
                    <ul className="space-y-2">
                        <AnimatePresence initial={false}>
                            {list.map((client) => (
                                <motion.li key={client.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
                                    <ClienteCard client={client} repoIndex={repoIndex} />
                                </motion.li>
                            ))}
                        </AnimatePresence>
                    </ul>
                )}
            </CardContent>

            <ClienteDialog
                open={creating}
                client={null}
                submitting={create.isPending}
                repoIndex={repoIndex}
                onClose={() => setCreating(false)}
                onSubmit={async (values) => {
                    try {
                        const created = await create.mutateAsync(values)
                        setToken({ value: created.token, name: created.item.name })
                        return created
                    } catch {
                        return null
                    }
                }}
            />

            <ClientTokenDialog token={token?.value ?? null} clientName={token?.name ?? ""} onClose={() => setToken(null)} />
        </Card>
    )
}

function ClienteCard({ client, repoIndex }: { client: ClienteOrcamentoDto; repoIndex: ReadonlyMap<string, GithubRepoOption> }) {
    return (
        <div className={cn("flex items-stretch rounded-lg border transition-colors hover:border-primary/50 hover:bg-accent/40", !client.active && "opacity-60")}>
            <Link href={clienteConfigPath(client.id)} className="flex min-w-0 flex-1 items-center gap-2 p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{client.name}</span>
                        {!client.active && <span className="rounded-full border px-1.5 text-[10px] uppercase text-muted-foreground">desativado</span>}
                        <span className="rounded-full border px-1.5 font-mono text-[10px] text-muted-foreground" title="Prefixo do token">
                            {client.tokenPrefix}…
                        </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>
                            Custo/hora: <span className="font-mono text-foreground">R$ {formatNumberBR(client.hourlyRate)}</span>
                        </span>
                        <span>
                            Fator: <span className="font-mono text-foreground">{formatFactorLabel(client.profitFactor)}</span>
                        </span>
                    </div>
                    {client.projects.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                            {client.projects.map((project) => (
                                <span key={project.id} className="inline-flex max-w-[240px] items-center rounded-md border px-1.5 py-0.5 text-xs">
                                    <GithubRepoLabel repo={repoLabelOption(project.repo, repoIndex)} />
                                </span>
                            ))}
                        </div>
                    ) : (
                        <p className="text-xs text-warning">Nenhum repositório vinculado: vincule um para o cliente ver e criar tarefas no portal.</p>
                    )}
                    {client.updatedAt && <p className="text-xs text-muted-foreground">Atualizado {formatDistanceToNow(new Date(client.updatedAt), { addSuffix: true, locale: ptBR })}</p>}
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </Link>
            <div className="flex shrink-0 items-center pr-2">
                <CopyPortalUrlButton portalPath={client.portalPath} portalName={client.name} />
            </div>
        </div>
    )
}
