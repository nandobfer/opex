"use client"

import { AnimatePresence, motion } from "framer-motion"
import { PermissionCard } from "@/components/agent-questions/PermissionCard"
import { useReplyPermission } from "../../hooks/useAgentic"
import type { WorkbenchDto } from "../../types"
import { AgentFormCard } from "./AgentFormCard"

/** Quantos pedidos do agente esperam o usuário (permissões + perguntas). */
export const pendingRequestCount = (workbench: WorkbenchDto) => workbench.pendingPermissions.length + workbench.pendingForms.length

/** Cartões dos pedidos (faixa abaixo da saída no desktop; folha "Pedidos do agente" no celular). */
export function PendingRequestCards({ workbench }: { workbench: WorkbenchDto }) {
    const reply = useReplyPermission(workbench)
    return (
        <AnimatePresence initial={false}>
            {workbench.pendingPermissions.map((permission) => (
                <motion.div key={permission.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.18 }}>
                    <PermissionCard permission={permission} pending={reply.isPending} onReply={(decision) => reply.mutate({ requestId: permission.id, decision })} />
                </motion.div>
            ))}
            {workbench.pendingForms.map((form) => (
                <motion.div key={form.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.18 }}>
                    <AgentFormCard workbench={workbench} form={form} />
                </motion.div>
            ))}
        </AnimatePresence>
    )
}

/** Pedidos do agente esperando o usuário: permissões de ferramenta e perguntas (desktop, abaixo da saída). */
export function PendingRequests({ workbench }: { workbench: WorkbenchDto }) {
    const count = pendingRequestCount(workbench)
    return (
        <AnimatePresence initial={false}>
            {count > 0 && (
                <motion.div key="pending" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="max-h-[45%] overflow-y-auto border-t bg-amber-500/5">
                    <div className="space-y-3 p-3">
                        <PendingRequestCards workbench={workbench} />
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
