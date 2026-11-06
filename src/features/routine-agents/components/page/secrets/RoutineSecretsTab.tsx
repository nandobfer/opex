"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { KeyRound, Plus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { CadastroTableCard } from "@/components/list/CadastroTableCard"
import { TableAction } from "@/components/list/TableAction"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { formatDateTime } from "../../../format"
import type { RoutineSecretDto } from "../../../types"
import { useDeleteRoutineSecret, useRoutineSecrets } from "../../../hooks/useRoutineSecrets"
import { RoutineSecretDialog } from "./RoutineSecretDialog"

/** Colunas da linha (compartilhadas com o skeleton). */
const ROW = "grid grid-cols-1 gap-2 py-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_minmax(0,1fr)_9rem_5rem] sm:items-center"

function SecretsSkeleton() {
    return (
        <div aria-label="Carregando os segredos" className="divide-y">
            {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className={ROW}>
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-8 w-16" />
                </div>
            ))}
        </div>
    )
}

/**
 * Aba **Segredos** do agente rotineiro (OPE-130, D5): só daquele agente. O valor nunca volta do
 * servidor (a lista mostra "Valor: definido"); o agente usa o segredo nas Chamadas HTTP por
 * `{{secret:NOME}}`. Atualiza em tempo real (`routine-agent-updated`).
 */
export function RoutineSecretsTab({ agentId }: { agentId: string }) {
    const secrets = useRoutineSecrets(agentId)
    const remove = useDeleteRoutineSecret(agentId)
    const [editing, setEditing] = useState<RoutineSecretDto | null>(null)
    const [creating, setCreating] = useState(false)
    const [deleting, setDeleting] = useState<RoutineSecretDto | null>(null)
    const newButton = (
        <Button type="button" size="sm" className="gap-1.5" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" aria-hidden /> Novo segredo
        </Button>
    )
    return (
        <CadastroTableCard>
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                    <h2 className="flex items-center gap-2 text-sm font-semibold">
                        <KeyRound className="h-4 w-4" aria-hidden /> Segredos
                    </h2>
                    <p className="text-xs text-muted-foreground">
                        Tokens, senhas e chaves que este agente usa nas Chamadas HTTP com <code>{"{{secret:NOME}}"}</code>. O valor é cifrado, nunca aparece aqui e o agente nunca o vê.
                    </p>
                </div>
                {secrets.data?.length ? newButton : null}
            </div>
            {secrets.isLoading ? (
                <SecretsSkeleton />
            ) : secrets.isError ? (
                <ErrorState title="Não foi possível carregar os segredos" description={apiErrorMessage(secrets.error, "Tente novamente.")} onRetry={() => void secrets.refetch()} />
            ) : !secrets.data?.length ? (
                <EmptyState icon={KeyRound} title="Nenhum segredo" description="Os segredos são usados nas Chamadas HTTP com {{secret:NOME}} e o agente nunca vê o valor." actionLabel="Novo segredo" onAction={() => setCreating(true)} />
            ) : (
                <ul className="divide-y" aria-label="Segredos do agente">
                    <AnimatePresence initial={false}>
                        {secrets.data.map((secret) => (
                            <motion.li key={secret.id} layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className={ROW}>
                                <span className="min-w-0">
                                    <code className="block truncate text-sm font-semibold">{secret.name}</code>
                                    <Badge variant="outline" className="mt-1">
                                        Valor: definido
                                    </Badge>
                                </span>
                                <span className="min-w-0 text-sm text-muted-foreground">{secret.description || "Sem descrição"}</span>
                                <span className="min-w-0 truncate text-xs text-muted-foreground" title={secret.allowedHosts.join(", ")}>
                                    {secret.allowedHosts.length ? secret.allowedHosts.join(", ") : "Qualquer domínio"}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    <span className="block">Atualizado {formatDateTime(secret.updatedAt)}</span>
                                    <span className="block">{secret.lastUsedAt ? `Usado ${formatDateTime(secret.lastUsedAt)}` : "Nunca usado"}</span>
                                </span>
                                <span className="flex justify-end gap-1">
                                    <TableAction type="edit" onClick={() => setEditing(secret)} />
                                    <TableAction type="delete" onClick={() => setDeleting(secret)} />
                                </span>
                            </motion.li>
                        ))}
                    </AnimatePresence>
                </ul>
            )}
            <RoutineSecretDialog agentId={agentId} secret={editing} open={creating || editing !== null} onClose={() => (setCreating(false), setEditing(null))} />
            <ConfirmDialog
                open={deleting !== null}
                onOpenChange={(open) => !open && setDeleting(null)}
                title={`Excluir o segredo ${deleting?.name ?? ""}?`}
                description="As Chamadas HTTP que usam esse segredo passam a falhar com segredo inexistente. Esta ação não pode ser desfeita."
                confirmLabel="Excluir"
                variant="destructive"
                pending={remove.isPending}
                onConfirm={() => {
                    if (deleting) remove.mutate(deleting.id, { onSettled: () => setDeleting(null) })
                }}
            />
        </CadastroTableCard>
    )
}
