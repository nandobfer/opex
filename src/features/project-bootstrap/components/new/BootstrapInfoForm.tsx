"use client"

import { useRouter } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import { Info, Loader2, Rocket } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { projectBootstrapPath } from "../../constants"
import { useBootstrapInfoForm } from "../../hooks/useBootstrapInfoForm"
import { useStartProjectBootstrap } from "../../hooks/useProjectBootstrap"
import { BlockersNotice } from "./BlockersNotice"
import { ContextField } from "./ContextField"
import { HostFields } from "./HostFields"
import { RepoFields } from "./RepoFields"

/** Etapa 1 do bootstrap: repositório, contexto com as tecnologias, diretório no host e colunas. */
export function BootstrapInfoForm({ initialRepo }: { initialRepo: string }) {
    const router = useRouter()
    const state = useBootstrapInfoForm(initialRepo)
    const start = useStartProjectBootstrap()
    const { form } = state
    const submit = form.handleSubmit(async (values) => {
        const created = await start.mutateAsync(values).catch(() => null)
        if (created) router.replace(projectBootstrapPath(created.id))
    })
    const disabled = start.isPending || Boolean(state.blockReason)

    return (
        <form
            className="space-y-6"
            onSubmit={(event) => {
                event.preventDefault()
                void submit()
            }}
        >
            <BlockersNotice blockers={state.blockers} />
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Repositório</CardTitle>
                    <CardDescription>Repositório novo no GitHub ou um existente que ainda não está vinculado ao Opex.</CardDescription>
                </CardHeader>
                <CardContent>
                    <RepoFields form={form} owners={state.owners} check={state.repoCheck} pending={state.repoPending} />
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Contexto do projeto</CardTitle>
                    <CardDescription>Vai para o Agente de Bootstrap junto com as tecnologias reconhecidas.</CardDescription>
                </CardHeader>
                <CardContent>
                    <ContextField form={form} groups={state.detected} />
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Host e vínculo</CardTitle>
                    <CardDescription>Pasta do projeto na máquina do OpenCode e as colunas do vínculo do GitHub criado no fim.</CardDescription>
                </CardHeader>
                <CardContent>
                    <HostFields form={form} columns={state.board.columns} columnsLoading={state.board.isLoading} check={state.dirCheck} pending={state.dirPending} onDirectoryEdited={state.markDirectoryEdited} />
                </CardContent>
            </Card>
            <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-6">
                <AnimatePresence initial={false}>
                    {state.blockReason && (
                        <motion.p key={state.blockReason} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Info className="h-3.5 w-3.5 shrink-0" aria-hidden /> {state.blockReason}
                        </motion.p>
                    )}
                </AnimatePresence>
                <Button type="submit" className="gap-1.5" disabled={disabled}>
                    {start.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Rocket className="h-4 w-4" aria-hidden />} Enviar ao Agente de Bootstrap
                </Button>
            </div>
        </form>
    )
}
