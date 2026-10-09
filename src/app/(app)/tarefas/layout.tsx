import type { ReactNode } from "react"
import { TimerProvider } from "@/features/time/components/TimerProvider"

/** Tarefas, página da tarefa e Minhas horas compartilham os timers do Go! Sipal e o modal de parar. */
export default function TarefasLayout({ children }: { children: ReactNode }) {
    return <TimerProvider>{children}</TimerProvider>
}
