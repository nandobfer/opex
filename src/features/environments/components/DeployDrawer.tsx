"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { CheckCircle2, Loader2, XCircle } from "lucide-react"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { readNdjson } from "@/lib/ndjson-client"
import { IntegrationConsole, type IntegrationConsoleHandle } from "@/features/integrations/components/IntegrationConsole"
import type { DeployEvent, DeployStatus } from "../types"

/** Log do deploy ao vivo (NDJSON) num drawer com o terminal. */
export function DeployDrawer({ deployId, title, onClose }: { deployId: string | null; title: string; onClose: () => void }) {
    return (
        <Sheet open={deployId !== null} onOpenChange={(open) => !open && onClose()}>
            <SheetContent side="right" className="flex w-full flex-col gap-4 sm:max-w-3xl">
                {deployId && <DeployLog key={deployId} deployId={deployId} title={title} />}
            </SheetContent>
        </Sheet>
    )
}

/** Espera entre as tentativas de reconectar e o tempo máximo sem conseguir (o app pode estar reiniciando). */
export const RECONNECT_DELAY_MS = 3_000
export const RECONNECT_MAX_MS = 180_000

type LogState = { value: DeployStatus; error: string | null; reconnecting: boolean }

function DeployLog({ deployId, title }: { deployId: string; title: string }) {
    const consoleRef = useRef<IntegrationConsoleHandle>(null)
    const [status, setStatus] = useState<LogState>({ value: "running", error: null, reconnecting: false })

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
                await readNdjson<DeployEvent | { type: "ping" }>(
                    `/api/environments/deploys/${deployId}/events`,
                    (event) => {
                        if (first && event.type !== "ping") {
                            first = false
                            failingSince = null
                            consoleRef.current?.clear()
                            setStatus((current) => (current.reconnecting ? { ...current, reconnecting: false } : current))
                        }
                        if (event.type === "log") {
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
                setStatus({ value: "failed", error: `Sem conexão com o servidor para acompanhar o deploy${failure ? ` (${failure})` : ""}. Feche e abra o log de novo.`, reconnecting: false })
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

    const Icon = status.value === "success" ? CheckCircle2 : status.value === "failed" ? XCircle : Loader2
    const key = status.reconnecting ? "reconnecting" : status.value
    return (
        <>
            <SheetHeader>
                <SheetTitle>Deploy de {title}</SheetTitle>
                <SheetDescription asChild>
                    <AnimatePresence mode="wait" initial={false}>
                        <motion.span key={key} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="flex items-center gap-1.5">
                            <Icon className={status.value === "running" ? "h-4 w-4 animate-spin" : status.value === "success" ? "h-4 w-4 text-success" : "h-4 w-4 text-destructive"} aria-hidden />
                            {status.reconnecting ? "Reconectando ao servidor…" : status.value === "running" ? "Em andamento…" : status.value === "success" ? "Concluído" : `Falhou${status.error ? `: ${status.error}` : ""}`}
                        </motion.span>
                    </AnimatePresence>
                </SheetDescription>
            </SheetHeader>
            <IntegrationConsole ref={consoleRef} className="min-h-0 flex-1" placeholder="Aguardando o log…" />
        </>
    )
}
