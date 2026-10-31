"use client"

import { useCallback, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FORM_GRID } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { OptionTabs } from "@/components/ui/option-tabs"
import { SecretReveal } from "@/components/ui/secret-reveal"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { scopesOfCombination, TOKEN_KINDS, type ScopeCombination } from "../../../constants"
import { issueTokenInput } from "../../../operations"
import { IDENTITY_HELP, TOKEN_KIND_HELP } from "../../../help/identities"
import type { EngramindAgent, EngramindApp, IssuedToken } from "../../../types"
import { engramindSend, useEngramindMutation } from "../../../hooks/useEngramind"
import { InfoField } from "../../shared/InfoField"
import { ScopePicker } from "../../shared/ScopePicker"
import { useSchemaForm } from "../../shared/useSchemaForm"

interface IssueTokenDialogProps {
    apps: EngramindApp[]
    agents: EngramindAgent[]
    open: boolean
    onOpenChange: (open: boolean) => void
}

type Values = { kind: "admin" | "agent"; app: string; agent: string; scopes: ScopeCombination; label: string; expiresAt: string }

/** Emitir token: app/agente, tipo, escopos (só combinações válidas), rótulo e expiração; o segredo aparece UMA vez. */
export function IssueTokenDialog({ apps, agents, open, onOpenChange }: IssueTokenDialogProps) {
    const [secret, setSecret] = useState<string | null>(null)
    const toPayload = useCallback(
        (values: Values) => ({
            kind: values.kind,
            ...(values.kind === "admin" ? { app: values.app || undefined, agent: values.agent || undefined } : { agent: values.agent || undefined }),
            scopes: scopesOfCombination(values.scopes),
            label: values.label.trim() || undefined,
            expires_at: values.expiresAt ? new Date(values.expiresAt).toISOString() : undefined,
        }),
        [],
    )
    const form = useSchemaForm(issueTokenInput, { kind: "agent", app: apps[0]?.slug ?? "", agent: "", scopes: "read+write", label: "", expiresAt: "" }, toPayload)
    const issue = useEngramindMutation((payload: Record<string, unknown>) => engramindSend<IssuedToken>("post", "tokens", payload), { invalidate: ["tokens"], success: "Token emitido" })
    const submit = () => form.payload && issue.mutate(form.payload as Record<string, unknown>, { onSuccess: (result) => setSecret(result.secret ?? null) })
    const agentOptions = form.values.kind === "admin" ? agents.filter((agent) => agent.app.slug === form.values.app) : agents
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>{secret ? "Token emitido" : "Emitir token"}</DialogTitle>
                    <DialogDescription>{secret ? "Este é o único momento em que o segredo aparece. Copie e guarde agora." : IDENTITY_HELP.token}</DialogDescription>
                </DialogHeader>
                <AnimatePresence mode="wait" initial={false}>
                    {secret ? (
                        <motion.div key="secret" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} className="space-y-3">
                            <SecretReveal value={secret} hint="Use no cabeçalho Authorization: Bearer … do sistema que vai consumir o Engramind." />
                        </motion.div>
                    ) : (
                        <motion.div key="form" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} className={FORM_GRID}>
                            <InfoField id="token-kind" label="Tipo" info={`admin: ${TOKEN_KIND_HELP.admin} agent: ${TOKEN_KIND_HELP.agent}`} className="space-y-1.5 sm:col-span-2">
                                <OptionTabs id="token-kind" aria-label="Tipo" options={TOKEN_KINDS.map((kind) => ({ value: kind, label: kind, tooltip: TOKEN_KIND_HELP[kind] }))} value={form.values.kind} onChange={(kind) => form.set("kind", kind)} />
                            </InfoField>
                            {form.values.kind === "admin" && (
                                <InfoField id="token-app" label="App" info="App dono do token admin." error={form.error("app")}>
                                    <Select value={form.values.app} onValueChange={(value) => form.set("app", value)}>
                                        <SelectTrigger id="token-app" className="bg-transparent">
                                            <SelectValue placeholder="Escolha o app" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {apps.map((app) => (
                                                <SelectItem key={app.id} value={app.slug}>
                                                    {app.slug}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </InfoField>
                            )}
                            <InfoField id="token-agent" label={form.values.kind === "admin" ? "Agente (opcional)" : "Agente"} info={form.values.kind === "agent" ? "Token agent pertence a um agente e só alcança os canais que ele assina." : "Opcional: um agente do mesmo app."} error={form.error("agent")}>
                                <Select value={form.values.agent || "__none__"} onValueChange={(value) => form.set("agent", value === "__none__" ? "" : value)}>
                                    <SelectTrigger id="token-agent" className="bg-transparent">
                                        <SelectValue placeholder="Escolha o agente" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__none__">Nenhum</SelectItem>
                                        {agentOptions.map((agent) => (
                                            <SelectItem key={agent.id} value={agent.qualified_slug}>
                                                {agent.qualified_slug}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </InfoField>
                            <InfoField id="token-scopes" label="Escopos" info="write e delete exigem read. Quem emite não concede o que não tem." error={form.error("scopes")} className="space-y-1.5 sm:col-span-2">
                                <ScopePicker id="token-scopes" value={form.values.scopes} onChange={(scopes) => form.set("scopes", scopes)} />
                            </InfoField>
                            <InfoField id="token-label" label="Rótulo" info={IDENTITY_HELP.label} error={form.error("label")}>
                                <Input id="token-label" value={form.values.label} onChange={(event) => form.set("label", event.target.value)} placeholder="curador produção" />
                            </InfoField>
                            <InfoField id="token-expires" label="Expira em (opcional)" info={IDENTITY_HELP.expiresAt} error={form.error("expires_at")}>
                                <Input id="token-expires" type="datetime-local" value={form.values.expiresAt} onChange={(event) => form.set("expiresAt", event.target.value)} />
                            </InfoField>
                        </motion.div>
                    )}
                </AnimatePresence>
                <DialogFooter>
                    {secret ? (
                        <Button type="button" onClick={() => onOpenChange(false)}>
                            Já copiei
                        </Button>
                    ) : (
                        <Button type="button" onClick={submit} disabled={!form.valid || issue.isPending}>
                            {issue.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Emitir
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
