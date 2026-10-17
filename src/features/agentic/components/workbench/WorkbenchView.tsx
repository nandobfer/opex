"use client"

import { useState } from "react"
import { ViewTabs, type ViewTabDef } from "@/components/ui/view-tabs"
import { useWorkbenchForks } from "../../hooks/useForks"
import { useWorkbenchStream } from "../../hooks/useWorkbenchStream"
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

/** Mesa de trabalho: cabeçalho, etapas, saída ao vivo (ou o plano, ou os forks), pedidos do agente e ações. */
export function WorkbenchView({ workbench, central }: { workbench: WorkbenchDto; central: CentralDto }) {
    const { timeline, connected } = useWorkbenchStream(workbench.id)
    const [selected, setView] = useState<View>("output")
    const [forkId, setForkId] = useState<string | null>(null)
    const forks = useWorkbenchForks(workbench.id).data ?? []
    const plans = workbench.plans
    // Sem forks (todos descartados), a aba some e a visão volta para a saída.
    const view: View = selected === "forks" && !forks.length ? "output" : selected
    const tabs: ViewTabDef<View>[] = [
        { id: "output", label: "Saída da IA" },
        { id: "plan", label: plans.length ? `Plano v${plans.length}` : "Plano", disabled: !plans.length },
        { id: "forks", label: `Forks (${forks.length})`, hidden: !forks.length },
    ]

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <WorkbenchHeader workbench={workbench} central={central} connected={connected} />
            <StageSteps stage={workbench.stage} runState={workbench.runState} flow={workbench.agenticFlow} />
            <ViewTabs tabs={tabs} active={view} onChange={setView} label="Visão da mesa">
                {view === "output" ? (
                    <Timeline timeline={timeline} running={workbench.runState === "running"} />
                ) : view === "plan" ? (
                    <PlanView plans={plans} />
                ) : (
                    <ForkView workbench={workbench} forks={forks} selectedId={forkId} onSelect={setForkId} />
                )}
            </ViewTabs>
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
    )
}
