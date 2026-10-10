import { DevCenterPage } from "@/features/agentic/components/dev-center/DevCenterPage"

/** `/desenvolvimento/[tarefa]`: mesa de trabalho da tarefa (a central vem do navegador). */
export default async function DesenvolvimentoTaskPage({ params }: { params: Promise<{ taskId: string }> }) {
    const { taskId } = await params
    return <DevCenterPage taskId={taskId} />
}
