"use client"

import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { AnimatePresence, motion } from "framer-motion"
import { NotebookPen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { ROUTINE_ENTRY_TARGETS, ROUTINE_ENTRY_TARGET_LABELS, routineEntryInputSchema, type RoutineEntryInput, type RoutineEntryTarget } from "../../schemas"
import { formatDateTime } from "../../format"
import { useAddRoutineEntry, useRoutineEntries } from "../../hooks/useRoutineRuns"

const TARGETS = ROUTINE_ENTRY_TARGETS.map((value) => ({ value, label: ROUTINE_ENTRY_TARGET_LABELS[value] }))

/**
 * Aba **Entradas** (não é chat): cada entrada grava uma memória no canal do agente ou no global dos
 * rotineiros, e as próximas execuções passam a considerá-la. Editar ou arquivar é na aba Memórias.
 */
export function RoutineEntriesTab({ agentId }: { agentId: string }) {
    const entries = useRoutineEntries(agentId)
    const add = useAddRoutineEntry(agentId)
    const form = useForm<RoutineEntryInput>({ resolver: zodResolver(routineEntryInputSchema), mode: "onChange", defaultValues: { text: "", target: "agent" } })
    // Erro (Engramind fora do ar): o texto continua no campo.
    const submit = form.handleSubmit((values) => add.mutate(values, { onSuccess: () => form.reset({ text: "", target: values.target }) }))
    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Nova entrada</CardTitle>
                    <CardDescription>Correções, preferências e fatos para o agente seguir nas próximas execuções.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={submit} className="space-y-3" aria-label="Nova entrada">
                        <Field id="routine-entry-text" label="Entrada" error={form.formState.errors.text?.message}>
                            <Textarea id="routine-entry-text" rows={3} placeholder="Ex.: não se candidate a vagas presenciais" {...form.register("text")} />
                        </Field>
                        <Field id="routine-entry-target" label="Destino">
                            <Controller
                                control={form.control}
                                name="target"
                                render={({ field }) => <OptionTabs<RoutineEntryTarget> id="routine-entry-target" aria-label="Destino" className="w-full" options={TARGETS} value={field.value} onChange={field.onChange} />}
                            />
                        </Field>
                        <div className="flex justify-end">
                            <Button type="submit" disabled={add.isPending}>
                                Gravar entrada
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>
            {entries.isLoading ? (
                <Skeleton className="h-24 w-full" />
            ) : entries.isError ? (
                <ErrorState title="Não foi possível carregar as entradas" description={apiErrorMessage(entries.error, "Tente novamente.")} onRetry={() => void entries.refetch()} />
            ) : !entries.data?.length ? (
                <EmptyState icon={NotebookPen} title="Nenhuma entrada" description="As entradas gravadas aparecem aqui, as mais recentes primeiro." />
            ) : (
                <ul className="space-y-2" aria-label="Entradas gravadas">
                    <AnimatePresence initial={false}>
                        {entries.data.map((entry) => (
                            <motion.li key={entry.id} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} className="rounded-lg border bg-card p-3">
                                <p className="whitespace-pre-wrap text-sm">{entry.text}</p>
                                <p className="mt-1 text-[11px] text-muted-foreground">
                                    {ROUTINE_ENTRY_TARGET_LABELS[entry.target]} · <code>{entry.channel}</code> · {formatDateTime(entry.createdAt)}
                                </p>
                            </motion.li>
                        ))}
                    </AnimatePresence>
                </ul>
            )}
        </div>
    )
}
