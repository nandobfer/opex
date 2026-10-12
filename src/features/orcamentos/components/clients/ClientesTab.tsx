"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { KeyRound, Pencil, Plus, Trash2, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { apiErrorMessage } from "@/lib/api"
import { formatNumberBR } from "@/lib/format"
import { cn } from "@/lib/utils"
import { GithubRepoLabel } from "@/features/github/components/shared"
import { repoLabelOption } from "@/features/github/components/RepoIndexProvider"
import { useGithubRepoIndex } from "@/features/github/hooks/useGithub"
import type { GithubRepoOption } from "@/features/github/types"
import { formatFactorLabel } from "../../logic"
import { useCreateCliente, useOrcamentoClients, useRegenerateClienteToken, useUpdateCliente } from "../../hooks/useOrcamentos"
import type { ClienteOrcamentoDto } from "../../types"
import { ClienteDialog } from "./ClienteDialog"
import { ClientTokenDialog } from "./ClientTokenDialog"
import { CopyPortalUrlButton } from "./CopyPortalUrlButton"
import { RemoveClienteDialog } from "./RemoveClienteDialog"

/** Aba Clientes: cadastro dos clientes do portal de Orçamentos. */
export function ClientesTab() {
    const query = useOrcamentoClients()
    const repoIndex = useGithubRepoIndex(true)
    const create = useCreateCliente()
    const update = useUpdateCliente()
    const regenerate = useRegenerateClienteToken()
    const [editing, setEditing] = useState<{ client: ClienteOrcamentoDto | null } | null>(null)
    const [removing, setRemoving] = useState<ClienteOrcamentoDto | null>(null)
    const [confirmRegen, setConfirmRegen] = useState<ClienteOrcamentoDto | null>(null)
    const [token, setToken] = useState<{ value: string; name: string } | null>(null)

    const list = query.data ?? []

    return (
        <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">Cada cliente acessa um portal somente leitura dos repositórios escolhidos e pode enviar novas tarefas.</p>
            <div className="flex justify-end">
                <Button type="button" size="sm" className="gap-1.5" onClick={() => setEditing({ client: null })}>
                    <Plus className="h-4 w-4" aria-hidden /> Novo cliente
                </Button>
            </div>
            <div>
                {query.isLoading ? (
                    <div className="space-y-2">
                        <Skeleton className="h-20 w-full" />
                        <Skeleton className="h-20 w-full" />
                    </div>
                ) : query.isError ? (
                    <ErrorState title="Não foi possível carregar os clientes" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
                ) : list.length === 0 ? (
                    <EmptyState icon={Users} title="Nenhum cliente cadastrado" description="Cadastre um cliente para gerar o link do portal e receber pedidos de tarefa." actionLabel="Novo cliente" onAction={() => setEditing({ client: null })} />
                ) : (
                    <ul className="space-y-2">
                        <AnimatePresence initial={false}>
                            {list.map((client) => (
                                <motion.li key={client.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
                                    <ClientRow client={client} portalPath={client.portalPath} repoIndex={repoIndex} onEdit={() => setEditing({ client })} onRegenerate={() => setConfirmRegen(client)} onRemove={() => setRemoving(client)} />
                                </motion.li>
                            ))}
                        </AnimatePresence>
                    </ul>
                )}
            </div>

            <ClienteDialog
                open={editing !== null}
                client={editing?.client ?? null}
                submitting={create.isPending || update.isPending}
                repoIndex={repoIndex}
                onClose={() => setEditing(null)}
                onSubmit={async (values) => {
                    try {
                        if (editing?.client) {
                            const item = await update.mutateAsync({ id: editing.client.id, input: values })
                            return { item }
                        }
                        const created = await create.mutateAsync(values)
                        setToken({ value: created.token, name: created.item.name })
                        return created
                    } catch {
                        return null
                    }
                }}
            />

            <ClientTokenDialog token={token?.value ?? null} clientName={token?.name ?? ""} onClose={() => setToken(null)} />

            <AlertDialog open={confirmRegen !== null} onOpenChange={(next) => !next && setConfirmRegen(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Gerar um novo token para {confirmRegen?.name}?</AlertDialogTitle>
                        <AlertDialogDescription>O token atual deixa de funcionar imediatamente. Você precisará enviar o novo link ao cliente.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={async () => {
                                const target = confirmRegen
                                setConfirmRegen(null)
                                if (!target) return
                                const created = await regenerate.mutateAsync(target.id).catch(() => null)
                                if (created) setToken({ value: created.token, name: created.item.name })
                            }}
                        >
                            Gerar novo token
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <RemoveClienteDialog client={removing} onClose={() => setRemoving(null)} />
        </div>
    )
}

function ClientRow({ client, portalPath, repoIndex, onEdit, onRegenerate, onRemove }: { client: ClienteOrcamentoDto; portalPath: string; repoIndex: ReadonlyMap<string, GithubRepoOption>; onEdit: () => void; onRegenerate: () => void; onRemove: () => void }) {
    return (
        <div className={cn("flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-start", !client.active && "opacity-60")}>
            <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{client.name}</span>
                    {!client.active && <span className="rounded-full border px-1.5 text-[10px] uppercase text-muted-foreground">desativado</span>}
                    <span className="rounded-full border px-1.5 font-mono text-[10px] text-muted-foreground" title="Prefixo do token">
                        {client.tokenPrefix}…
                    </span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Custo/hora: <span className="font-mono text-foreground">R$ {formatNumberBR(client.hourlyRate)}</span></span>
                    <span>Fator: <span className="font-mono text-foreground">{formatFactorLabel(client.profitFactor)}</span></span>
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
                    <p className="text-xs text-warning">Nenhum repositório válido: o portal não mostra tarefas.</p>
                )}
                {client.updatedAt && <p className="text-xs text-muted-foreground">Atualizado {formatDistanceToNow(new Date(client.updatedAt), { addSuffix: true, locale: ptBR })}</p>}
            </div>
            <div className="flex shrink-0 flex-wrap gap-1">
                <CopyPortalUrlButton portalPath={portalPath} portalName={client.name} />
                <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={onEdit}>
                    <Pencil className="h-3.5 w-3.5" aria-hidden /> Editar
                </Button>
                <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={onRegenerate}>
                    <KeyRound className="h-3.5 w-3.5" aria-hidden /> Token
                </Button>
                <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={onRemove}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden /> Excluir
                </Button>
            </div>
        </div>
    )
}
