"use client"

import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { CheckCircle2 } from "lucide-react"
import { Markdown } from "@/components/ui/markdown"
import { FORK_INTEGRATION_TARGET_LABELS } from "../../constants"
import type { ForkDto } from "../../types"

const when = (iso: string) => format(new Date(iso), "dd/MM 'às' HH:mm", { locale: ptBR })

/** Último bloco da conversa de um fork integrado: data, destino e o resumo aplicado. */
export function ForkIntegrated({ fork }: { fork: ForkDto }) {
    if (!fork.integration) return null
    return (
        <section className="space-y-2 rounded-r-md border-l-2 border-emerald-500/60 bg-emerald-500/5 py-2 pl-3 pr-2" aria-label="Resumo integrado">
            <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Integrado em {when(fork.integration.appliedAt)}: {FORK_INTEGRATION_TARGET_LABELS[fork.integration.target].label}
                {fork.integration.target === "parent" && fork.parentNumber !== null ? ` (Fork ${fork.parentNumber})` : ""}
            </p>
            <div className="text-sm [overflow-wrap:anywhere]">
                <Markdown>{fork.integration.summary}</Markdown>
            </div>
        </section>
    )
}

/** Aviso final de um fork concluído junto com a mesa. */
export function ForkConcluded({ fork }: { fork: ForkDto }) {
    return <p className="text-xs text-muted-foreground">Fork concluído junto com a mesa{fork.closedAt ? ` em ${when(fork.closedAt)}` : ""}: histórico somente leitura.</p>
}
