"use client"

import { useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { RefreshCw, Server } from "lucide-react"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { useClientePortal } from "@/features/orcamentos/portal/ClientePortalContext"
import { PORTAL_ACTION_LABELS, type PortalEnvironmentAction } from "../constants"
import type { PortalEnvironmentDto } from "../types"
import { PortalEnvironmentRow } from "./PortalEnvironmentRow"
import { usePortalEnvironmentAction, usePortalEnvironments, usePortalEnvironmentsRealtime } from "./hooks"

/** Ações que tiram o ambiente do ar por um tempo: pedem confirmação explícita. */
const CONFIRM: Partial<Record<PortalEnvironmentAction, (env: PortalEnvironmentDto) => { title: string; description: string }>> = {
    deploy: (env) => ({ title: `Implantar ${env.name}?`, description: `O código mais recente da ref ${env.ref || "padrão"} é publicado neste ambiente. Ele pode ficar fora do ar por alguns instantes.` }),
    restart: (env) => ({ title: `Reiniciar ${env.name}?`, description: "Os serviços do ambiente são reiniciados e ficam fora do ar por alguns instantes." }),
}

/** Portal do cliente: ambientes dos repositórios do cliente (todos veem o estado; o admin age). */
export function ClienteAmbientesPage() {
    const { isAdmin } = useClientePortal()
    const query = usePortalEnvironments()
    const action = usePortalEnvironmentAction()
    usePortalEnvironmentsRealtime()
    const reduced = useReducedMotion()
    const [confirm, setConfirm] = useState<{ env: PortalEnvironmentDto; action: PortalEnvironmentAction } | null>(null)
    const items = query.data ?? []

    const request = (env: PortalEnvironmentDto, next: PortalEnvironmentAction) => {
        if (CONFIRM[next]) setConfirm({ env, action: next })
        else action.mutate({ id: env.id, action: next })
    }
    const dialog = confirm ? CONFIRM[confirm.action]?.(confirm.env) : null

    return (
        <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-5">
            <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="text-lg font-semibold md:text-2xl">Ambientes</h1>
                    <p className="text-sm text-muted-foreground">{isAdmin ? "Estado dos ambientes dos seus repositórios; implante, levante ou reinicie quando precisar." : "Estado dos ambientes dos seus repositórios (somente leitura)."}</p>
                </div>
                <Button type="button" variant="outline" size="sm" className="h-9 gap-2" onClick={() => void query.refetch()} disabled={query.isFetching}>
                    <RefreshCw className="h-4 w-4" aria-hidden /> Atualizar
                </Button>
            </header>

            {query.isLoading ? (
                <Skeleton className="h-[240px] w-full" aria-label="Carregando ambientes" />
            ) : query.error ? (
                <ErrorState title="Não foi possível carregar os ambientes" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
            ) : items.length === 0 ? (
                <EmptyState icon={Server} title="Nenhum ambiente" description="Os ambientes dos seus repositórios aparecerão aqui quando forem criados." actionLabel="Atualizar" onAction={() => void query.refetch()} />
            ) : (
                <div className="divide-y rounded-lg border bg-card px-4">
                    <AnimatePresence initial={false}>
                        {items.map((env) => (
                            <motion.div key={env.id} initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
                                <PortalEnvironmentRow env={env} isAdmin={isAdmin} pending={action.isPending && action.variables?.id === env.id} onAction={(next) => request(env, next)} />
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            )}

            <AlertDialog open={confirm !== null} onOpenChange={(next) => !next && setConfirm(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{dialog?.title}</AlertDialogTitle>
                        <AlertDialogDescription>{dialog?.description}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                const target = confirm
                                setConfirm(null)
                                if (target) action.mutate({ id: target.env.id, action: target.action })
                            }}
                        >
                            {confirm ? PORTAL_ACTION_LABELS[confirm.action] : ""}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </motion.section>
    )
}
