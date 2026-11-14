"use client"

import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowLeft, MousePointerClick } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { useWorkbenchByTask } from "../../hooks/useAgentic"
import { WorkbenchUploadsProvider } from "../../hooks/useWorkbenchFiles"
import type { CentralDto } from "../../types"
import { StartWorkbench } from "./StartWorkbench"
import { WorkbenchView } from "./WorkbenchView"
import { WorkbenchBackHrefProvider } from "./WorkbenchBackLink"
import { DEV_CENTER_PANE_BLEED_CLASS } from "../dev-center/pane-classes"

/** Abaixo de `lg` (OPE-166) a mesa ocupa a largura toda da tela, como a coluna Tarefas. */
export const WORKBENCH_CARD_CLASS = `flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${DEV_CENTER_PANE_BLEED_CLASS}`

/** Pé da mesa no skeleton: o dock do celular (44 px) e a linha de botões do desktop. */
function WorkbenchSkeleton() {
    return (
        <div className="flex min-h-0 flex-1 flex-col" aria-label="Carregando a mesa">
            <div className="flex items-center gap-2 border-b px-4 py-3 max-lg:px-3 max-lg:py-2">
                <Skeleton className="h-9 w-9 shrink-0 lg:hidden" />
                <div className="min-w-0 flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-5 w-2/3" />
                </div>
            </div>
            <Skeleton className="mx-4 my-2.5 h-5 w-3/4 max-lg:mx-3 max-lg:my-2 max-lg:h-4" />
            <Skeleton className="mx-4 mb-2 h-6 w-1/2 max-lg:mx-3" />
            <div className="flex-1 space-y-3 border-t p-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-24 w-full" />
            </div>
            <div className="flex items-center gap-2 border-t p-3">
                <Skeleton className="h-11 w-11 shrink-0 lg:hidden" />
                <Skeleton className="h-11 flex-1 lg:hidden" />
                <Skeleton className="hidden h-8 w-48 lg:block" />
                <Skeleton className="ml-auto hidden h-8 w-32 lg:block" />
            </div>
        </div>
    )
}

/** "Voltar para tarefas" do celular nas telas sem cabeçalho de mesa (abrir mesa e erro). */
function BackRow({ href }: { href: string }) {
    return (
        <Button asChild variant="ghost" size="sm" className="mx-3 mt-2 w-fit shrink-0 gap-1.5 lg:hidden">
            <Link href={href}>
                <ArrowLeft className="h-4 w-4" aria-hidden /> Voltar para tarefas
            </Link>
        </Button>
    )
}

/**
 * Painel da direita: nada selecionado, tarefa sem mesa (abrir) ou a mesa de trabalho. `scopeName` é o
 * produto escolhido no seletor (`null` em "Todos os projetos"), usado só no aviso sem tarefa. `backHref`:
 * destino do "Voltar para tarefas" do celular (no cabeçalho da mesa ou numa linha própria sem mesa).
 */
export function WorkbenchPane({ central, taskId, scopeName, backHref = null }: { central: CentralDto; taskId: string | null; scopeName: string | null; backHref?: string | null }) {
    const workbench = useWorkbenchByTask(taskId)
    const view = !taskId ? "empty" : workbench.isLoading ? "loading" : workbench.isError ? "error" : workbench.data ? "workbench" : "start"
    // A fila de anexos fica acima da tela da mesa: trocar de aba, de fork ou de etapa não perde os envios.
    return (
        <WorkbenchUploadsProvider>
            <WorkbenchBackHrefProvider href={backHref}>
                <Card className={WORKBENCH_CARD_CLASS}>
                    <AnimatePresence mode="wait" initial={false}>
                        <motion.div key={view} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }} className="flex min-h-0 flex-1 flex-col">
                            {view === "empty" && (
                                <div className="flex flex-1 items-center justify-center p-6">
                                    <EmptyState icon={MousePointerClick} title="Selecione uma tarefa" description={scopeName ? `Escolha uma tarefa de ${scopeName} para abrir a mesa de trabalho.` : "Escolha uma tarefa para abrir a mesa de trabalho."} />
                                </div>
                            )}
                            {view === "loading" && <WorkbenchSkeleton />}
                            {backHref && (view === "error" || view === "start") && <BackRow href={backHref} />}
                            {view === "error" && <ErrorState title="Não foi possível carregar a mesa" description={apiErrorMessage(workbench.error, "Tente novamente.")} onRetry={() => void workbench.refetch()} />}
                            {view === "start" && taskId && <StartWorkbench key={taskId} central={central} taskId={taskId} />}
                            {view === "workbench" && workbench.data && <WorkbenchView workbench={workbench.data} central={central} />}
                        </motion.div>
                    </AnimatePresence>
                </Card>
            </WorkbenchBackHrefProvider>
        </WorkbenchUploadsProvider>
    )
}
