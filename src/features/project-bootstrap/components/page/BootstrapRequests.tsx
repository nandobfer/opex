"use client"

import { AnimatePresence, motion } from "framer-motion"
import { AgentQuestionsCard } from "@/components/agent-questions/AgentQuestionsCard"
import { PermissionCard } from "@/components/agent-questions/PermissionCard"
import { useReplyBootstrapForm, useReplyBootstrapPermission } from "../../hooks/useProjectBootstrap"
import type { ProjectBootstrapDto } from "../../types"

/** Perguntas e pedidos de permissão do Agente de Bootstrap pendentes (como na mesa de trabalho). */
export function BootstrapRequests({ bootstrap }: { bootstrap: ProjectBootstrapDto }) {
    const form = useReplyBootstrapForm(bootstrap.id)
    const permission = useReplyBootstrapPermission(bootstrap.id)
    const count = bootstrap.pendingPermissions.length + bootstrap.pendingForms.length
    return (
        <AnimatePresence initial={false}>
            {count > 0 && (
                <motion.div key="pending" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="rounded-md border border-warning/40 bg-warning/5">
                    <div className="space-y-3 p-3">
                        <AnimatePresence initial={false}>
                            {bootstrap.pendingPermissions.map((item) => (
                                <motion.div key={item.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.18 }}>
                                    <PermissionCard permission={item} pending={permission.isPending} onReply={(decision) => permission.mutate({ requestId: item.id, decision })} />
                                </motion.div>
                            ))}
                            {bootstrap.pendingForms.map((item) => (
                                <motion.div key={item.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.18 }}>
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
