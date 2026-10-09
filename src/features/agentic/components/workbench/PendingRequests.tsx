"use client"

import { AnimatePresence, motion } from "framer-motion"
import { ShieldQuestion } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useReplyPermission } from "../../hooks/useAgentic"
import type { OpencodePermissionDto, WorkbenchDto } from "../../types"
import { AgentFormCard } from "./AgentFormCard"

/** Pedidos do agente esperando o usuário: permissões de ferramenta e perguntas. */
export function PendingRequests({ workbench }: { workbench: WorkbenchDto }) {
    const reply = useReplyPermission(workbench)
    const count = workbench.pendingPermissions.length + workbench.pendingForms.length
    return (
        <AnimatePresence initial={false}>
            {count > 0 && (
                <motion.div key="pending" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="max-h-[45%] overflow-y-auto border-t bg-amber-500/5">
                    <div className="space-y-3 p-3">
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
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}

function PermissionCard({ permission, pending, onReply }: { permission: OpencodePermissionDto; pending: boolean; onReply: (decision: "once" | "always" | "reject") => void }) {
    return (
        <div className="rounded-lg border border-amber-500/40 bg-background p-3" role="alertdialog" aria-label="Pedido de permissão do agente">
            <p className="flex items-center gap-2 text-sm font-medium">
                <ShieldQuestion className="h-4 w-4 text-amber-300" aria-hidden /> O agente pede permissão: <span className="font-mono">{permission.action}</span>
            </p>
            {permission.message && <p className="mt-1 text-sm text-muted-foreground">{permission.message}</p>}
            {permission.resources.length > 0 && <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/40 p-2 font-mono text-[11px]">{permission.resources.join("\n")}</pre>}
            <div className="mt-3 flex flex-wrap justify-end gap-2">
                <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => onReply("reject")}>
                    Recusar
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => onReply("always")}>
                    Aprovar sempre
                </Button>
                <Button type="button" size="sm" disabled={pending} onClick={() => onReply("once")}>
                    Aprovar uma vez
                </Button>
            </div>
        </div>
    )
}
