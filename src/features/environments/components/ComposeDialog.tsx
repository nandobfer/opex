"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowLeft, Save } from "lucide-react"
import { ErrorState } from "@/components/feedback/ErrorState"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { apiErrorMessage } from "@/lib/api"
import { useComposeRevision, useEnvironmentCompose, useRestoreCompose, useSaveCompose } from "../hooks/useEnvironmentCompose"
import { authorLabel, composeContentProblem } from "../managed-compose"
import type { EnvironmentDto } from "../types"
import { ComposeEditorField } from "./ComposeEditorField"
import { ComposeRevisionList, formatRevisionDate } from "./ComposeRevisionList"

/** Skeleton com a estrutura do diálogo: linha da vigente, editor, nota e a lista de revisões. */
function ComposeDialogSkeleton() {
    return (
        <div className="space-y-4" aria-label="Carregando o compose">
            <Skeleton className="h-80 w-full" />
            <Skeleton className="h-9 w-full" />
            <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-28 w-full" />
            </div>
        </div>
    )
}

/**
 * Compose gerenciado de um ambiente salvo (OPE-191): editor da revisão vigente, Salvar nova revisão (nunca
 * sobrescreve) e o histórico com Ver/Restaurar. Tudo vale a partir do próximo deploy.
 */
export function ComposeDialog({ env, onClose }: { env: EnvironmentDto | null; onClose: () => void }) {
    const id = env?.id ?? ""
    const query = useEnvironmentCompose(env?.id ?? null, env !== null)
    const save = useSaveCompose(id)
    const restore = useRestoreCompose(id)
    // `null` = sem edição: o editor mostra a vigente (e acompanha uma revisão nova trazida pelo tempo real).
    const [edited, setEdited] = useState<string | null>(null)
    const [note, setNote] = useState("")
    const [viewing, setViewing] = useState<number | null>(null)
    const viewed = useComposeRevision(env?.id ?? null, viewing)
    const current = query.data?.current ?? null
    const draft = edited ?? current?.content ?? ""
    const close = () => {
        setEdited(null)
        setNote("")
        setViewing(null)
        onClose()
    }

    const problem = composeContentProblem(draft)
    const unchanged = current !== null && draft === current.content
    const submit = () =>
        save.mutate(
            { content: draft, note: note.trim() || undefined },
            {
                onSuccess: () => {
                    setEdited(null)
                    setNote("")
                },
            },
        )

    return (
        <Dialog open={env !== null} onOpenChange={(open) => !open && close()}>
            <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Compose de {env?.name}</DialogTitle>
                    <DialogDescription>
                        {current ? `Revisão vigente v${current.version} · ${formatRevisionDate(current.createdAt)} · ${authorLabel(current.authorId)}` : "Compose gerenciado"}. Cada gravação cria uma revisão nova, que vale a partir do próximo deploy.
                    </DialogDescription>
                </DialogHeader>
                {query.isLoading ? (
                    <ComposeDialogSkeleton />
                ) : query.isError || !query.data ? (
                    <ErrorState title="Não foi possível carregar o compose" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
                ) : (
                    <div className="space-y-4">
                        <AnimatePresence mode="wait" initial={false}>
                            {viewing !== null ? (
                                <motion.div key={`view-${viewing}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-2">
                                    <Button type="button" size="sm" variant="ghost" className="gap-1.5" onClick={() => setViewing(null)}>
                                        <ArrowLeft className="h-4 w-4" aria-hidden /> Voltar ao editor
                                    </Button>
                                    {viewed.isLoading ? <Skeleton className="h-80 w-full" /> : viewed.isError ? <ErrorState title="Não foi possível abrir a revisão" description={apiErrorMessage(viewed.error, "Tente novamente.")} onRetry={() => void viewed.refetch()} /> : <ComposeEditorField id="environment-compose-view" label={`Revisão v${viewing} (só leitura)`} value={viewed.data?.content ?? ""} readOnly />}
                                </motion.div>
                            ) : (
                                <motion.div key="editor" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-3">
                                    <ComposeEditorField id="environment-compose-edit" label="docker-compose.yml" value={draft} onChange={setEdited} error={problem?.message ?? null} />
                                    <Field id="environment-compose-note" label="Nota da revisão (opcional)">
                                        <Input id="environment-compose-note" value={note} maxLength={200} onChange={(event) => setNote(event.target.value)} placeholder="Ex.: porta do console" />
                                    </Field>
                                </motion.div>
                            )}
                        </AnimatePresence>
                        <ComposeRevisionList
                            revisions={query.data.revisions}
                            currentVersion={current?.version ?? null}
                            deployedVersion={query.data.deployedVersion}
                            viewing={viewing}
                            restoring={restore.isPending}
                            onView={(version) => setViewing(version)}
                            onRestore={(version) => restore.mutate(version, { onSuccess: () => setViewing(null) })}
                        />
                    </div>
                )}
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={close}>
                        Fechar
                    </Button>
                    <Button type="button" className="gap-1.5" disabled={!query.data || viewing !== null || unchanged || problem !== null || save.isPending} title={unchanged ? "O compose não mudou" : undefined} onClick={submit}>
                        <Save className="h-4 w-4" aria-hidden /> Salvar nova revisão
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
