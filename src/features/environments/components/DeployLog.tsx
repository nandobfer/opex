"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { CheckCircle2, Loader2, XCircle } from "lucide-react"
import { readNdjson } from "@/lib/ndjson-client"
import { cn } from "@/lib/utils"
import { IntegrationConsole, type IntegrationConsoleHandle } from "@/features/integrations/components/IntegrationConsole"
import { clockSkewMs } from "../deploy-progress"
import type { DeployStatus, DeployStreamEvent } from "../types"
import { DeployProgress, type DeployProgressMeta } from "./DeployProgress"

/** Espera entre as tentativas de reconectar e o tempo máximo sem conseguir (o app pode estar reiniciando). */
export const RECONNECT_DELAY_MS = 3_000
export const RECONNECT_MAX_MS = 180_000

type LogState = { value: DeployStatus; error: string | null; reconnecting: boolean }

/**
 * Log do deploy ao vivo (NDJSON) com o status, a barra de progresso e o terminal (OPE-208: saiu da gaveta para a
 * página `/ambientes/deploys/[id]`). O stream manda o log inteiro a cada conexão: reabrir a página, voltar a ela
 * ou reconectar redesenha o terminal do zero, sem perder nada.
 */
export function DeployLog({ deployId, className }: { deployId: string; className?: string }) {
    const consoleRef = useRef<IntegrationConsoleHandle>(null)
    const [status, setStatus] = useState<LogState>({ value: "running", error: null, reconnecting: false })
    // Início e estimativa do deploy em andamento (o `meta` chega de novo a cada conexão; o relógio segue o `startedAt`,
    // corrigido pela diferença para o relógio do servidor, medida de novo a cada `meta`).
    const [meta, setMeta] = useState<DeployProgressMeta | null>(null)

    useEffect(() => {
        const controller = new AbortController()
        // Início da sequência atual de quedas (zera quando uma conexão volta a entregar eventos).
        let failingSince: number | null = null
        let timer: ReturnType<typeof setTimeout> | null = null
        // O stream manda o log inteiro primeiro: cada conexão redesenha o console do zero.
        const connect = async () => {
            let pending = ""
            let first = true
            let ended = false
            let failure: string | null = null
            const flush = () => {
                const lines = pending.split("\n")
                pending = lines.pop() ?? ""
                if (lines.length) consoleRef.current?.writeLines(lines)
            }
            try {
                await readNdjson<DeployStreamEvent | { type: "ping" }>(
                    `/api/environments/deploys/${deployId}/events`,
                    (event) => {
                        if (first && event.type !== "ping") {
                            first = false
                            failingSince = null
                            consoleRef.current?.clear()
                            setStatus((current) => (current.reconnecting ? { ...current, reconnecting: false } : current))
                        }
                        if (event.type === "meta") {
                            setMeta({ ...event, skewMs: clockSkewMs(event.serverNow, Date.now()) })
                        } else if (event.type === "log") {
                            pending += event.text
                            flush()
                        } else if (event.type === "status") {
                            ended = true
                            if (pending) consoleRef.current?.writeLines([pending])
                            pending = ""
                            setStatus({ value: event.status, error: event.error, reconnecting: false })
                        }
                    },
                    { signal: controller.signal },
                )
            } catch (error) {
                failure = error instanceof Error ? error.message : "Falha ao ler o log"
            }
            if (controller.signal.aborted || ended) return
            if (pending) consoleRef.current?.writeLines([pending])
            // Conexão caiu (ou fechou sem o fim) antes do status final: o servidor pode estar reiniciando.
            failingSince ??= Date.now()
            if (Date.now() - failingSince > RECONNECT_MAX_MS) {
                setStatus({ value: "failed", error: `Sem conexão com o servidor para acompanhar o deploy${failure ? ` (${failure})` : ""}. Recarregue a página para tentar de novo.`, reconnecting: false })
                return
            }
            setStatus((current) => ({ ...current, reconnecting: true }))
            timer = setTimeout(() => void connect(), RECONNECT_DELAY_MS)
        }
        void connect()
        return () => {
            controller.abort()
            if (timer) clearTimeout(timer)
        }
    }, [deployId])

    const Icon = status.reconnecting ? Loader2 : status.value === "success" ? CheckCircle2 : status.value === "failed" ? XCircle : Loader2
    const spinning = status.reconnecting || status.value === "running"
    const key = status.reconnecting ? "reconnecting" : status.value
    return (
        <div className={cn("flex min-h-0 flex-col gap-3", className)} data-testid="deploy-log">
            <p role="status" aria-live="polite" className="min-h-5 shrink-0 text-sm">
                <AnimatePresence mode="wait" initial={false}>
                    <motion.span key={key} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="flex items-center gap-1.5">
                        <Icon className={cn("h-4 w-4 shrink-0", spinning ? "animate-spin text-muted-foreground" : status.value === "success" ? "text-success" : "text-destructive")} aria-hidden />
                        <span className={cn(status.value === "failed" && !status.reconnecting && "text-destructive")}>
                            {status.reconnecting ? "Reconectando ao servidor…" : status.value === "running" ? "Em andamento…" : status.value === "success" ? "Concluído" : `Falhou${status.error ? `: ${status.error}` : ""}`}
                        </span>
                    </motion.span>
                </AnimatePresence>
            </p>
            <AnimatePresence initial={false}>
                {meta && status.value === "running" && (
                    <motion.div key="deploy-progress" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="shrink-0 overflow-hidden">
                        <DeployProgress meta={meta} />
                    </motion.div>
                )}
            </AnimatePresence>
            <IntegrationConsole ref={consoleRef} className="min-h-0 flex-1" placeholder="Aguardando o log…" />
        </div>
    )
}
