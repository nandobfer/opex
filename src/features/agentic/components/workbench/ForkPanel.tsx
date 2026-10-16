"use client"

import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { AnimatePresence, motion } from "framer-motion"
import { CheckCircle2 } from "lucide-react"
import { AgentQuestionsCard } from "@/components/agent-questions/AgentQuestionsCard"
import { PermissionCard } from "@/components/agent-questions/PermissionCard"
import { Markdown } from "@/components/ui/markdown"
import { FORK_INTEGRATION_TARGET_LABELS, WORKBENCH_STAGE_LABELS } from "../../constants"
import type { ForkParentView } from "../../fork-logic"
import { useForkStream, useReplyForkForm, useReplyForkPermission } from "../../hooks/useForks"
import type { ForkDto, WorkbenchDto } from "../../types"
import { ForkActionBar } from "./ForkActionBar"
import { ForkIntegration } from "./ForkIntegration"
import { Timeline } from "./Timeline"

const when = (iso: string) => format(new Date(iso), "dd/MM 'às' HH:mm", { locale: ptBR })

/** Pedidos do agente do fork esperando o usuário (permissões e perguntas). */
function ForkPendingRequests({ workbenchId, fork }: { workbenchId: string; fork: ForkDto }) {
    const permission = useReplyForkPermission(workbenchId, fork.id)
    const form = useReplyForkForm(workbenchId, fork.id)
    const count = fork.pendingPermissions.length + fork.pendingForms.length
    return (
        <AnimatePresence initial={false}>
            {count > 0 && (
                <motion.div key="pending" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="max-h-[45%] overflow-y-auto border-t bg-amber-500/5">
                    <div className="space-y-3 p-3">
                        {fork.pendingPermissions.map((item) => (
                            <PermissionCard key={item.id} permission={item} pending={permission.isPending} onReply={(decision) => permission.mutate({ requestId: item.id, decision })} />
                        ))}
                        {fork.pendingForms.map((item) => (
                            <AgentQuestionsCard key={item.id} form={item} pending={form.isPending} onReply={(answer) => form.mutate({ formId: item.id, answer })} onCancel={() => form.mutate({ formId: item.id, cancel: true })} />
                        ))}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}

/** Origem do fork: conversa principal, sessão nova ou (fork de fork) o fork pai, com atalho para ele. */
function ForkOrigin({ fork, parentId, onSelectFork }: { fork: ForkDto; parentId: string | null; onSelectFork: (id: string) => void }) {
    if (fork.parentNumber === null) return <>{fork.origin === "fork" ? "Cópia da conversa principal" : "Sessão nova com o contexto da mesa"}</>
    if (!parentId) return <>Fork do Fork {fork.parentNumber} (descartado)</>
    return (
        <>
            Fork do{" "}
            <button type="button" className="font-medium text-primary underline-offset-2 hover:underline" onClick={() => onSelectFork(parentId)}>
                Fork {fork.parentNumber}
            </button>
        </>
    )
}

/** Um fork da conversa: origem, saída ao vivo, pedidos do agente, integração e ações. */
export function ForkPanel({ workbench, fork, parent, onSelectFork }: { workbench: WorkbenchDto; fork: ForkDto; parent: (ForkParentView & { id: string | null }) | null; onSelectFork: (id: string) => void }) {
    const { timeline } = useForkStream(workbench.id, fork.id)
    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <p className="border-b px-4 py-1.5 text-xs text-muted-foreground">
                <ForkOrigin fork={fork} parentId={parent?.id ?? null} onSelectFork={onSelectFork} /> · aberto em {when(fork.createdAt)} na etapa &ldquo;{WORKBENCH_STAGE_LABELS[fork.forkedFromStage]}&rdquo; · somente leitura
            </p>
            {fork.status !== "integrating" && <Timeline timeline={timeline} running={fork.runState === "running"} />}
            <ForkPendingRequests workbenchId={workbench.id} fork={fork} />
            <AnimatePresence initial={false}>
                {fork.status === "integrating" && (
                    <motion.div key="integration" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="flex min-h-0 flex-1 flex-col overflow-hidden">
                        <ForkIntegration workbench={workbench} fork={fork} parent={parent} />
                    </motion.div>
                )}
                {fork.status === "integrated" && fork.integration && (
                    <motion.div key="integrated" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="max-h-[40%] space-y-2 overflow-y-auto border-t bg-emerald-500/5 p-3">
                        <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-300">
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Integrado em {when(fork.integration.appliedAt)}: {FORK_INTEGRATION_TARGET_LABELS[fork.integration.target].label}
                            {fork.integration.target === "parent" && fork.parentNumber !== null ? ` (Fork ${fork.parentNumber})` : ""}
                        </p>
                        <div className="text-sm">
                            <Markdown>{fork.integration.summary}</Markdown>
                        </div>
                    </motion.div>
                )}
                {fork.status === "concluded" && (
                    <motion.p key="concluded" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="border-t px-4 py-2 text-xs text-muted-foreground">
                        Fork concluído junto com a mesa{fork.closedAt ? ` em ${when(fork.closedAt)}` : ""}: histórico somente leitura.
                    </motion.p>
                )}
            </AnimatePresence>
            <AnimatePresence initial={false}>
                {fork.error && (fork.runState === "failed" || fork.runState === "interrupted") && (
                    <motion.p key="error" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mx-3 mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">
                        {fork.error}
                    </motion.p>
                )}
            </AnimatePresence>
            <ForkActionBar workbenchId={workbench.id} fork={fork} onForkOpened={(child) => onSelectFork(child.id)} />
        </div>
    )
}
