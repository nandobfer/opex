import type { ReactNode } from "react"
import { TimerProvider } from "@/features/time/components/TimerProvider"

/** Tarefas, página da tarefa e Horas agênticas compartilham os períodos ativos (somente leitura). */
export default function TarefasLayout({ children }: { children: ReactNode }) {
    return <TimerProvider>{children}</TimerProvider>
}
