import { TaskDetailPage } from "@/features/tasks/components/detail/TaskDetailPage"

export default async function TarefaPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    return <TaskDetailPage id={id} />
}
