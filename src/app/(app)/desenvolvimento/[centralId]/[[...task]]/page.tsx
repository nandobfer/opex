import { DevCenterPage } from "@/features/agentic/components/dev-center/DevCenterPage"

/** `/desenvolvimento/[central]` (tarefas do produto) e `/desenvolvimento/[central]/[tarefa]` (mesa de trabalho). */
export default async function DesenvolvimentoCentralPage({ params }: { params: Promise<{ centralId: string; task?: string[] }> }) {
    const { centralId, task = [] } = await params
    return <DevCenterPage centralId={centralId} taskId={task[0] ?? null} />
}
