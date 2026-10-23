"use client"

import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { AnimatePresence, motion } from "framer-motion"
import { AgentQuestionsCard } from "@/components/agent-questions/AgentQuestionsCard"
import { PermissionCard } from "@/components/agent-questions/PermissionCard"
import { ReplyTargetProvider } from "@/components/agent-reply/ReplyTargetProvider"
import { WORKBENCH_STAGE_LABELS } from "../../constants"
import { forkModeText, type ForkParentView } from "../../fork-logic"
import { useForkIntegration, type ForkIntegrationState } from "../../hooks/useForkIntegration"
import { useForkStream, useReplyForkForm, useReplyForkPermission } from "../../hooks/useForks"
import type { ForkDto, WorkbenchDto } from "../../types"
import { ForkActionBar } from "./ForkActionBar"
import { ForkConcluded, ForkIntegrated } from "./ForkIntegrated"
import { ForkIntegrationActions, ForkIntegrationBody } from "./ForkIntegration"
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

/** Fim da conversa do fork conforme o estado: integração em andamento, resumo integrado ou fork concluído. */
function forkFooter(fork: ForkDto, integration: ForkIntegrationState) {
    if (fork.status === "integrating") return { key: `integrating:${fork.summary ?? ""}:${integration.editing}`, node: <ForkIntegrationBody fork={fork} state={integration} /> }
    if (fork.status === "integrated" && fork.integration) return { key: `integrated:${fork.integration.appliedAt}`, node: <ForkIntegrated fork={fork} /> }
    if (fork.status === "concluded") return { key: "concluded", node: <ForkConcluded fork={fork} /> }
    return null
}

/**
 * Um fork da conversa: origem, saída ao vivo (com a integração, o resumo integrado ou o aviso de
 * concluído no fim, na mesma área rolável), pedidos do agente e a barra do fork (com os botões da
 * integração).
 */
export function ForkPanel({ workbench, fork, parent, onSelectFork }: { workbench: WorkbenchDto; fork: ForkDto; parent: (ForkParentView & { id: string | null }) | null; onSelectFork: (id: string) => void }) {
    const { timeline } = useForkStream(workbench.id, fork.id)
    const integration = useForkIntegration(workbench, fork, parent)
    const footer = forkFooter(fork, integration)
    return (
        // Provider próprio: a citação de uma linha do fork vai para os campos do fork, não para os da mesa.
        <ReplyTargetProvider>
        <div className="flex min-h-0 flex-1 flex-col" data-ctrl-enter-scope>
            <p className="border-b px-4 py-1.5 text-xs text-muted-foreground">
                <ForkOrigin fork={fork} parentId={parent?.id ?? null} onSelectFork={onSelectFork} /> · aberto em {when(fork.createdAt)} na etapa &ldquo;{WORKBENCH_STAGE_LABELS[fork.forkedFromStage]}&rdquo; · {forkModeText(fork.mode, fork.readOnly)}
            </p>
            <Timeline timeline={timeline} running={fork.runState === "running"} footer={footer?.node ?? null} footerKey={footer?.key ?? null} />
            <ForkPendingRequests workbenchId={workbench.id} fork={fork} />
            <AnimatePresence initial={false}>
                {fork.error && (fork.runState === "failed" || fork.runState === "interrupted") && (
                    <motion.p key="error" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mx-3 mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">
                        {fork.error}
                    </motion.p>
                )}
            </AnimatePresence>
            <ForkActionBar
                workbenchId={workbench.id}
                fork={fork}
                onForkOpened={(child) => onSelectFork(child.id)}
                extra={fork.status === "integrating" ? <ForkIntegrationActions fork={fork} state={integration} /> : null}
            />
        </div>
        </ReplyTargetProvider>
    )
}
