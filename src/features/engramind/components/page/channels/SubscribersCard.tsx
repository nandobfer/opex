"use client"

import { useState } from "react"
import { Pencil, Plus, Trash2, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { TooltipIconButton } from "@/components/ui/tooltip-icon-button"
import { EmptyState } from "@/components/feedback/EmptyState"
import { IDENTITY_HELP, SCOPE_HELP, SUBSCRIPTION_MODE_HELP } from "../../../help/identities"
import type { EngramindAgent, EngramindSubscription } from "../../../types"
import { engramindSend, route, useEngramindList, useEngramindMutation } from "../../../hooks/useEngramind"
import { HelpBadge } from "../../shared/Badges"
import { QueryBoundary } from "../../shared/QueryBoundary"
import { ListSkeleton } from "../../shared/ListSkeleton"
import { Section } from "../../shared/Section"
import { SubscriptionDialog } from "./SubscriptionDialog"

/** Assinantes do canal: listar, assinar um agente, editar e remover. */
export function SubscribersCard({ channel }: { channel: string }) {
    const subscriptions = useEngramindList<EngramindSubscription>("subscriptions", "subscriptions", { channel }, { all: true })
    const agents = useEngramindList<EngramindAgent>("agents", "agents", undefined, { all: true })
    const [editing, setEditing] = useState<EngramindSubscription | null | "new">(null)
    const [removing, setRemoving] = useState<EngramindSubscription | null>(null)
    const remove = useEngramindMutation((id: string) => engramindSend("delete", route("subscriptions", id)), { invalidate: ["subscriptions", "agents"], success: "Assinatura removida" })
    return (
        <Section
            title="Assinantes"
            info="Agentes que alcançam este canal por assinatura exata ou por prefixo. A mais específica vence (exata > prefixo mais longo)."
            actions={
                <Button type="button" size="sm" onClick={() => setEditing("new")} disabled={agents.items.length === 0}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Assinar agente
                </Button>
            }
        >
            <QueryBoundary isLoading={subscriptions.isLoading} error={subscriptions.error} onRetry={() => void subscriptions.refetch()} skeleton={<ListSkeleton rows={3} rowClassName="h-12" />}>
                {subscriptions.items.length === 0 ? (
                    <EmptyState icon={Users} title="Nenhum assinante" description="Sem assinatura, só tokens admin alcançam o canal." actionLabel={agents.items.length ? "Assinar agente" : undefined} onAction={() => setEditing("new")} />
                ) : (
                    <ul className="divide-y rounded-lg border">
                        {subscriptions.items.map((subscription) => (
                            <li key={subscription.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
                                <div className="min-w-0 flex-1 space-y-1">
                                    <p className="flex flex-wrap items-center gap-1.5">
                                        <span className="font-medium">{subscription.agent.qualified_slug ?? subscription.agent.slug}</span>
                                        <HelpBadge value={subscription.is_prefix ? `prefixo ${subscription.target}` : "exata"} help={IDENTITY_HELP.target} />
                                        <HelpBadge value={subscription.mode} help={SUBSCRIPTION_MODE_HELP[subscription.mode]} />
                                        {(subscription.access ?? ["escopos do token"]).map((scope) => (
                                            <HelpBadge key={scope} value={scope} help={SCOPE_HELP[scope] ?? IDENTITY_HELP.access} />
                                        ))}
                                        {subscription.priority != null && <HelpBadge value={`prioridade ${subscription.priority}`} help={IDENTITY_HELP.subscriptionPriority} />}
                                    </p>
                                    {subscription.is_prefix && <p className="text-xs text-muted-foreground">Alcança: {subscription.reaches.join(", ") || "nenhum canal ativo"}</p>}
                                </div>
                                <TooltipIconButton label="Editar assinatura" onClick={() => setEditing(subscription)}>
                                    <Pencil aria-hidden />
                                </TooltipIconButton>
                                <TooltipIconButton label="Remover assinatura" onClick={() => setRemoving(subscription)}>
                                    <Trash2 aria-hidden />
                                </TooltipIconButton>
                            </li>
                        ))}
                    </ul>
                )}
            </QueryBoundary>
            {editing !== null && <SubscriptionDialog key={editing === "new" ? "new" : editing.id} channel={channel} subscription={editing === "new" ? null : editing} agents={agents.items} open onOpenChange={(open) => !open && setEditing(null)} />}
            <ConfirmDialog
                open={removing !== null}
                onOpenChange={(open) => !open && setRemoving(null)}
                title="Remover a assinatura?"
                description={`${removing?.agent.qualified_slug ?? removing?.agent.slug ?? ""} deixa de alcançar ${removing?.target ?? ""}. As memórias continuam no canal.`}
                confirmLabel="Remover"
                variant="destructive"
                pending={remove.isPending}
                onConfirm={() => removing && remove.mutate(removing.id, { onSettled: () => setRemoving(null) })}
            />
        </Section>
    )
}
