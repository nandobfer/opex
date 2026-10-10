"use client"

import { useEffect, useMemo, useRef, type CSSProperties } from "react"
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
import { useTaskList } from "@/features/tasks/hooks/useTasks"
import { DEV_CENTER_PATH } from "../../constants"
import { pickActiveCentral } from "../../dev-center-central"
import { useAgenticRealtime, useCentrals } from "../../hooks/useAgentic"
import { useDevCenterCentral } from "../../hooks/useDevCenterCentral"
import { AGENTIC_SETTINGS_HREF } from "../central/CentralPage"
import { WorkbenchPane } from "../workbench/WorkbenchPane"
import { TasksPane } from "./TasksPane"

/**
 * Central de desenvolvimento (`/desenvolvimento/[tarefa]`): a **central vem do navegador** e a
 * **tarefa vem da URL**. Trocar de central ou de tarefa não remonta a tela (a casca agrupa
 * `/desenvolvimento`): as colunas ficam e só o que mudou anima (a mesa ao trocar de tarefa, a lista
 * de tarefas ao trocar de central).
 */
export function DevCenterPage({ taskId }: { taskId: string | null }) {
    useAgenticRealtime()
    const router = useRouter()
    const centrals = useCentrals()
    const list = useMemo(() => centrals.data ?? [], [centrals.data])
    const { centralId: storedId, setCentralId } = useDevCenterCentral()
    // A tarefa (na URL) manda na central: a central efetiva é a do projeto dela.
    const tasks = useTaskList(false)
    const taskProjectId = taskId ? (tasks.data?.tasks.find((task) => task.id === taskId)?.project?.id ?? null) : null
    const central = useMemo(() => pickActiveCentral(list, storedId, taskProjectId), [list, storedId, taskProjectId])
    // As colunas ocupam exatamente a área visível do <main> (descontado o padding e o aviso de conexão).
    const sectionRef = useRef<HTMLElement>(null)
    const height = useScrollViewportHeight(sectionRef, list.length > 0)
    const reduceMotion = useReducedMotion()

    // A central efetiva (da tarefa, salva ou a primeira) fica gravada no navegador.
    useEffect(() => {
        if (central && central.id !== storedId) setCentralId(central.id)
    }, [central, storedId, setCentralId])

    // Trocar de central limpa a tarefa da URL (a mesa aberta era de outro projeto).
    const selectCentral = (id: string) => {
        setCentralId(id)
        if (taskId) router.replace(DEV_CENTER_PATH)
    }

    if (centrals.isLoading) {
        return (
            <div className="grid gap-4 lg:grid-cols-[340px_1fr]" aria-label="Carregando a Central de desenvolvimento">
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
            {central ? (
                <TasksPane central={central} centrals={list} activeTaskId={taskId} onSelectCentral={selectCentral} />
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
