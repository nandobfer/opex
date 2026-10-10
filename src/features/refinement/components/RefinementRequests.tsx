"use client"

import { AnimatePresence, motion } from "framer-motion"
import { AgentQuestionsCard } from "@/components/agent-questions/AgentQuestionsCard"
import { PermissionCard } from "@/components/agent-questions/PermissionCard"
import { useReplyRefinementForm, useReplyRefinementPermission } from "../hooks/useRefinement"
import type { TaskRefinementDto } from "../types"

/** Perguntas e pedidos de permissão do agente pendentes no refinamento. */
export function RefinementRequests({ taskId, refinement }: { taskId: string; refinement: TaskRefinementDto }) {
    const form = useReplyRefinementForm(taskId)
    const permission = useReplyRefinementPermission(taskId)
    const count = refinement.pendingPermissions.length + refinement.pendingForms.length

    return (
        <AnimatePresence initial={false}>
            {count > 0 && (
                <motion.div key="pending" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="rounded-md border bg-amber-500/5">
                    <div className="space-y-3 p-3">
                        <AnimatePresence initial={false}>
                            {refinement.pendingPermissions.map((item) => (
                                <motion.div key={item.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.18 }}>
                                    <PermissionCard permission={item} pending={permission.isPending} onReply={(decision) => permission.mutate({ requestId: item.id, decision })} />
                                </motion.div>
                            ))}
                            {refinement.pendingForms.map((item) => (
                                <motion.div key={item.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.18 }}>
                                    <AgentQuestionsCard form={item} pending={form.isPending} onReply={(answer) => form.mutate({ formId: item.id, answer })} onCancel={() => form.mutate({ formId: item.id, cancel: true })} />
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
