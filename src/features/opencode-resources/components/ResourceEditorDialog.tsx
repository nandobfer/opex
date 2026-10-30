"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { OPENCODE_RESOURCE_KIND_LABELS } from "../constants"
import { fromFrontmatter, toFrontmatter, type MarkdownFormValues } from "../form-schemas"
import { useCreateOpencodeResource, useOpencodeResource, useUpdateOpencodeResource } from "../hooks/useOpencodeResources"
import type { OpencodeResourceDto } from "../types"
import { JsonResourceForm } from "./JsonResourceForm"
import { MarkdownResourceForm } from "./MarkdownResourceForm"

type MarkdownKind = "skill" | "agent" | "command"

const EMPTY: MarkdownFormValues = { name: "", description: "", mode: "", model: "", agent: "", subtask: false, body: "" }

/** Criar (`target: "new"`) ou editar uma skill/agente/comando. Fechado com `target: null`. */
export function ResourceEditorDialog({ kind, scope, target, onClose }: { kind: MarkdownKind; scope: string; target: OpencodeResourceDto | "new" | null; onClose: () => void }) {
    const editing = target && target !== "new" ? target : null
    const detail = useOpencodeResource(kind, editing?.id ?? null)
    const create = useCreateOpencodeResource(kind)
    const update = useUpdateOpencodeResource(kind)
    const label = OPENCODE_RESOURCE_KIND_LABELS[kind]
    const pending = create.isPending || update.isPending
    const loaded = detail.data ? fromFrontmatter(kind, detail.data.name, detail.data.frontmatter ?? {}, detail.data.body ?? "") : null

    const submitMarkdown = (values: MarkdownFormValues) => {
        const frontmatter = toFrontmatter(kind, values, loaded?.extras ?? {})
        if (editing) update.mutate({ id: editing.id, content: { frontmatter, body: values.body } }, { onSuccess: onClose })
        else create.mutate({ kind, scope, name: values.name, frontmatter, body: values.body }, { onSuccess: onClose })
    }

    return (
        <Dialog open={target !== null} onOpenChange={(open) => !open && !pending && onClose()}>
            <DialogContent className="sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>{editing ? `Editar ${label.one} ${editing.name}` : `Nov${label.article} ${label.one}`}</DialogTitle>
                    <DialogDescription>O frontmatter é validado antes de salvar e um backup da configuração é feito antes de cada alteração.</DialogDescription>
                </DialogHeader>
                <AnimatePresence mode="wait" initial={false}>
                    {editing && (detail.isLoading || detail.isFetching) ? (
                        <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-48 w-full" />
                        </motion.div>
                    ) : editing && detail.isError ? (
                        <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <ErrorState title="Não foi possível abrir o item" description={apiErrorMessage(detail.error, "Tente de novo.")} onRetry={() => void detail.refetch()} />
                        </motion.div>
                    ) : editing && detail.data?.format === "json" && kind !== "skill" ? (
                        <motion.div key="json" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                            <JsonResourceForm kind={kind} initial={detail.data.config ?? {}} pending={pending} onCancel={onClose} onSubmit={(config) => update.mutate({ id: editing.id, content: { config } }, { onSuccess: onClose })} />
                        </motion.div>
                    ) : (
                        <motion.div key="markdown" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                            {editing && detail.data?.files.length ? <p className="mb-3 text-xs text-muted-foreground">Outros arquivos da pasta (não editados aqui): {detail.data.files.join(", ")}</p> : null}
                            {editing && detail.data?.origin === "package" ? <p className="mb-3 text-xs text-warning">Instalada de repositório: a próxima atualização sobrescreve as edições locais.</p> : null}
                            <MarkdownResourceForm key={editing?.id ?? "new"} kind={kind} initial={loaded?.values ?? EMPTY} creating={!editing} pending={pending} onSubmit={submitMarkdown} onCancel={onClose} />
                        </motion.div>
                    )}
                </AnimatePresence>
            </DialogContent>
        </Dialog>
    )
}
