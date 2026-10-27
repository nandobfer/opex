"use client"

import { useState } from "react"
import { Eye, PanelRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { AdversarialVerdictFinding } from "@/features/agentic/types"
import { FindingList } from "../FindingList"
import { ReviewDetailDialog } from "../ReviewDetailDialog"
import { VerdictCard } from "../VerdictCard"
import { useAdversarialTabNav } from "./AdversarialRoundsView"

interface AdversarialVerdictItemProps {
    reviewId: string
    round: number
    level: string
    summary: string
    outcome: string
    findings: readonly AdversarialVerdictFinding[]
}

/**
 * Veredito de uma rodada na saída da mesa: desfecho, resumo e achados. Na mesa, "Ver na aba" abre a
 * aba "Adversário" nesta rodada; fora dela (sem a aba), o detalhe abre num diálogo.
 */
export function AdversarialVerdictItem({ reviewId, round, level, summary, outcome, findings }: AdversarialVerdictItemProps) {
    const [open, setOpen] = useState(false)
    const openTab = useAdversarialTabNav()
    const blocking = findings.filter((finding) => finding.blocking).length
    return (
        <VerdictCard
            round={round}
            level={level}
            outcome={outcome}
            tone={blocking ? "blocked" : "approved"}
            actions={
                openTab ? (
                    <Button type="button" variant="ghost" size="sm" className="h-7 gap-1" onClick={() => openTab(reviewId)}>
                        <PanelRight className="h-3.5 w-3.5" aria-hidden /> Ver na aba
                    </Button>
                ) : (
                    <Button type="button" variant="ghost" size="sm" className="h-7 gap-1" onClick={() => setOpen(true)}>
                        <Eye className="h-3.5 w-3.5" aria-hidden /> Detalhes
                    </Button>
                )
            }
        >
            {summary && <p className="text-sm">{summary}</p>}
            {findings.length > 0 && <FindingList findings={findings} />}
            {!openTab && <ReviewDetailDialog id={open ? reviewId : null} onClose={() => setOpen(false)} />}
        </VerdictCard>
    )
}
