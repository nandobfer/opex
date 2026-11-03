import { ConversationViewer } from "@/features/agent-metrics/components/ConversationViewer"

/** `/agente-opex/conversas/[id]`: conversa do Histórico, só leitura (dono ou portal). */
export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    return <ConversationViewer agent="opex" id={id} />
}
