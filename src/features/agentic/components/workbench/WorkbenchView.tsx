"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { useWorkbenchStream } from "../../hooks/useWorkbenchStream"
import type { CentralDto, WorkbenchDto } from "../../types"
import { ActionBar } from "./ActionBar"
import { PendingRequests } from "./PendingRequests"
import { PlanView } from "./PlanView"
import { StageSteps } from "./StageSteps"
import { Timeline } from "./Timeline"
import { WorkbenchHeader } from "./WorkbenchHeader"

type View = "output" | "plan"

/** Mesa de trabalho: cabeçalho, etapas, saída ao vivo (ou o plano), pedidos do agente e ações. */
export function WorkbenchView({ workbench, central }: { workbench: WorkbenchDto; central: CentralDto }) {
    const { timeline, connected } = useWorkbenchStream(workbench.id)
    const [view, setView] = useState<View>("output")
    const plans = workbench.plans
    const tabs: { id: View; label: string; disabled?: boolean }[] = [
        { id: "output", label: "Saída da IA" },
        { id: "plan", label: plans.length ? `Plano v${plans.length}` : "Plano", disabled: !plans.length },
    ]

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <WorkbenchHeader workbench={workbench} central={central} connected={connected} />
            <StageSteps stage={workbench.stage} runState={workbench.runState} />
            <div role="tablist" aria-label="Visão da mesa" className="flex gap-1 border-b px-4">
                {tabs.map((tab) => (
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
                    {view === "output" ? <Timeline timeline={timeline} running={workbench.runState === "running"} /> : <PlanView plans={plans} />}
                </motion.div>
            </AnimatePresence>
            <PendingRequests workbench={workbench} />
            <ActionBar workbench={workbench} />
        </div>
    )
}
