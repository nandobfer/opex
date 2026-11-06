import { RoutineAgentPage } from "@/features/routine-agents/components/page/RoutineAgentPage"

/** `/agentes-rotineiros/[id]`: página de um agente rotineiro. Ver aicontext/modules/routine-agents.md. */
export default async function AgenteRotineiroPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    return <RoutineAgentPage id={id} />
}
