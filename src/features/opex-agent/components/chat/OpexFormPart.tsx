"use client"

import { motion } from "framer-motion"
import { CircleCheck, CircleSlash, MessageCircleQuestion } from "lucide-react"
import { AgentQuestionsCard } from "@/components/agent-questions/AgentQuestionsCard"
import { useReplyAgentForm } from "../../hooks/useOpexSessions"
import type { OpexFormPart as OpexFormPartData } from "../../types"

/**
 * Pergunta (formulário) do OpenCode no chat do Agente Maddox: aberta, usa o card genérico de perguntas
 * (o mesmo da mesa de trabalho); respondida ou dispensada, vira uma linha discreta.
 */
export function OpexFormPart({ part, live }: { part: OpexFormPartData; live: boolean }) {
    const reply = useReplyAgentForm()
    if (part.status === "pending" && live) {
        return (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} data-testid="opex-form-part">
                <AgentQuestionsCard form={part.form} pending={reply.isPending} onReply={(answer) => reply.mutate({ formId: part.id, answer })} onCancel={() => reply.mutate({ formId: part.id, cancel: true })} />
            </motion.div>
        )
    }
    const Icon = part.status === "answered" ? CircleCheck : part.status === "cancelled" ? CircleSlash : MessageCircleQuestion
    const label = part.status === "answered" ? "Pergunta respondida" : part.status === "cancelled" ? "Pergunta dispensada" : "Pergunta sem resposta"
    return (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="opex-form-part-closed">
            <Icon className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
            <span className="truncate">
                {label}: {part.form.title}
            </span>
        </motion.p>
    )
}
