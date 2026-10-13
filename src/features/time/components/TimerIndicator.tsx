"use client"

import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import { ChevronRight, Timer, TriangleAlert } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { workbenchPath } from "@/features/agentic/constants"
import { useWorkbenchProgress } from "@/features/agentic/components/WorkbenchProgressProvider"
import { cn } from "@/lib/utils"
import type { TimeLogDto } from "../types"
import { RunningClock } from "./RunningClock"
import { useTimer } from "./TimerProvider"

/** Linha da lista "Trabalhos em andamento": executando (cronômetro) ou aguardando ação humana. */
interface WorkRow {
    key: string
    code: string | null
    title: string | null
    running: boolean
    /** O que o agente espera (pt-BR) quando não está executando. */
    waitingFor: string | null
    /** Início do período ativo (para o cronômetro), quando executando. */
    startTime: string | null
    /** Link para a mesa de trabalho (ou a tarefa, em apontamentos legados sem mesa). */
    href: string
}

const hrefForLog = (log: TimeLogDto) => `/tarefas/${log.taskId}`

/**
 * Indicador de trabalho em andamento (topo das telas): ícone girando + cronômetro quando algum
 * agente executa, ou aviso (warning) quando só há mesas aguardando ação humana. **Somente leitura**
 * — clique abre a lista dos trabalhos em andamento; cada item navega para a mesa de trabalho.
 *
 * Com `fullWidth`, no **celular** (`< md`) o contêiner **e o botão** ocupam a linha inteira
 * (conteúdo centralizado); no desktop segue compacto. Usado em Dashboard, Tarefas e Horas agênticas.
 */
export function TimerIndicator({ className, fullWidth = false }: { className?: string; fullWidth?: boolean } = {}) {
    const timer = useTimer()
    const progress = useWorkbenchProgress()
    const active = timer?.active ?? []

    const byWorkbench = new Map(active.filter((log) => log.workbenchId).map((log) => [log.workbenchId as string, log]))
    const seen = new Set<string>()
    const rows: WorkRow[] = []

    // Mesas em andamento (executando ou aguardando ação) — a fonte principal da lista.
    for (const item of progress?.items ?? []) {
        seen.add(item.workbenchId)
        rows.push({
            key: item.workbenchId,
            code: item.taskCode,
            title: item.taskTitle,
            running: item.running,
            waitingFor: item.waitingFor,
            startTime: byWorkbench.get(item.workbenchId)?.startTime ?? null,
            href: workbenchPath(item.taskId),
        })
    }

    // Períodos ativos sem mesa (apontamentos legados): continuam como trabalho em andamento.
    for (const log of active) {
        if (log.workbenchId && seen.has(log.workbenchId)) continue
        rows.push({
            key: log.id,
            code: log.taskCode,
            title: log.taskTitle,
            running: true,
            waitingFor: null,
            startTime: log.startTime,
            href: hrefForLog(log),
        })
    }

    const running = rows.filter((row) => row.running)
    const anyRunning = running.length > 0
    const first = running[0] ?? rows[0]

    const body = first && (
        <>
            {anyRunning ? (
                <>
                    <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2.4, ease: "linear" }} className="inline-flex" aria-hidden>
                        <Timer className="h-4 w-4" />
                    </motion.span>
                    {first.startTime && <RunningClock startTime={first.startTime} className="text-xs font-semibold" />}
                    {rows.length > 1 && <span className="rounded-full bg-success px-1.5 text-[10px] font-bold text-background">{rows.length}</span>}
                </>
            ) : (
                <>
                    <TriangleAlert className="h-4 w-4" aria-hidden />
                    <span className="text-xs font-semibold">{rows.length === 1 ? "Aguardando ação" : `${rows.length} aguardando ação`}</span>
                </>
            )}
        </>
    )

    const triggerClassName = cn(
        "inline-flex h-9 items-center gap-2 rounded-md border px-3 transition-colors focus-visible:outline-none focus-visible:ring-2",
        fullWidth && "max-md:flex max-md:w-full max-md:justify-center",
        anyRunning ? "border-success/40 bg-success/10 text-success hover:bg-success/20 focus-visible:ring-success" : "border-warning/40 bg-warning/10 text-warning hover:bg-warning/20 focus-visible:ring-warning",
    )
    const label = anyRunning
        ? rows.length === 1
            ? `Trabalho em andamento em ${first?.code ?? first?.title ?? "tarefa"}`
            : `${rows.length} trabalhos em andamento`
        : rows.length === 1
          ? `Aguardando ação em ${first?.code ?? first?.title ?? "tarefa"}`
          : `${rows.length} trabalhos aguardando ação`

    return (
        <AnimatePresence initial={false}>
            {first && (
                <motion.div key="timer-indicator" initial={{ opacity: 0, scale: 0.85, x: 8 }} animate={{ opacity: 1, scale: 1, x: 0 }} exit={{ opacity: 0, scale: 0.85, x: 8 }} transition={{ duration: 0.2 }} className={cn(fullWidth && "max-md:w-full", className)}>
                    <Popover>
                        <PopoverTrigger className={triggerClassName} aria-label={label}>
                            {body}
                        </PopoverTrigger>
                        <PopoverContent align="end" data-testid="in-progress-popover" className="w-max max-w-[calc(100vw-2rem)] p-1">
                            <p className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Trabalhos em andamento</p>
                            <AnimatePresence initial={false}>
                                {rows.map((row) => (
                                    <ActiveRow key={row.key} row={row} />
                                ))}
                            </AnimatePresence>
                        </PopoverContent>
                    </Popover>
                </motion.div>
            )}
        </AnimatePresence>
    )
}

function ActiveRow({ row }: { row: WorkRow }) {
    return (
        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <Link
                href={row.href}
                aria-label={row.code ? `Abrir a mesa de ${row.code}` : "Abrir a mesa de trabalho"}
                className="flex items-center gap-2 rounded-md px-2 py-2 text-xs transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
            >
                <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1">
                        {row.code && <span className="font-mono font-semibold text-primary">{row.code}</span>}
                        <span className="truncate">{row.title ?? "Sem tarefa"}</span>
                    </span>
                    {row.running ? (
                        <span className="mt-0.5 block truncate text-muted-foreground">Em execução</span>
                    ) : (
                        <span className="mt-0.5 flex min-w-0 items-center gap-1 text-warning">
                            <TriangleAlert className="h-3 w-3 shrink-0" aria-hidden />
                            <span className="truncate" title={row.waitingFor ?? undefined}>
                                {row.waitingFor}
                            </span>
                        </span>
                    )}
                </span>
                {row.running ? (
                    row.startTime && <RunningClock startTime={row.startTime} className="text-success" />
                ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                )}
            </Link>
        </motion.div>
    )
}
