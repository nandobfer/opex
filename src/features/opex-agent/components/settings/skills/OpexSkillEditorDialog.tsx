"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { createInputOf, EMPTY_OPEX_SKILL_FORM, formOfSkill, updateInputOf, type OpexSkillFormValues } from "../../../skill-form-schemas"
import type { OpexSkillDto } from "../../../skills"
import { useCreateOpexSkill, useOpexSkill, useUpdateOpexSkill } from "../../../hooks/useOpexSkills"
import { OpexSkillForm } from "./OpexSkillForm"

const fade = { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.18 } }

/**
 * Criar (`target: "new"`) ou editar uma skill do Opex. A edição lê o conteúdo atual antes de abrir: se a
 * leitura falhar, mostra o erro com "Tentar novamente" — nunca abre o editor vazio.
 */
export function OpexSkillEditorDialog({ target, takenNames, onClose }: { target: OpexSkillDto | "new" | null; takenNames: readonly string[]; onClose: () => void }) {
    const editing = target && target !== "new" ? target : null
    const detail = useOpexSkill(editing?.id ?? null)
    const create = useCreateOpexSkill()
    const update = useUpdateOpexSkill()
    const pending = create.isPending || update.isPending
    const submit = (values: OpexSkillFormValues) =>
        (editing ? update.mutateAsync({ id: editing.id, input: updateInputOf(values) }) : create.mutateAsync(createInputOf(values))).then(onClose)
    const loading = editing && (detail.isLoading || (detail.isFetching && !detail.isFetchedAfterMount))

    return (
        <Dialog open={target !== null} onOpenChange={(open) => !open && !pending && onClose()}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>{editing ? `Editar skill ${editing.name}` : "Nova skill"}</DialogTitle>
                    <DialogDescription>O frontmatter do SKILL.md é montado com o nome e a descrição. A skill fica no banco do Opex.</DialogDescription>
                </DialogHeader>
                <AnimatePresence mode="wait" initial={false}>
                    {loading ? (
                        <motion.div key="loading" {...fade} className="space-y-3" aria-label="Carregando">
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-48 w-full" />
                            <Skeleton className="h-16 w-full" />
                        </motion.div>
                    ) : editing && (detail.isError || !detail.data) ? (
                        <motion.div key="error" {...fade}>
                            <ErrorState title="Não foi possível abrir a skill" description={apiErrorMessage(detail.error, "Tente de novo.")} onRetry={() => void detail.refetch()} />
                        </motion.div>
                    ) : (
                        <motion.div key="form" {...fade}>
                            {editing?.origin.kind === "github" ? <p className="mb-3 text-xs text-warning">Instalada de {editing.sourceLabel}: Atualizar sobrescreve as edições locais com a versão do repositório.</p> : null}
                            <OpexSkillForm
                                key={editing?.id ?? "new"}
                                initial={editing && detail.data ? formOfSkill(detail.data) : EMPTY_OPEX_SKILL_FORM}
                                takenNames={takenNames}
                                skillId={editing?.id ?? null}
                                pending={pending}
                                onSubmit={submit}
                                onCancel={onClose}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            </DialogContent>
        </Dialog>
    )
}
