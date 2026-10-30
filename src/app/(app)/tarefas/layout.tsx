import type { ReactNode } from "react"
import { RepoIndexProvider } from "@/features/github/components/RepoIndexProvider"
import { CentralColorsProvider } from "@/features/agentic/components/CentralColorsProvider"
import { WorkbenchProgressProvider } from "@/features/agentic/components/WorkbenchProgressProvider"
import { TimerProvider } from "@/features/time/components/TimerProvider"
import { TaskTaxonomyProvider } from "@/features/tasks/components/TaskTaxonomyProvider"

/**
 * Tarefas, página da tarefa e Horas agênticas compartilham os períodos ativos (somente leitura), o
 * índice de repositórios do GitHub e as cores das centrais (repositório na cor dela).
 */
export default function TarefasLayout({ children }: { children: ReactNode }) {
    return (
        <TimerProvider>
            <WorkbenchProgressProvider>
                <RepoIndexProvider enabled>
                    <CentralColorsProvider>
                        <TaskTaxonomyProvider>{children}</TaskTaxonomyProvider>
                    </CentralColorsProvider>
                </RepoIndexProvider>
            </WorkbenchProgressProvider>
        </TimerProvider>
    )
}
