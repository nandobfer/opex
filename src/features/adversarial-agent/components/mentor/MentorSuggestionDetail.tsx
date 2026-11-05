"use client"

import { MemoryDetailCard, MemoryDetailError, MemoryDetailLayout, MemoryDetailSkeleton } from "@/features/ai/components/memories/MemoryDetailCard"
import { MemoryReadingText } from "@/features/ai/components/memories/MemoryReading"
import { NOTICE_MEMORY_ACTION_LABELS, noticeMemoryRef, type NoticeSuggestionRef } from "@/features/ai/memory-notice"
import { isGoneError } from "@/features/ai/hooks/useMemoryDetail"
import { MENTOR_RUN_STATUS_LABELS } from "../../mentor/constants"
import { useMentorRun } from "../../hooks/useMentor"

/**
 * Sugestão do Mentor citada por um aviso da mesa (OPE-139): lê a execução ao abrir. Aprovada, mostra a
 * memória gravada (lida do Engramind); ainda aguardando, mostra a proposta marcada como não gravada.
 */
export function MentorSuggestionDetail({ suggestion }: { suggestion: NoticeSuggestionRef }) {
    const query = useMentorRun(suggestion.mentorRunId, true)
    if (query.isError && isGoneError(query.error)) return <p className="pr-6 text-sm text-muted-foreground">A execução do Agente Mentor não existe mais.</p>
    if (query.isError) return <MemoryDetailError onRetry={() => void query.refetch()} />
    const run = query.data
    if (!run) return <MemoryDetailSkeleton />
    const proposal = suggestion.part === "extra" ? run.extraProposal : run.proposal
    const memoryId = suggestion.part === "extra" ? run.extraMemoryId : run.memoryId
    if (!proposal) return <p className="pr-6 text-sm text-muted-foreground">Esta parte da sugestão foi descartada.</p>
    if (memoryId && run.status !== "suggested") {
        const action = (suggestion.part === "main" ? run.status === "updated" : proposal.action === "update") ? "updated" : "created"
        return <MemoryDetailCard memoryRef={noticeMemoryRef(proposal.target, { id: memoryId }, action, { centralId: proposal.centralId ?? undefined })} />
    }
    const footer = run.status === "suggested" ? NOTICE_MEMORY_ACTION_LABELS.suggested : `Sugestão · ${MENTOR_RUN_STATUS_LABELS[run.status]}`
    return (
        <MemoryDetailLayout title="Sugestão do Agente Mentor" agentId={proposal.target} scope={{ centralId: proposal.centralId ?? undefined }} category="Definida ao gravar" footer={footer}>
            <MemoryReadingText className="max-h-[min(40vh,18rem)] max-w-none">{proposal.text}</MemoryReadingText>
        </MemoryDetailLayout>
    )
}
