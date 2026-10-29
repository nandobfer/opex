"use client"

import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { AnimatePresence, motion } from "framer-motion"
import { CheckCircle2, ExternalLink, Loader2, XCircle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { DialogFooter } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useCompleteOpencodeOauth, useOpencodeLoginStatus } from "../hooks/useOpencodeAccounts"
import { oauthCompleteSchema, type OauthCompleteInput, type OpencodeAuthMethodDto } from "../types"
import type { StartedLogin } from "./AddAccountDialog"

interface LoginProgressProps {
    integrationId: string
    method: OpencodeAuthMethodDto
    login: StartedLogin
    onDone: () => void
    onCancel: () => void
}

/** Etapa do login: OAuth com código colado, OAuth automático (dispositivo) ou comando, com status. */
export function LoginProgress({ integrationId, method, login, onDone, onCancel }: LoginProgressProps) {
    if (login.kind === "oauth" && login.attempt.mode === "code") return <OauthCodeStep integrationId={integrationId} login={login} onDone={onDone} onCancel={onCancel} />
    return <WaitingStep integrationId={integrationId} method={method} login={login} onDone={onDone} onCancel={onCancel} />
}

function Instructions({ login }: { login: StartedLogin }) {
    if (login.kind !== "oauth") return null
    return (
        <div className="space-y-2">
            {login.attempt.instructions && <p className="whitespace-pre-wrap rounded-md bg-muted px-3 py-2 text-sm">{login.attempt.instructions}</p>}
            <Button asChild variant="outline" size="sm" className="gap-1.5">
                <a href={login.attempt.url} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" aria-hidden />
                    Abrir página de login
                </a>
            </Button>
        </div>
    )
}

function OauthCodeStep({ integrationId, login, onDone, onCancel }: Omit<LoginProgressProps, "method"> & { login: Extract<StartedLogin, { kind: "oauth" }> }) {
    const complete = useCompleteOpencodeOauth()
    const form = useForm<OauthCompleteInput>({ resolver: zodResolver(oauthCompleteSchema), mode: "onChange", defaultValues: { code: "" } })
    const submit = form.handleSubmit(async ({ code }) => {
        const done = await complete.mutateAsync({ integrationId, attemptId: login.attempt.attemptId, code }).then(() => true, () => false)
        if (done) onDone()
    })

    return (
        <div className="space-y-4">
            <Instructions login={login} />
            <Field id="opencode-oauth-code" label="Código de autorização" error={form.formState.errors.code?.message}>
                <Input
                    id="opencode-oauth-code"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="Cole aqui o código exibido após o login"
                    {...form.register("code")}
                    onKeyDown={(event) => {
                        if (event.key !== "Enter") return
                        event.preventDefault()
                        event.stopPropagation()
                        void submit()
                    }}
                />
            </Field>
            <DialogFooter>
                <Button type="button" variant="ghost" onClick={onCancel} disabled={complete.isPending}>
                    Cancelar
                </Button>
                <Button type="button" className="gap-1.5" disabled={complete.isPending || !form.formState.isValid} onClick={() => void submit()}>
                    {complete.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                    Concluir
                </Button>
            </DialogFooter>
        </div>
    )
}

function WaitingStep({ integrationId, method, login, onDone, onCancel }: LoginProgressProps) {
    const attemptId = login.kind === "oauth" ? login.attempt.attemptId : login.attemptId
    const status = useOpencodeLoginStatus(login.kind, integrationId, attemptId)
    const state = status.isError ? "failed" : (status.data?.status ?? "pending")
    const message = status.isError ? "Não foi possível consultar o login no OpenCode." : status.data?.message

    useEffect(() => {
        if (state !== "complete") return
        toast.success("Conta adicionada e selecionada")
        onDone()
        // eslint-disable-next-line react-hooks/exhaustive-deps -- conclui uma vez
    }, [state])

    return (
        <div className="space-y-4">
            <Instructions login={login} />
            <AnimatePresence mode="wait" initial={false}>
                <motion.div key={state} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }} className="flex items-start gap-2 text-sm" role="status">
                    {state === "pending" && <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden />}
                    {state === "complete" && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />}
                    {(state === "failed" || state === "expired") && <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />}
                    <span>
                        {state === "pending" && (login.kind === "oauth" ? "Aguardando você concluir o login na página aberta…" : `Executando "${method.label}" na máquina do OpenCode…`)}
                        {state === "complete" && "Login concluído."}
                        {state === "failed" && "O login falhou."}
                        {state === "expired" && "O login expirou. Comece de novo."}
                        {message && <span className="mt-1 block text-xs text-muted-foreground">{message}</span>}
                    </span>
                </motion.div>
            </AnimatePresence>
            <DialogFooter>
                <Button type="button" variant={state === "pending" ? "ghost" : "default"} onClick={onCancel}>
                    {state === "pending" ? "Cancelar" : "Fechar"}
                </Button>
            </DialogFooter>
        </div>
    )
}
