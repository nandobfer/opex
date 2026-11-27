import { RoutineRunPage } from "@/features/routine-agents/components/runs/RoutineRunPage"

/** `/agentes-rotineiros/[id]/execucoes/[runId]`: uma execução do agente rotineiro (OPE-208). Ver aicontext/modules/routine-agents.md. */
export default async function ExecucaoRotineiroPage({ params }: { params: Promise<{ id: string; runId: string }> }) {
    const { id, runId } = await params
    return <RoutineRunPage agentId={id} runId={runId} />
}
