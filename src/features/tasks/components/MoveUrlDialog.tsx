"use client"

import { useEffect } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { GitCommitHorizontal, GitPullRequest, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { TASK_STATUS_LABELS, type RequiredUrl, type TaskStatus } from "../constants"
import { commitUrlFormSchema, pullRequestUrlFormSchema } from "../schemas"

/** Pedido de URL: uma tarefa (fluxo individual) ou "N tarefas" (lote, mesma URL para todas). */
export interface MoveUrlRequest {
    /** Identifica o pedido (o formulário reinicia quando muda). */
    key: string
    requires: RequiredUrl
    targetStatus: TaskStatus
    /** "GO-DEV-12" ou "5 tarefas". */
    subject: string
    currentUrl: string | null
    /** Lote: a mesma URL vai para todas que precisam. */
    bulk?: boolean
}

interface MoveUrlDialogProps {
    request: MoveUrlRequest | null
    submitting: boolean
    /** Erro devolvido pela plataforma ao tentar com a URL informada. */
    error: string | null
    onConfirm: (url: string) => Promise<boolean>
    onCancel: () => void
}

const COPY = {
    commit: {
        icon: GitCommitHorizontal,
        title: "Link do commit",
        field: "URL do commit",
        description: "Para ir a Validação, o Go! Sipal exige o link do commit desta tarefa.",
        placeholder: "https://github.com/org/repo/commit/abc123",
    },
    pullRequest: {
        icon: GitPullRequest,
        title: "Link do Pull Request",
        field: "URL do Pull Request",
        description: "Para ir a Aguardando Produção, o Go! Sipal exige o link do Pull Request (ou Merge Request).",
        placeholder: "https://github.com/org/repo/pull/42",
    },
} as const

/** Pede a URL de commit/PR exigida pela transição; valida com as mesmas regras da plataforma. */
export function MoveUrlDialog({ request, submitting, error, onConfirm, onCancel }: MoveUrlDialogProps) {
    const kind = request?.requires ?? "commit"
    const copy = COPY[kind]
    const form = useForm<{ url: string }>({
        resolver: zodResolver(kind === "commit" ? commitUrlFormSchema : pullRequestUrlFormSchema),
        mode: "onChange",
        defaultValues: { url: "" },
    })

    const current = request?.currentUrl ?? null
    const key = request?.key ?? ""
    useEffect(() => {
        if (key) form.reset({ url: current ?? "" })
    }, [key, current, form])

    const Icon = copy.icon
    return (
        <Dialog open={request !== null} onOpenChange={(open) => !open && !submitting && onCancel()}>
            <DialogContent className="sm:max-w-lg">
                <form
                    className="space-y-5"
                    onSubmit={form.handleSubmit(async ({ url }) => {
                        await onConfirm(url)
                    })}
                >
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Icon className="h-4 w-4 text-primary" aria-hidden /> {copy.title}
                        </DialogTitle>
                        <DialogDescription>
                            {request && (
                                <>
                                    <span className="font-mono text-foreground">{request.subject}</span> → {TASK_STATUS_LABELS[request.targetStatus]}.{" "}
                                </>
                            )}
                            {copy.description}
                            {request?.bulk && " O mesmo link será usado em todas que precisam."}
                        </DialogDescription>
                    </DialogHeader>

                    <Field id="move-url" label={copy.field} error={form.formState.errors.url?.message}>
                        <Input id="move-url" autoFocus placeholder={copy.placeholder} {...form.register("url")} aria-invalid={form.formState.errors.url ? true : undefined} />
                    </Field>

                    <AnimatePresence>
                        {error && (
                            <motion.p role="alert" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                                {error}
                            </motion.p>
                        )}
                    </AnimatePresence>

                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={submitting || !form.formState.isValid}>
                            {submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
                            Mover tarefa
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
