import type { ReactNode } from "react"
import { WorkbenchProgressProvider } from "@/features/agentic/components/WorkbenchProgressProvider"
import { TimerProvider } from "@/features/time/components/TimerProvider"

/**
 * Dashboards usa os mesmos contextos de Tarefas no cabeçalho: períodos ativos (`TimerProvider`) e
 * mesas em andamento (`WorkbenchProgressProvider`), que alimentam o indicador **Trabalhos em
 * andamento**. Ambos são somente leitura.
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
    return (
        <TimerProvider>
            <WorkbenchProgressProvider>{children}</WorkbenchProgressProvider>
        </TimerProvider>
    )
}
