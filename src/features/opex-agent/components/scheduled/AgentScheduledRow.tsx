"use client"

import type { ReactNode } from "react"
import { motion } from "framer-motion"
import { AlertCircle, Building2, ExternalLink } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import type { OpexJobOriginDto } from "../../jobs"
import { requestOpenOpexSession } from "../../open-session"

/**
 * Peças compartilhadas das listas do Agente Opex em Integrações › Crons (Jobs e Observações, OPE-194):
 * a linha animada, o selo de origem do portal, "Abrir sessão", o erro da linha e o skeleton (mesmas
 * dimensões da linha real).
 */

export const AGENT_ROW_CLASS = "rounded-lg border bg-card/60 p-3"
const AGENT_ROW_SKELETON_CLASS = "h-20 w-full"

const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" })

/** Data e hora de Brasília, curta. */
export function formatAgentDate(iso: string): string {
    return dateFormatter.format(new Date(iso))
}

export function AgentScheduledRow({ testId, children }: { testId: string; children: ReactNode }) {
    return (
        <motion.li layout="position" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.2, ease: "easeOut" }} className={AGENT_ROW_CLASS} data-testid={testId}>
            {children}
        </motion.li>
    )
}

/** Item de um usuário do portal: cliente · usuário. */
export function AgentOriginBadge({ origin, title }: { origin: OpexJobOriginDto; title: string }) {
    if (origin.kind !== "client") return null
    return (
        <Badge variant="outline" className="gap-1 text-[10px]" title={title}>
            <Building2 className="h-3 w-3" aria-hidden /> {origin.clientName} · {origin.userName}
        </Badge>
    )
}

export function AgentOpenSessionButton({ sessionId, label }: { sessionId: string; label: string }) {
    return (
        <Button type="button" size="sm" variant="ghost" className="h-8 gap-1.5" onClick={() => requestOpenOpexSession(sessionId)} aria-label={`Abrir sessão: ${label}`}>
            <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Abrir sessão
        </Button>
    )
}

export function AgentRowError({ message }: { message: string }) {
    return (
        <p className="mt-2 flex items-start gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive" role="alert">
            <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden /> {message}
        </p>
    )
}

export function AgentScheduledSkeleton() {
    return (
        <div className="space-y-2" aria-busy="true">
            {[0, 1, 2].map((item) => (
                <Skeleton key={item} className={AGENT_ROW_SKELETON_CLASS} />
            ))}
        </div>
    )
}
