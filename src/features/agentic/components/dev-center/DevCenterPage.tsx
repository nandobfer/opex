"use client"

import { useEffect, useMemo, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Settings2, Workflow } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell"
import { apiErrorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useTaskList } from "@/features/tasks/hooks/useTasks"
import { DEV_CENTER_PATH } from "../../constants"
import { ALL_CENTRALS_ID, isAllCentrals, pickActiveCentral } from "../../dev-center-central"
import { useAgenticRealtime, useCentrals } from "../../hooks/useAgentic"
import { useDevCenterCentral } from "../../hooks/useDevCenterCentral"
import { AGENTIC_SETTINGS_HREF } from "../central/CentralPage"
import { WorkbenchPane } from "../workbench/WorkbenchPane"
import { TasksPane } from "./TasksPane"

/**
 * Central de desenvolvimento (`/desenvolvimento/[tarefa]`): a **central vem do navegador** e a
 * **tarefa vem da URL**. Trocar de central ou de tarefa não remonta a tela (a casca agrupa
 * `/desenvolvimento`): as colunas ficam e só o que mudou anima (a mesa ao trocar de tarefa, a lista
 * de tarefas ao trocar de central). Em "Todos os projetos" a lista junta todas as centrais e a mesa
 * usa a central do produto da tarefa aberta (a escolha "Todos" continua salva).
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
    const allSelected = isAllCentrals(storedId)
    const central = useMemo(() => pickActiveCentral(list, storedId, taskProjectId), [list, storedId, taskProjectId])
    // Escolha do seletor aguardando a tarefa sair da URL: enquanto houver, ela vence a central da tarefa.
    const pendingSelectionRef = useRef<string | null>(null)

    // A central efetiva (da tarefa, salva ou a primeira) fica gravada no navegador — exceto enquanto há
    // uma escolha explícita aguardando a tarefa sair da URL. Sem esse guarda, o render intermediário
    // (o `localStorage` atualiza de forma síncrona, mas a navegação é assíncrona) regravaria a central
    // do projeto da tarefa por cima da escolha do usuário (OPE-42).
    useEffect(() => {
        if (pendingSelectionRef.current) {
            if (!taskId) pendingSelectionRef.current = null
            return
        }
        // "Todos os projetos" fica salvo mesmo com uma tarefa aberta.
        if (allSelected) return
        if (central && central.id !== storedId) setCentralId(central.id)
    }, [taskId, central, storedId, setCentralId, allSelected])

    // Trocar de central limpa a tarefa da URL (a mesa aberta era de outro projeto).
    const selectCentral = (id: string) => {
        // "Todos os projetos" inclui o produto da tarefa aberta: a mesa continua aberta.
        if (id === ALL_CENTRALS_ID) {
            pendingSelectionRef.current = null
            setCentralId(id)
            return
        }
        // A escolha do usuário tem prioridade sobre a central derivada da tarefa até a URL ser limpa.
        pendingSelectionRef.current = id
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
        <WorkspaceShell
            ariaLabel="Central de desenvolvimento"
            measure={list.length > 0}
            detailOpen={Boolean(taskId)}
            viewKey={`${central?.id ?? "none"}-${taskId ?? ""}`}
            mainTestId="dev-center-workbench-pane"
            backHref={taskId ? DEV_CENTER_PATH : undefined}
            backLabel={taskId ? "Voltar para tarefas" : undefined}
            aside={
                central ? (
                    <TasksPane
                        central={allSelected ? null : central}
                        centrals={list}
                        activeTaskId={taskId}
                        onSelectCentral={selectCentral}
                        // No celular só um painel aparece: a lista quando não há tarefa; a mesa quando há.
                        className={cn(taskId ? "max-lg:hidden" : "max-lg:flex-1 max-lg:min-h-0")}
                    />
                ) : (
                    <Skeleton className="h-96 lg:w-[340px] lg:shrink-0" />
                )
            }
        >
            {central ? (
                <WorkbenchPane central={central} taskId={taskId} scopeName={allSelected ? null : central.projectName} />
            ) : (
                <Skeleton className="h-96" />
            )}
        </WorkspaceShell>
    )
}
