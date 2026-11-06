"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { FileCode2, FileText } from "lucide-react"
import { ReplyTargetProvider } from "@/components/agent-reply/ReplyTargetProvider"
import { useTaskDetail } from "@/features/tasks/hooks/useTasks"
import { useRefinementRealtime, useTaskRefinement } from "@/features/refinement/hooks/useRefinement"
import { useRefinementStream } from "@/features/refinement/hooks/useRefinementStream"
import { RefinementRequests } from "@/features/refinement/components/RefinementRequests"
import type { CentralDto, WorkbenchDto } from "../../types"
import { RefinementActionBar } from "./RefinementActionBar"
import { StageSteps } from "./StageSteps"
import { TaskTextView } from "./TaskTextView"
import { Timeline } from "./Timeline"
import { WorkbenchHeader } from "./WorkbenchHeader"
import { WorkbenchTabs, type WorkbenchTab } from "./WorkbenchTabs"

type View = "description" | "spec" | "output"

const TABS: readonly WorkbenchTab<View>[] = [
    { id: "description", label: "Descrição" },
    { id: "spec", label: "Especificação" },
    { id: "output", label: "Saída da IA" },
]

/** Concluiu de verdade (não encerrado): a visão troca sozinha para a especificação (item 14). */
export function showsSpecAfter(previous: WorkbenchDto["stage"], current: WorkbenchDto["stage"], closed: boolean): boolean {
    return previous === "refining" && current === "spec_ready" && !closed
}

/**
 * Mesa no refinamento (OPE-137): a mesma visão da mesa (cabeçalho, etapas e as abas Descrição,
 * Especificação e Saída da IA), com a conversa do Agente Refinador — o MESMO refinamento da aba da
 * página da tarefa (stream, perguntas e ações). As perguntas e permissões ficam abaixo da saída.
 */
export function RefinementWorkbenchView({ workbench, central }: { workbench: WorkbenchDto; central: CentralDto }) {
    useRefinementRealtime(workbench.taskId)
    const task = useTaskDetail(workbench.taskId)
    const state = useTaskRefinement(workbench.taskId)
    const refinement = state.data?.refinement ?? null
    const { timeline, connected } = useRefinementStream(refinement ? workbench.taskId : null)
    const [view, setView] = useState<View>(workbench.stage === "spec_ready" ? "spec" : "output")
    const previousStage = useRef(workbench.stage)
    useEffect(() => {
        if (showsSpecAfter(previousStage.current, workbench.stage, Boolean(refinement?.closed))) setView("spec")
        previousStage.current = workbench.stage
    }, [workbench.stage, refinement?.closed])

    return (
        <ReplyTargetProvider>
            <div className="flex min-h-0 flex-1 flex-col">
                <WorkbenchHeader workbench={workbench} central={central} connected={connected} />
                <StageSteps stage={workbench.stage} runState={workbench.runState} flow={workbench.agenticFlow} adversarial={workbench.adversarial} refinement />
                <WorkbenchTabs tabs={TABS} value={view} onChange={setView} label="Visão da mesa" indicatorId="workbench-view-tab" />
                <AnimatePresence mode="wait" initial={false}>
                    <motion.div key={view} role="tabpanel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex min-h-0 flex-1 flex-col">
                        {view === "description" ? (
                            <TaskTextView query={task} field="description" emptyTitle="Sem descrição." emptyIcon={FileText} />
                        ) : view === "spec" ? (
                            <TaskTextView query={task} field="technicalSpec" emptyTitle="Sem especificação técnica." emptyIcon={FileCode2} />
                        ) : (
                            <Timeline timeline={timeline} running={refinement?.runState === "running"} />
                        )}
                    </motion.div>
                </AnimatePresence>
                {refinement && workbench.stage === "refining" && (
                    <div className="max-h-[45%] overflow-y-auto border-t px-3 empty:hidden [&>div]:my-3">
                        <RefinementRequests taskId={workbench.taskId} refinement={refinement} />
                    </div>
                )}
                <RefinementActionBar workbench={workbench} state={state.data} />
            </div>
        </ReplyTargetProvider>
    )
}
