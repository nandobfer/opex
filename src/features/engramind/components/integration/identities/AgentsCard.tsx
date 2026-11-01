"use client"

import { useState } from "react"
import { isOpexMemoryAgent } from "@/features/ai/agents"
import { Bot, Pencil, Plus, Power, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { TooltipIconButton } from "@/components/ui/tooltip-icon-button"
import { EmptyState } from "@/components/feedback/EmptyState"
import { VirtualizedRows } from "@/components/list/VirtualizedRows"
import { IDENTITY_HELP, SUBSCRIPTION_MODE_HELP } from "../../../help/identities"
import type { EngramindAgent, EngramindApp, EngramindSubscription } from "../../../types"
import { engramindSend, route, useEngramindMutation } from "../../../hooks/useEngramind"
import { HelpBadge } from "../../shared/Badges"
import { Section } from "../../shared/Section"
import { AgentDialog } from "./AgentDialog"

/** Agentes: criar, editar, desativar/reativar e excluir; cada um mostra as assinaturas (só leitura). */
export function AgentsCard({ agents, apps, subscriptions }: { agents: EngramindAgent[]; apps: EngramindApp[]; subscriptions: EngramindSubscription[] }) {
    const [editing, setEditing] = useState<EngramindAgent | null | "new">(null)
    const [deleting, setDeleting] = useState<EngramindAgent | null>(null)
    const toggle = useEngramindMutation((agent: EngramindAgent) => engramindSend("patch", route("agents", agent.qualified_slug), { disabled: !agent.disabled_at }), {
        invalidate: ["agents"],
        success: (agent) => (agent.disabled_at ? "Agente reativado" : "Agente desativado"),
    })
    const remove = useEngramindMutation((slug: string) => engramindSend("delete", route("agents", slug)), { invalidate: ["agents", "tokens", "subscriptions"], success: "Agente excluído" })
    return (
        <Section
            title="Agentes"
            info={IDENTITY_HELP.agent}
            actions={
                <Button type="button" size="sm" onClick={() => setEditing("new")} disabled={apps.length === 0}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Novo agente
                </Button>
            }
        >
            {agents.length === 0 ? (
                <EmptyState icon={Bot} title="Nenhum agente" description="Agentes pertencem a um app e operam memórias pelos canais que assinam." actionLabel={apps.length ? "Novo agente" : undefined} onAction={() => setEditing("new")} />
            ) : (
                <div className="max-h-[28rem] overflow-auto rounded-lg border">
                    <VirtualizedRows
                        rows={agents}
                        rowKey={(agent) => agent.id}
                        estimateSize={64}
                        rowClassName="border-b last:border-b-0"
                        renderRow={(agent) => {
                            const own = subscriptions.filter((subscription) => subscription.agent.id === agent.id)
                            return (
                                <div className="flex flex-wrap items-center gap-2 p-3 text-sm">
                                    <div className="min-w-0 flex-1 space-y-1">
                                        <p className="flex flex-wrap items-center gap-1.5 font-medium">
                                            {agent.name} <span className="font-mono text-xs text-muted-foreground">{agent.qualified_slug}</span>
                                            {agent.disabled_at && <HelpBadge value="desativado" tone="warning" help={IDENTITY_HELP.disabled} />}
                                            {isOpexMemoryAgent(agent.app.slug, agent.slug) && <HelpBadge value="Memórias do Opex" tone="secondary" help="Agente das memórias dos agentes do Opex (criado pelo passo Memórias dos agentes)." />}
                                        </p>
                                        <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                                            {own.length === 0 ? (
                                                "Sem assinaturas"
                                            ) : (
                                                own.map((subscription) => <HelpBadge key={subscription.id} value={`${subscription.target} · ${subscription.mode}`} help={SUBSCRIPTION_MODE_HELP[subscription.mode]} />)
                                            )}
                                        </div>
                                    </div>
                                    <TooltipIconButton label="Editar agente" onClick={() => setEditing(agent)}>
                                        <Pencil aria-hidden />
                                    </TooltipIconButton>
                                    <TooltipIconButton label={agent.disabled_at ? "Reativar agente" : "Desativar agente"} tooltip={IDENTITY_HELP.disabled} onClick={() => toggle.mutate(agent)}>
                                        <Power aria-hidden />
                                    </TooltipIconButton>
                                    <TooltipIconButton label="Excluir agente" onClick={() => setDeleting(agent)}>
                                        <Trash2 aria-hidden />
                                    </TooltipIconButton>
                                </div>
                            )
                        }}
                    />
                </div>
            )}
            {editing !== null && <AgentDialog key={editing === "new" ? "new" : editing.id} agent={editing === "new" ? null : editing} apps={apps} open onOpenChange={(open) => !open && setEditing(null)} />}
            <ConfirmDialog
                open={deleting !== null}
                onOpenChange={(open) => !open && setDeleting(null)}
                title={`Excluir o agente ${deleting?.qualified_slug ?? ""}?`}
                description="Saem junto os tokens e as assinaturas dele. A autoria das memórias e a auditoria ficam."
                confirmLabel="Excluir"
                variant="destructive"
                pending={remove.isPending}
                onConfirm={() => deleting && remove.mutate(deleting.qualified_slug, { onSettled: () => setDeleting(null) })}
            />
        </Section>
    )
}
