import { ConversationViewer } from "@/features/agent-metrics/components/ConversationViewer"

/** `/agente-maddox/conversas/[id]`: conversa do Histórico, só leitura (dono ou portal). */
export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    return <ConversationViewer agent="maddox" id={id} />
}
