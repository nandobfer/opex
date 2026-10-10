"use client"

import { AgentQuestionsCard } from "@/components/agent-questions/AgentQuestionsCard"
import { useReplyForm } from "../../hooks/useAgentic"
import type { OpencodeFormDto, WorkbenchDto } from "../../types"

/** Pergunta do agente na mesa: usa o card genérico e responde pela rota da mesa. */
export function AgentFormCard({ workbench, form }: { workbench: WorkbenchDto; form: OpencodeFormDto }) {
    const reply = useReplyForm(workbench)
    return <AgentQuestionsCard form={form} pending={reply.isPending} onReply={(answer) => reply.mutate({ formId: form.id, answer })} onCancel={() => reply.mutate({ formId: form.id, cancel: true })} />
}
