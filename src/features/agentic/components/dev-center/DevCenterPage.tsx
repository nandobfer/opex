"use client"

import { useEffect, useRef, type CSSProperties } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Settings2, Workflow } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { useScrollViewportHeight } from "@/features/integrations/hooks/useScrollViewportHeight"
import { DEV_CENTER_PATH } from "../../constants"
import { useAgenticRealtime, useCentrals } from "../../hooks/useAgentic"
import { useDevCenterLayout } from "../../hooks/useDevCenterLayout"
import { AGENTIC_SETTINGS_HREF } from "../central/CentralPage"
import { WorkbenchPane } from "../workbench/WorkbenchPane"
import { CentralsPane } from "./CentralsPane"
import { TasksPane } from "./TasksPane"

/**
 * Central de desenvolvimento (`/desenvolvimento/[central]/[tarefa]`): centrais à esquerda, tarefas
 * do produto no meio e a mesa de trabalho da tarefa à direita. Trocar de central ou de tarefa não
 * remonta a tela (a casca agrupa `/desenvolvimento`): as colunas ficam e só o que mudou anima.
 */
export function DevCenterPage({ centralId, taskId }: { centralId: string | null; taskId: string | null }) {
    useAgenticRealtime()
    const router = useRouter()
    const centrals = useCentrals()
    const list = centrals.data ?? []
    const central = list.find((item) => item.id === centralId) ?? null
    // As colunas ocupam exatamente a área visível do <main> (descontado o padding e o aviso de conexão).
    const sectionRef = useRef<HTMLElement>(null)
    const height = useScrollViewportHeight(sectionRef, list.length > 0)
    const layout = useDevCenterLayout()
    const reduceMotion = useReducedMotion()

    // Sem central na URL (ou inexistente): abre a primeira.
    useEffect(() => {
        if (!centrals.data?.length) return
        if (!centralId || !centrals.data.some((item) => item.id === centralId)) router.replace(`${DEV_CENTER_PATH}/${centrals.data[0]!.id}`)
    }, [centralId, centrals.data, router])

    if (centrals.isLoading) {
        return (
            <div className="grid gap-4 lg:grid-cols-[220px_340px_1fr]" aria-label="Carregando a Central de desenvolvimento">
                <Skeleton className="h-96" />
                <Skeleton className="h-96" />
                <Skeleton className="h-96" />
            </div>
        )
    }
    if (centrals.isError) return <ErrorState title="Não foi possível carregar as centrais" description={apiErrorMessage(centrals.error, "Tente novamente.")} onRetry={() => void centrals.refetch()} />
    if (!list.length) {
        return (
            <EmptyState icon={Workflow} title="Nenhuma central de desenvolvimento" description="Crie uma central para um produto em Integrações › Provedores de IA › Desenvolvimento agêntico.">
                <Button asChild size="sm" className="gap-1.5">
                    <Link href={AGENTIC_SETTINGS_HREF}>
                        <Settings2 className="h-4 w-4" aria-hidden /> Configurar centrais
                    </Link>
                </Button>
            </EmptyState>
        )
    }

    return (
        <motion.section
            ref={sectionRef}
            initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            style={height ? ({ "--dev-center-height": `${height}px` } as CSSProperties) : undefined}
            className="flex min-h-0 flex-col gap-4 lg:h-[var(--dev-center-height,calc(100dvh-3rem))] lg:flex-row"
        >
            <CentralsPane centrals={list} activeId={central?.id ?? null} collapsed={layout.centralsCollapsed} wide={layout.wide} onToggle={layout.toggleCentrals} />
            {central ? (
                <TasksPane central={central} activeTaskId={taskId} collapsed={layout.tasksCollapsed} wide={layout.wide} onToggle={layout.toggleTasks} />
            ) : (
                <Skeleton className="h-96 lg:w-[340px] lg:shrink-0" />
            )}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                {central ? (
                    <AnimatePresence mode="wait" initial={false}>
                        <motion.div
                            key={`${central.id}-${taskId ?? ""}`}
                            initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: reduceMotion ? 0 : -4 }}
                            transition={{ duration: 0.15, ease: "easeOut" }}
                            className="flex min-h-0 min-w-0 flex-1 flex-col"
                        >
                            <WorkbenchPane central={central} taskId={taskId} />
                        </motion.div>
                    </AnimatePresence>
                ) : (
                    <Skeleton className="h-96" />
                )}
            </div>
        </motion.section>
    )
}
