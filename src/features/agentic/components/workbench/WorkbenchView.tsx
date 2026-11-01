"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { FileCode2, FileText } from "lucide-react"
import { cn } from "@/lib/utils"
import { ReplyTargetProvider } from "@/components/agent-reply/ReplyTargetProvider"
import { useTaskDetail } from "@/features/tasks/hooks/useTasks"
import { usePrWatchSchedule } from "../../hooks/useAgentic"
import { useWorkbenchBuilds } from "../../hooks/useBuilds"
import { useWorkbenchForks } from "../../hooks/useForks"
import { useWorkbenchStream } from "../../hooks/useWorkbenchStream"
import { latestPrWatch, nextPrWatchAt } from "../../timeline"
import type { CentralDto, WorkbenchDto } from "../../types"
import { ActionBar } from "./ActionBar"
import { BuildLogView } from "./BuildLogView"
import { ForksDonePrompt } from "./ForksDonePrompt"
import { ForkView } from "./ForkView"
import { PendingRequests } from "./PendingRequests"
import { PlanView } from "./PlanView"
import { StageSteps } from "./StageSteps"
import { TaskTextView } from "./TaskTextView"
import { Timeline } from "./Timeline"
import { WorkbenchHeader } from "./WorkbenchHeader"
import { AdversarialRoundsView, AdversarialTabNavProvider, useAdversarialTab } from "@/features/adversarial-agent/components/workbench/AdversarialRoundsView"
import { ArchitectTab, useArchitectTab } from "@/features/architect-agent/components/workbench/ArchitectTab"

type View = "description" | "spec" | "output" | "plan" | "build" | "adversarial" | "architect" | "forks"

/**
 * Mesa de trabalho: cabeçalho, etapas, descrição e spec. da tarefa (só leitura), saída ao vivo (ou o
 * plano, as rodadas do agente adversário ou os forks), pedidos do agente e ações. A mesa abre na saída da IA. Cada linha da saída e do plano tem "Citar no campo de resposta" (`ReplyTargetProvider`).
 */
export function WorkbenchView({ workbench, central }: { workbench: WorkbenchDto; central: CentralDto }) {
    const { timeline, connected } = useWorkbenchStream(workbench.id)
    const task = useTaskDetail(workbench.taskId)
    const [selected, setView] = useState<View>("output")
    const [forkId, setForkId] = useState<string | null>(null)
    const forks = useWorkbenchForks(workbench.id).data ?? []
    // Builds da prévia (etapa "Subindo a prévia"): a aba só aparece depois do primeiro (`null` = o mais recente).
    const buildCount = useWorkbenchBuilds(workbench.id).data?.length ?? 0
    const [buildId, setBuildId] = useState<string | null>(null)
    // Agente Adversário: aba com a saída final de cada rodada (`null` = a mais recente).
    const adversarialTab = useAdversarialTab(workbench)
    const [adversarialRound, setAdversarialRound] = useState<string | null>(null)
    // Agente Arquiteto: diagrama do plano aprovado (paralelo à mesa; não é etapa).
    const architectTab = useArchitectTab(workbench)
    const openAdversarialRound = (reviewId: string) => {
        setAdversarialRound(reviewId)
        setView("adversarial")
    }
    const plans = workbench.plans
    // PR aberto e parado: a saída mostra quando o acompanhamento do PR verifica de novo.
    const watchingPr = workbench.stage === "pr_open" && workbench.runState !== "running"
    const schedule = usePrWatchSchedule(watchingPr).data
    const lastCheck = latestPrWatch(timeline.items)
    const prWatch = watchingPr && schedule ? { enabled: schedule.enabled, nextCheckAt: nextPrWatchAt(schedule.nextCheckAt, lastCheck?.nextCheckAt), checking: lastCheck?.outcome === null } : null
    // Sem forks (todos descartados) ou sem rodadas do adversário, a aba some e a visão volta para a saída.
    const view: View = (selected === "forks" && !forks.length) || (selected === "adversarial" && !adversarialTab.visible) || (selected === "architect" && !architectTab.visible) || (selected === "build" && !buildCount) ? "output" : selected
    const tabs: { id: View; label: string; disabled?: boolean; hidden?: boolean }[] = [
        { id: "description", label: "Descrição" },
        { id: "spec", label: "Spec." },
        { id: "output", label: "Saída da IA" },
        { id: "plan", label: plans.length ? `Plano v${plans.length}` : "Plano", disabled: !plans.length },
        { id: "build", label: `Build (${buildCount})`, hidden: !buildCount },
        { id: "adversarial", label: `Adversário (${adversarialTab.count})`, hidden: !adversarialTab.visible },
        { id: "architect", label: `Arquitetura (${architectTab.count})`, hidden: !architectTab.visible },
        { id: "forks", label: `Forks (${forks.length})`, hidden: !forks.length },
    ]

    return (
        <ReplyTargetProvider>
        <AdversarialTabNavProvider value={adversarialTab.visible ? openAdversarialRound : null}>
        <div className="flex min-h-0 flex-1 flex-col">
            <WorkbenchHeader workbench={workbench} central={central} connected={connected} />
            <StageSteps stage={workbench.stage} runState={workbench.runState} flow={workbench.agenticFlow} adversarial={workbench.adversarial} />
            <div role="tablist" aria-label="Visão da mesa" className="flex gap-1 overflow-x-auto border-b px-4">
                {tabs.filter((tab) => !tab.hidden).map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={view === tab.id}
                        disabled={tab.disabled}
                        onClick={() => setView(tab.id)}
                        className={cn("relative shrink-0 whitespace-nowrap px-3 pb-2 pt-1 text-sm transition-colors disabled:opacity-40", view === tab.id ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
                    >
                        {tab.label}
                        {view === tab.id && <motion.span layoutId="workbench-view-tab" className="absolute inset-x-0 bottom-0 h-0.5 rounded bg-primary" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                    </button>
                ))}
            </div>
            <AnimatePresence mode="wait" initial={false}>
                <motion.div key={view} role="tabpanel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex min-h-0 flex-1 flex-col">
                    {view === "description" ? (
                        <TaskTextView taskId={workbench.taskId} query={task} field="description" emptyTitle="Sem descrição." emptyIcon={FileText} />
                    ) : view === "spec" ? (
                        <TaskTextView taskId={workbench.taskId} query={task} field="technicalSpec" emptyTitle="Sem especificação técnica." emptyIcon={FileCode2} />
                    ) : view === "output" ? (
                        <Timeline timeline={timeline} running={workbench.runState === "running"} prWatch={prWatch} />
                    ) : view === "plan" ? (
                        <PlanView plans={plans} />
                    ) : view === "build" ? (
                        <BuildLogView workbenchId={workbench.id} selectedId={buildId} onSelect={setBuildId} />
                    ) : view === "adversarial" ? (
                        <AdversarialRoundsView workbenchId={workbench.id} selectedId={adversarialRound} onSelect={setAdversarialRound} />
                    ) : view === "architect" ? (
                        <ArchitectTab workbench={workbench} />
                    ) : (
                        <ForkView workbench={workbench} forks={forks} selectedId={forkId} onSelect={setForkId} />
                    )}
                </motion.div>
            </AnimatePresence>
            {view !== "forks" && <PendingRequests workbench={workbench} />}
            <ForksDonePrompt workbench={workbench} />
            {view !== "forks" && (
                <ActionBar
                    workbench={workbench}
                    onForkOpened={(fork) => {
                        setForkId(fork.id)
                        setView("forks")
                    }}
                />
            )}
        </div>
        </AdversarialTabNavProvider>
        </ReplyTargetProvider>
    )
}
