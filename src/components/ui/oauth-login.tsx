"use client"

import { AnimatePresence, motion } from "framer-motion"
import { CheckCircle2, ExternalLink, Loader2, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

/**
 * Peças de um login OAuth acompanhado pelo app (contas dos provedores e MCPs do OpenCode): instruções
 * + botão que abre a página do provedor, e a linha de situação animada (pendente, concluído, falhou,
 * expirou).
 */

export function OauthLoginInstructions({ instructions, url, label = "Abrir página de login" }: { instructions?: string | null; url: string; label?: string }) {
    return (
        <div className="space-y-2">
            {instructions && <p className="whitespace-pre-wrap rounded-md bg-muted px-3 py-2 text-sm">{instructions}</p>}
            <Button asChild variant="outline" size="sm" className="gap-1.5">
                <a href={url} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" aria-hidden />
                    {label}
                </a>
            </Button>
        </div>
    )
}

export type OauthLoginState = "pending" | "complete" | "failed" | "expired"

export function OauthLoginStatusLine({ state, pendingText, completeText = "Login concluído.", failedText = "O login falhou.", expiredText = "O login expirou. Comece de novo.", message }: {
    state: OauthLoginState
    pendingText: string
    completeText?: string
    failedText?: string
    expiredText?: string
    message?: string | null
}) {
    return (
        <AnimatePresence mode="wait" initial={false}>
            <motion.div key={state} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }} className="flex items-start gap-2 text-sm" role="status">
                {state === "pending" && <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden />}
                {state === "complete" && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />}
                {(state === "failed" || state === "expired") && <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />}
                <span>
                    {state === "pending" && pendingText}
                    {state === "complete" && completeText}
                    {state === "failed" && failedText}
                    {state === "expired" && expiredText}
                    {message && <span className="mt-1 block text-xs text-muted-foreground">{message}</span>}
                </span>
            </motion.div>
        </AnimatePresence>
    )
}
