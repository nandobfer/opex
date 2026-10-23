"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { ReplyTargetProvider } from "@/components/agent-reply/ReplyTargetProvider"
import { usePrWatchSchedule } from "../../hooks/useAgentic"
import { useWorkbenchForks } from "../../hooks/useForks"
import { useWorkbenchStream } from "../../hooks/useWorkbenchStream"
import { latestPrWatch, nextPrWatchAt } from "../../timeline"
import type { CentralDto, WorkbenchDto } from "../../types"
import { ActionBar } from "./ActionBar"
import { ForksDonePrompt } from "./ForksDonePrompt"
import { ForkView } from "./ForkView"
import { PendingRequests } from "./PendingRequests"
import { PlanView } from "./PlanView"
import { StageSteps } from "./StageSteps"
import { Timeline } from "./Timeline"
import { WorkbenchHeader } from "./WorkbenchHeader"

type View = "output" | "plan" | "forks"

/**
 * Mesa de trabalho: cabeçalho, etapas, saída ao vivo (ou o plano, ou os forks), pedidos do agente e
 * ações. Cada linha da saída e do plano tem "Citar no campo de resposta" (`ReplyTargetProvider`).
 */
export function WorkbenchView({ workbench, central }: { workbench: WorkbenchDto; central: CentralDto }) {
    const { timeline, connected } = useWorkbenchStream(workbench.id)
    const [selected, setView] = useState<View>("output")
    const [forkId, setForkId] = useState<string | null>(null)
    const forks = useWorkbenchForks(workbench.id).data ?? []
    const plans = workbench.plans
    // PR aberto e parado: a saída mostra quando o acompanhamento do PR verifica de novo.
    const watchingPr = workbench.stage === "pr_open" && workbench.runState !== "running"
    const schedule = usePrWatchSchedule(watchingPr).data
    const lastCheck = latestPrWatch(timeline.items)
    const prWatch = watchingPr && schedule ? { enabled: schedule.enabled, nextCheckAt: nextPrWatchAt(schedule.nextCheckAt, lastCheck?.nextCheckAt), checking: lastCheck?.outcome === null } : null
    // Sem forks (todos descartados), a aba some e a visão volta para a saída.
    const view: View = selected === "forks" && !forks.length ? "output" : selected
    const tabs: { id: View; label: string; disabled?: boolean; hidden?: boolean }[] = [
        { id: "output", label: "Saída da IA" },
        { id: "plan", label: plans.length ? `Plano v${plans.length}` : "Plano", disabled: !plans.length },
        { id: "forks", label: `Forks (${forks.length})`, hidden: !forks.length },
    ]

    return (
        <ReplyTargetProvider>
        <div className="flex min-h-0 flex-1 flex-col">
            <WorkbenchHeader workbench={workbench} central={central} connected={connected} />
            <StageSteps stage={workbench.stage} runState={workbench.runState} flow={workbench.agenticFlow} />
            <div role="tablist" aria-label="Visão da mesa" className="flex gap-1 border-b px-4">
                {tabs.filter((tab) => !tab.hidden).map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={view === tab.id}
                        disabled={tab.disabled}
                        onClick={() => setView(tab.id)}
                        className={cn("relative px-3 pb-2 pt-1 text-sm transition-colors disabled:opacity-40", view === tab.id ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
                    >
                        {tab.label}
                        {view === tab.id && <motion.span layoutId="workbench-view-tab" className="absolute inset-x-0 -bottom-px h-0.5 rounded bg-primary" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                    </button>
                ))}
            </div>
            <AnimatePresence mode="wait" initial={false}>
                <motion.div key={view} role="tabpanel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex min-h-0 flex-1 flex-col">
                    {view === "output" ? (
                        <Timeline timeline={timeline} running={workbench.runState === "running"} prWatch={prWatch} />
                    ) : view === "plan" ? (
                        <PlanView plans={plans} />
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
        </ReplyTargetProvider>
    )
}
