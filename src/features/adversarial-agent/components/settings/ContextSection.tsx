"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Controller, useWatch, type UseFormReturn } from "react-hook-form"
import { AlertTriangle, ListTree } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { FORM_GRID_COMPACT } from "@/components/ui/form-grid"
import { OptionTabs } from "@/components/ui/option-tabs"
import { FormToggleCard } from "@/components/ui/toggle-card"
import { ADVERSARIAL_FILE_MB_MAX, ADVERSARIAL_FILES_TOTAL_MB, type AdversarialAttachmentMode } from "../../constants"
import { plannedSectionTitles } from "../../context"
import type { AdversarialSettings } from "../../schemas"

type BooleanPath =
    | `context.task.${"basics" | "description" | "technicalSpec" | "insights" | "comments" | "history" | "timeLogs"}`
    | `context.workbench.${"approvedPlan" | "planHistory" | "cycleFeedback" | "centralInstructions"}`

const TASK: { name: BooleanPath; label: string; description: string }[] = [
    { name: "context.task.basics", label: "Dados básicos", description: "Código, título, tipo, prioridade e projeto" },
    { name: "context.task.description", label: "Descrição", description: "Texto completo da descrição da tarefa" },
    { name: "context.task.technicalSpec", label: "Especificação técnica", description: "Especificação técnica da tarefa" },
    { name: "context.task.insights", label: "Resumo e tags da IA", description: "Resumo de 1 linha e tags da tarefa no Opex" },
    { name: "context.task.comments", label: "Comentários", description: "Autor, data e texto de cada comentário" },
    { name: "context.task.history", label: "Histórico", description: "Mudanças de coluna, prioridade e campos" },
    { name: "context.task.timeLogs", label: "Apontamentos de horas", description: "Quando e quanto tempo" },
]

const WORKBENCH: { name: BooleanPath; label: string; description: string }[] = [
    { name: "context.workbench.approvedPlan", label: "Plano aprovado", description: "A versão do plano que o implementador seguiu. Ajuda a julgar o escopo, mas traz o viés do planejador" },
    { name: "context.workbench.planHistory", label: "Versões anteriores do plano", description: "Planos anteriores e os pedidos de correção que geraram cada versão" },
    { name: "context.workbench.cycleFeedback", label: "Pedido de correção deste ciclo", description: "O que a prévia, o PR ou você pediu para esta rodada de implementação" },
    { name: "context.workbench.centralInstructions", label: "Instruções da central", description: "Instruções adicionais da central para o agente de implementação" },
]

const ATTACHMENTS: { value: AdversarialAttachmentMode; label: string }[] = [
    { value: "none", label: "Não enviar" },
    { value: "names", label: "Só os nomes" },
    { value: "files", label: "Nomes e arquivos" },
]

function ToggleGrid({ form, items, prefix }: { form: UseFormReturn<AdversarialSettings>; items: typeof TASK; prefix: string }) {
    return (
        <div className={FORM_GRID_COMPACT}>
            {items.map((item) => (
                <FormToggleCard<AdversarialSettings> key={item.name} control={form.control} name={item.name} id={`${prefix}-${item.name.split(".").at(-1)}`} label={item.label} description={item.description} onLabel="Enviar" offLabel="Não enviar" />
            ))}
        </div>
    )
}

/**
 * O que acompanha o código no contexto do adversário. Tudo configurável: ele começa sem viés, numa
 * sessão nova, e só vê o que estiver ligado aqui.
 */
export function ContextSection({ form }: { form: UseFormReturn<AdversarialSettings> }) {
    const context = useWatch({ control: form.control, name: "context" })
    const titles = plannedSectionTitles(context)
    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Tarefa</CardTitle>
                    <CardDescription>Partes da tarefa enviadas ao adversário junto do código.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    <ToggleGrid form={form} items={TASK} prefix="adversarial-task" />
                    <Field id="adversarial-attachments" label="Anexos">
                        <Controller
                            control={form.control}
                            name="context.task.attachments"
                            render={({ field }) => <OptionTabs<AdversarialAttachmentMode> id="adversarial-attachments" options={ATTACHMENTS} value={field.value} onChange={field.onChange} className="w-full" />}
                        />
                        <p className="text-xs text-muted-foreground">
                            Em &ldquo;Nomes e arquivos&rdquo;, os anexos vão junto da mensagem (até {ADVERSARIAL_FILE_MB_MAX} MB cada e {ADVERSARIAL_FILES_TOTAL_MB} MB no total); os maiores ficam só com o nome.
                        </p>
                    </Field>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Mesa de trabalho</CardTitle>
                    <CardDescription>O que a mesa produziu até a implementação. Desligado, o adversário julga o código só pela tarefa.</CardDescription>
                </CardHeader>
                <CardContent>
                    <ToggleGrid form={form} items={WORKBENCH} prefix="adversarial-workbench" />
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Rodadas de correção</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <FormToggleCard<AdversarialSettings>
                        control={form.control}
                        name="context.rounds.previousFindings"
                        id="adversarial-previous-findings"
                        label="Achados da rodada anterior"
                        description="Na rodada seguinte a uma correção, o adversário recebe os achados bloqueantes anteriores e as contestações do implementador para conferir cada um"
                        onLabel="Enviar"
                        offLabel="Não enviar"
                    />
                    <AnimatePresence initial={false}>
                        {!context.rounds.previousFindings && (
                            <motion.p key="warn" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="flex items-start gap-2 overflow-hidden text-xs text-amber-300">
                                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> Sem os achados anteriores, cada rodada começa do zero: o adversário não confere o que pediu nem vê as contestações, e fica mais fácil trocar de objetivo a cada rodada.
                            </motion.p>
                        )}
                    </AnimatePresence>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <ListTree className="h-4 w-4" aria-hidden /> Seções enviadas
                    </CardTitle>
                    <CardDescription>Na ordem do prompt, quando houver conteúdo. As regras do nível, as memórias e as instruções adicionais vão nas instruções da sessão.</CardDescription>
                </CardHeader>
                <CardContent>
                    {titles.length ? (
                        <ol className="list-inside list-decimal space-y-1 text-sm">
                            <AnimatePresence initial={false}>
                                {titles.map((title) => (
                                    <motion.li key={title} layout="position" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 6 }} transition={{ duration: 0.15 }}>
                                        {title}
                                    </motion.li>
                                ))}
                            </AnimatePresence>
                        </ol>
                    ) : (
                        <p className="text-sm text-muted-foreground">Nenhuma seção: o adversário revisa só o código, sem saber o que a tarefa pede.</p>
                    )}
                </CardContent>
            </Card>
        </>
    )
}
