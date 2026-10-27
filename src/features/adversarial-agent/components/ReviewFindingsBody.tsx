"use client"

import type { AdversarialReviewDetailDto } from "../types"
import { sortFindings } from "../verdict"
import { FindingList } from "./FindingList"

/** Saída final de uma rodada: erro, resumo, achados (bloqueantes primeiro), contestações e a orientação do usuário. */
export function ReviewFindingsBody({ review }: { review: AdversarialReviewDetailDto }) {
    return (
        <>
            {review.error && <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{review.error}</p>}
            {review.summary && <p className="text-sm">{review.summary}</p>}
            {(review.state === "done" || review.findings.length > 0) && <FindingList findings={sortFindings(review.findings)} detailed />}
            {review.disputes.length > 0 && (
                <section className="space-y-1">
                    <h3 className="text-sm font-medium">Contestações do implementador</h3>
                    <ul className="space-y-1 text-xs text-muted-foreground">
                        {review.disputes.map((dispute) => (
                            <li key={dispute.id}>
                                <span className="font-mono">{dispute.id}</span>: {dispute.reason}
                            </li>
                        ))}
                    </ul>
                </section>
            )}
            {review.userText && (
                <section className="space-y-1">
                    <h3 className="text-sm font-medium">Sua orientação ao corrigir</h3>
                    <p className="whitespace-pre-wrap text-xs text-muted-foreground">{review.userText}</p>
                </section>
            )}
        </>
    )
}
