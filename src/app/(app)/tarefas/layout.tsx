import type { ReactNode } from "react"
import { RepoIndexProvider } from "@/features/github/components/RepoIndexProvider"
import { WorkbenchProgressProvider } from "@/features/agentic/components/WorkbenchProgressProvider"
import { TimerProvider } from "@/features/time/components/TimerProvider"
import { TaskTaxonomyProvider } from "@/features/tasks/components/TaskTaxonomyProvider"

/** Tarefas, página da tarefa e Horas agênticas compartilham os períodos ativos (somente leitura) e o índice de repositórios do GitHub. */
export default function TarefasLayout({ children }: { children: ReactNode }) {
    return (
        <TimerProvider>
            <WorkbenchProgressProvider>
                <RepoIndexProvider enabled>
                    <TaskTaxonomyProvider>{children}</TaskTaxonomyProvider>
                </RepoIndexProvider>
            </WorkbenchProgressProvider>
        </TimerProvider>
    )
}
