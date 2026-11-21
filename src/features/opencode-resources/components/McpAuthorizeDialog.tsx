"use client"

import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { OauthLoginInstructions, OauthLoginStatusLine } from "@/components/ui/oauth-login"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { useCancelMcpOauth, useCompleteMcpOauth, useMcpOauthStatus, useStartMcpOauth } from "../hooks/useMcpOauth"
import { mcpOauthCompleteSchema, type McpOauthCompleteInput } from "../schemas"
import type { McpOauthAttemptDto, OpencodeResourceDto } from "../types"

/**
 * Autorizar um MCP remoto no OpenCode: abre a página do provedor e acompanha a tentativa. O retorno do
 * OpenCode cai em `127.0.0.1` do host — de outra máquina a página não abre, e basta colar aqui a URL
 * da barra de endereço (o Opex a repassa ao host).
 */
export function McpAuthorizeDialog({ target, onClose }: { target: OpencodeResourceDto | null; onClose: () => void }) {
    return (
        <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Autorizar o MCP {target?.name}</DialogTitle>
                    <DialogDescription>O login acontece no provedor; a credencial fica guardada no OpenCode do host.</DialogDescription>
                </DialogHeader>
                {target && <AuthorizeBody key={target.id} id={target.id} onClose={onClose} />}
            </DialogContent>
        </Dialog>
    )
}

/** Uma tentativa por abertura: inicia ao montar e cancela ao fechar com o login pendente. */
function AuthorizeBody({ id, onClose }: { id: string; onClose: () => void }) {
    const start = useStartMcpOauth()
    const cancel = useCancelMcpOauth()
    const attempt = start.data ?? null

    useEffect(() => {
        start.mutate(id)
        // eslint-disable-next-line react-hooks/exhaustive-deps -- uma tentativa por abertura
    }, [id])

    const close = (state: string | undefined) => {
        if (attempt && state === "pending") cancel.mutate({ id, attemptId: attempt.attemptId })
        onClose()
    }

    if (start.isError) return <ErrorState title="Não foi possível iniciar a autorização" description={apiErrorMessage(start.error, "Confira se o OpenCode está no ar e tente de novo.")} onRetry={() => start.mutate(id)} />
    if (!attempt) return <Skeleton className="h-28 w-full" data-testid="mcp-oauth-loading" />
    return <AttemptStep id={id} attempt={attempt} onClose={close} />
}

function AttemptStep({ id, attempt, onClose }: { id: string; attempt: McpOauthAttemptDto; onClose: (state: string | undefined) => void }) {
    const status = useMcpOauthStatus(id, attempt.attemptId)
    const complete = useCompleteMcpOauth()
    const state = status.isError ? "failed" : (complete.data?.status ?? status.data?.status ?? "pending")
    const message = status.isError ? apiErrorMessage(status.error, "Não foi possível consultar o login no OpenCode.") : (complete.data?.message ?? status.data?.message)
    const pasteField = attempt.mode === "code" ? "code" : "callbackUrl"
    const form = useForm<McpOauthCompleteInput>({ resolver: zodResolver(mcpOauthCompleteSchema), mode: "onChange", defaultValues: {} })

    useEffect(() => {
        if (state !== "complete") return
        toast.success("MCP autorizado no OpenCode")
        onClose("complete")
        // eslint-disable-next-line react-hooks/exhaustive-deps -- conclui uma vez
    }, [state])

    const submit = form.handleSubmit((input) => complete.mutate({ id, attemptId: attempt.attemptId, input }))
    const showPaste = state === "pending" && (attempt.mode === "code" || attempt.localCallback)

    return (
        <div className="space-y-4">
            <OauthLoginInstructions url={attempt.url} instructions={attempt.mode === "code" ? attempt.instructions : null} label="Abrir página de autorização" />
            <OauthLoginStatusLine state={state} pendingText="Aguardando você concluir o login na página aberta…" completeText="MCP autorizado." failedText="A autorização falhou." message={message} />
            {showPaste && (
                <form className="space-y-2" onSubmit={(event) => void submit(event)} noValidate>
                    <Field
                        id="mcp-oauth-paste"
                        label={pasteField === "code" ? "Código de autorização" : "Abriu o Opex de outra máquina? Cole a URL da barra de endereço"}
                        error={form.formState.errors.callbackUrl?.message ?? form.formState.errors.code?.message}
                    >
                        <Input id="mcp-oauth-paste" autoComplete="off" spellCheck={false} className="font-mono text-xs" placeholder={pasteField === "code" ? "Cole o código exibido após o login" : "http://127.0.0.1:…/callback?code=…"} {...form.register(pasteField)} />
                    </Field>
                    {pasteField === "callbackUrl" && <p className="text-xs text-muted-foreground">Depois do login, o provedor volta para o endereço do OpenCode no host (127.0.0.1). Se essa página não abrir, copie a URL dela e cole aqui.</p>}
                    <div className="flex justify-end">
                        <Button type="submit" size="sm" className="gap-1.5" disabled={complete.isPending || !form.formState.isValid}>
                            {complete.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                            Concluir
                        </Button>
                    </div>
                </form>
            )}
            <DialogFooter>
                <Button type="button" variant={state === "pending" ? "ghost" : "default"} onClick={() => onClose(state)}>
                    {state === "pending" ? "Cancelar" : "Fechar"}
                </Button>
            </DialogFooter>
        </div>
    )
}
