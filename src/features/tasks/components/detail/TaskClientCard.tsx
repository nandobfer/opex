"use client"

import { useState, type ReactElement } from "react"
import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import { Building2, Loader2, Pencil, X } from "lucide-react"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FieldTrigger } from "@/components/ui/field-trigger"
import { SearchPicker } from "@/components/ui/search-picker"
import { ORCAMENTOS_PATH } from "@/features/orcamentos/constants"
import { useOrcamentoClients } from "@/features/orcamentos/hooks/useOrcamentos"
import type { ClienteOrcamentoDto } from "@/features/orcamentos/types"
import { useSetTaskClient } from "../../hooks/useTasks"
import type { TaskDetailDto } from "../../types"

/** Nome do cliente na lista de opções do seletor. */
function ClientLabel({ client }: { client: ClienteOrcamentoDto }) {
    return (
        <span className="flex min-w-0 items-center gap-2">
            <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate">{client.name}</span>
        </span>
    )
}

/**
 * Cliente da tarefa (coluna lateral): adiciona um cliente quando ainda não há, troca o atual ou o
 * remove. Ao adicionar/trocar, o servidor recalcula a estimativa com o fator de lucro e o custo/hora
 * do cliente escolhido (o campo de estimativa fica habilitado); ao remover, o cliente e a estimativa
 * somem. Clientes são cadastrados apenas em Integrações › Orçamentos.
 */
export function TaskClientCard({ task }: { task: TaskDetailDto }) {
    const clients = useOrcamentoClients()
    const save = useSetTaskClient(task.id, task.code)
    const [confirmRemove, setConfirmRemove] = useState(false)

    const projectId = task.project?.id ?? null
    const options = (clients.data ?? []).filter((client) => client.active && (!projectId || client.projectIds.includes(projectId)))
    const current = task.clientId ? (clients.data ?? []).find((client) => client.id === task.clientId) ?? null : null
    const hasClient = Boolean(task.clientId)
    const pending = save.isPending

    const picker = (trigger: ReactElement, matchWidth = true) => (
        <SearchPicker
            trigger={trigger}
            items={options}
            getKey={(item) => item.id}
            searchKeys={["name"]}
            renderItem={(item) => <ClientLabel client={item} />}
            onPick={(item) => save.mutate(item.id)}
            matchTriggerWidth={matchWidth}
            disabled={pending}
            searchLabel="Buscar cliente"
            listLabel="Clientes do repositório"
            emptyText="Nenhum cliente ativo inclui este repositório"
            emptySearchText="Nenhum cliente encontrado"
        />
    )

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Cliente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
                <AnimatePresence mode="wait" initial={false}>
                    {hasClient ? (
                        <motion.div key="client" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex items-center justify-between gap-2">
                            <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                                <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                                <span className="truncate">{current?.name ?? task.estimateClientName ?? "Cliente"}</span>
                            </span>
                            <span className="flex shrink-0 items-center gap-1.5">
                                {options.length > 0 &&
                                    picker(
                                        <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={pending}>
                                            <Pencil className="h-3.5 w-3.5" aria-hidden />
                                            Trocar
                                        </Button>,
                                        false,
                                    )}
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                    onClick={() => setConfirmRemove(true)}
                                    disabled={pending}
                                    aria-label="Remover cliente"
                                    title="Remover cliente"
                                >
                                    <X className="h-4 w-4" aria-hidden />
                                </Button>
                            </span>
                        </motion.div>
                    ) : options.length === 0 ? (
                        <motion.p key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="text-sm text-muted-foreground">
                            Nenhum cliente ativo inclui o repositório da tarefa.{" "}
                            <Link href={ORCAMENTOS_PATH} className="text-primary underline-offset-4 hover:underline">
                                Cadastre em Integrações › Clientes
                            </Link>
                            .
                        </motion.p>
                    ) : (
                        <motion.div key="add" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                            {picker(<FieldTrigger id="task-client" placeholder="Adicionar cliente" />)}
                        </motion.div>
                    )}
                </AnimatePresence>
                {pending && (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Atualizando…
                    </p>
                )}
            </CardContent>

            <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remover o cliente de {task.code}?</AlertDialogTitle>
                        <AlertDialogDescription>A estimativa e o faturamento somem da tarefa. Se ela veio do portal, deixa de aparecer para o cliente.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => save.mutate(null)}>
                            Remover
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    )
}
