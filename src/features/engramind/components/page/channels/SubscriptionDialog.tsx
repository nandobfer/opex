"use client"

import { useCallback } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FORM_GRID } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { combinationOf, scopesOfCombination, SUBSCRIPTION_MODES, type ScopeCombination } from "../../../constants"
import { subscribeInput, updateSubscriptionInput } from "../../../operations"
import { IDENTITY_HELP, SUBSCRIPTION_MODE_HELP } from "../../../help/identities"
import type { EngramindAgent, EngramindSubscription } from "../../../types"
import { engramindSend, route, useEngramindMutation } from "../../../hooks/useEngramind"
import { InfoField } from "../../shared/InfoField"
import { ScopePicker } from "../../shared/ScopePicker"
import { useSchemaForm } from "../../shared/useSchemaForm"

type Mode = (typeof SUBSCRIPTION_MODES)[number]
type Values = { agent: string; target: string; mode: Mode; access: ScopeCombination | "token"; priority: string }
const TOKEN_ACCESS = "token"

/** Assinar um agente (canal exato ou prefixo) ou editar modo, acesso e prioridade de uma assinatura. */
export function SubscriptionDialog({ channel, subscription, agents, open, onOpenChange }: { channel: string; subscription: EngramindSubscription | null; agents: EngramindAgent[]; open: boolean; onOpenChange: (open: boolean) => void }) {
    const editing = subscription !== null
    const toPayload = useCallback(
        (values: Values) => {
            const access = values.access === TOKEN_ACCESS ? null : scopesOfCombination(values.access)
            const priority = values.priority.trim() === "" ? null : Number(values.priority)
            return editing ? { subscription: subscription.id, mode: values.mode, access, priority } : { agent: values.agent, target: values.target.trim(), mode: values.mode, access, priority }
        },
        [editing, subscription],
    )
    const form = useSchemaForm<Values, unknown>(
        editing ? updateSubscriptionInput : subscribeInput,
        {
            agent: agents[0]?.qualified_slug ?? "",
            target: subscription?.target ?? channel,
            mode: subscription?.mode ?? "inject",
            access: subscription?.access ? (combinationOf(subscription.access) ?? TOKEN_ACCESS) : TOKEN_ACCESS,
            priority: subscription?.priority != null ? String(subscription.priority) : "",
        },
        toPayload,
    )
    const save = useEngramindMutation(({ subscription: id, ...body }: Record<string, unknown>) => (editing ? engramindSend("patch", route("subscriptions", String(id)), body) : engramindSend("post", "subscriptions", body)), {
        invalidate: ["subscriptions", "agents"],
        success: editing ? "Assinatura atualizada" : "Agente assinado",
    })
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>{editing ? `Editar assinatura de ${subscription.agent.qualified_slug ?? subscription.agent.slug}` : "Assinar agente"}</DialogTitle>
                    <DialogDescription>Acesso efetivo = escopos do token ∩ acesso da assinatura (nunca amplia).</DialogDescription>
                </DialogHeader>
                <div className={FORM_GRID}>
                    <InfoField id="sub-agent" label="Agente" info={IDENTITY_HELP.agent} error={form.error("agent")}>
                        <Select value={form.values.agent} onValueChange={(value) => form.set("agent", value)} disabled={editing}>
                            <SelectTrigger id="sub-agent" className="bg-transparent">
                                <SelectValue placeholder="Escolha o agente" />
                            </SelectTrigger>
                            <SelectContent>
                                {agents.map((agent) => (
                                    <SelectItem key={agent.id} value={agent.qualified_slug}>
                                        {agent.qualified_slug}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </InfoField>
                    <InfoField id="sub-target" label="Alvo" info={IDENTITY_HELP.target} error={form.error("target")}>
                        <Input id="sub-target" value={form.values.target} onChange={(event) => form.set("target", event.target.value)} disabled={editing} placeholder={`${channel} ou eng/*`} />
                    </InfoField>
                    <InfoField id="sub-mode" label="Modo" info="Como o canal entra para o agente." className="space-y-1.5 sm:col-span-2">
                        <OptionTabs id="sub-mode" aria-label="Modo" options={SUBSCRIPTION_MODES.map((mode) => ({ value: mode, label: mode, tooltip: SUBSCRIPTION_MODE_HELP[mode] }))} value={form.values.mode} onChange={(mode) => form.set("mode", mode)} />
                    </InfoField>
                    <InfoField id="sub-access" label="Acesso" info={IDENTITY_HELP.access} error={form.error("access")} className="space-y-1.5 sm:col-span-2">
                        <div className="space-y-2">
                            <OptionTabs id="sub-access-kind" aria-label="Origem do acesso" size="sm" options={[{ value: "token", label: "Escopos do token", tooltip: "Sem restrição além dos escopos do token" }, { value: "custom", label: "Restringir", tooltip: IDENTITY_HELP.access }]} value={form.values.access === TOKEN_ACCESS ? "token" : "custom"} onChange={(kind) => form.set("access", kind === "token" ? TOKEN_ACCESS : "read")} />
                            {form.values.access !== TOKEN_ACCESS && <ScopePicker id="sub-access" value={form.values.access} onChange={(access) => form.set("access", access)} />}
                        </div>
                    </InfoField>
                    <InfoField id="sub-priority" label="Prioridade (opcional)" info={IDENTITY_HELP.subscriptionPriority} error={form.error("priority")}>
                        <Input id="sub-priority" type="number" value={form.values.priority} onChange={(event) => form.set("priority", event.target.value)} placeholder="A do canal" />
                    </InfoField>
                </div>
                <DialogFooter>
                    <Button type="button" disabled={!form.valid || save.isPending} onClick={() => form.payload && save.mutate(form.payload as Record<string, unknown>, { onSuccess: () => onOpenChange(false) })}>
                        {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} {editing ? "Salvar" : "Assinar"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
