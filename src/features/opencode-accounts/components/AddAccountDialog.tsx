"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ChevronRight, KeyRound, LogIn, Terminal } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { OPENCODE_METHOD_KIND_LABELS } from "../constants"
import { cancelOpencodeLogin, type OpencodeLoginKind } from "../hooks/useOpencodeAccounts"
import type { OpencodeAuthMethodDto, OpencodeAuthProviderDto, OpencodeOauthAttemptDto } from "../types"
import { AccountMethodForm } from "./AccountMethodForm"
import { LoginProgress } from "./LoginProgress"

const METHOD_ICONS = { key: KeyRound, oauth: LogIn, command: Terminal } as const

/** Login em andamento iniciado pelo formulário (OAuth ou comando). */
export type StartedLogin = { kind: "oauth"; attempt: OpencodeOauthAttemptDto } | { kind: "command"; attemptId: string }

type Step = { name: "method" } | { name: "form"; method: OpencodeAuthMethodDto } | { name: "login"; method: OpencodeAuthMethodDto; login: StartedLogin }

const stepMotion = { initial: { opacity: 0, x: 16 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -16 }, transition: { duration: 0.18 } }

const firstStep = (provider: OpencodeAuthProviderDto | null): Step => (provider?.methods.length === 1 ? { name: "form", method: provider.methods[0]! } : { name: "method" })

/**
 * "Adicionar conta": método → dados (rótulo, chave, campos do método) → login (OAuth ou comando).
 * Monte com `key` pelo provider para recomeçar da primeira etapa a cada abertura.
 */
export function AddAccountDialog({ provider, onClose }: { provider: OpencodeAuthProviderDto | null; onClose: () => void }) {
    const [step, setStep] = useState<Step>(() => firstStep(provider))

    const loginKey = (login: StartedLogin): [OpencodeLoginKind, string] => (login.kind === "oauth" ? ["oauth", login.attempt.attemptId] : ["command", login.attemptId])

    const close = (cancelPending = true) => {
        if (cancelPending && provider && step.name === "login") {
            const [kind, attemptId] = loginKey(step.login)
            void cancelOpencodeLogin(kind, provider.id, attemptId)
        }
        onClose()
    }

    return (
        <Dialog open={provider !== null} onOpenChange={(open) => !open && close()}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Adicionar conta{provider ? ` — ${provider.name}` : ""}</DialogTitle>
                    <DialogDescription>A conta nova passa a ser a conta em uso do provider. Chaves e tokens ficam só no OpenCode.</DialogDescription>
                </DialogHeader>
                {provider && (
                    <AnimatePresence mode="wait" initial={false}>
                        {step.name === "method" && (
                            <motion.div key="method" {...stepMotion} className="space-y-2" role="list" aria-label="Formas de conectar">
                                {provider.methods.map((method) => {
                                    const Icon = METHOD_ICONS[method.kind]
                                    return (
                                        <button
                                            key={`${method.kind}:${method.id}`}
                                            type="button"
                                            role="listitem"
                                            className="flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left hover:border-primary/60 hover:bg-muted/40"
                                            onClick={() => setStep({ name: "form", method })}
                                        >
                                            <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                                            <span className="min-w-0 flex-1">
                                                <span className="block text-sm font-medium">{method.label}</span>
                                                <span className="block text-[11px] text-muted-foreground">{OPENCODE_METHOD_KIND_LABELS[method.kind]}</span>
                                            </span>
                                            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                                        </button>
                                    )
                                })}
                            </motion.div>
                        )}
                        {step.name === "form" && (
                            <motion.div key={`form:${step.method.kind}:${step.method.id}`} {...stepMotion}>
                                <AccountMethodForm
                                    integrationId={provider.id}
                                    method={step.method}
                                    onBack={provider.methods.length > 1 ? () => setStep({ name: "method" }) : undefined}
                                    onConnected={() => close(false)}
                                    onLoginStarted={(login) => setStep({ name: "login", method: step.method, login })}
                                />
                            </motion.div>
                        )}
                        {step.name === "login" && (
                            <motion.div key="login" {...stepMotion}>
                                <LoginProgress integrationId={provider.id} method={step.method} login={step.login} onDone={() => close(false)} onCancel={() => close(true)} />
                            </motion.div>
                        )}
                    </AnimatePresence>
                )}
            </DialogContent>
        </Dialog>
    )
}
