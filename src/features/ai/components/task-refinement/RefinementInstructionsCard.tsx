"use client"

import { AnimatePresence, motion } from "framer-motion"
import type { UseFormReturn } from "react-hook-form"
import { Info, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { Label } from "@/components/ui/label"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Textarea } from "@/components/ui/textarea"
import { DEFAULT_TASK_REFINEMENT_INSTRUCTIONS, REFINEMENT_INSTRUCTIONS_SOURCES, REFINEMENT_INSTRUCTIONS_SOURCE_LABELS, type RefinementInstructionsSource } from "../../constants"
import type { TaskRefinementSettings } from "../../schemas"
import { OpencodeSkillSelect } from "../OpencodeSkillSelect"

const panelMotion = { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -6 }, transition: { duration: 0.18 } }
const SOURCE_OPTIONS = REFINEMENT_INSTRUCTIONS_SOURCES.map((value) => ({ value, label: REFINEMENT_INSTRUCTIONS_SOURCE_LABELS[value] }))

/**
 * Card "Instruções" do Agente Refinador: origem (texto ou skill do OpenCode) e o valor de cada uma.
 * Os dois valores ficam no formulário: trocar de origem não apaga o outro.
 */
export function RefinementInstructionsCard({ form }: { form: UseFormReturn<TaskRefinementSettings> }) {
    const source = form.watch("instructionsSource")
    const skill = form.watch("skill")
    const errors = form.formState.errors
    const setSource = (next: RefinementInstructionsSource) => form.setValue("instructionsSource", next, { shouldDirty: true, shouldValidate: true })

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Instruções</CardTitle>
                <CardDescription>Recebe a tarefa inteira; o protocolo de perguntas e de reescrita da especificação é sempre aplicado por cima destas instruções.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Label id="ai-refine-source-label">Origem das instruções</Label>
                    <OptionTabs<RefinementInstructionsSource> aria-labelledby="ai-refine-source-label" options={SOURCE_OPTIONS} value={source} onChange={setSource} />
                </div>
                <AnimatePresence mode="wait" initial={false}>
                    {source === "text" ? (
                        <motion.div key="text" {...panelMotion}>
                            <Field id="ai-refine-instructions" label="Instruções (prompt de sistema)" error={errors.instructions?.message}>
                                <Textarea id="ai-refine-instructions" rows={7} className="font-mono text-xs" {...form.register("instructions")} />
                                <div className="flex justify-end">
                                    <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => form.setValue("instructions", DEFAULT_TASK_REFINEMENT_INSTRUCTIONS, { shouldDirty: true, shouldValidate: true })}>
                                        <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restaurar padrão
                                    </Button>
                                </div>
                            </Field>
                        </motion.div>
                    ) : (
                        <motion.div key="skill" {...panelMotion} className="space-y-2">
                            <OpencodeSkillSelect
                                id="ai-refine-skill"
                                value={skill}
                                error={errors.skill?.message}
                                onChange={(id) => form.setValue("skill", id, { shouldDirty: true, shouldValidate: true })}
                                fallbackAction={{ label: "Usar instruções de texto", onClick: () => setSource("text") }}
                            />
                            <p className="flex items-start gap-2 text-xs text-muted-foreground">
                                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> A skill é ativada na sessão do refinamento, criada no diretório da central do projeto. Se ela não existir lá (ou o OpenCode não responder), o refinamento usa as instruções de texto e avisa.
                            </p>
                        </motion.div>
                    )}
                </AnimatePresence>
                <p className="text-xs text-muted-foreground">O protocolo garante que a especificação cubra critérios de aceite, localização da mudança (rotas, telas, módulos, integrações) e casos de borda.</p>
                <p className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> O agente pergunta pela ferramenta nativa de perguntas do OpenCode. Use o agente <span className="font-medium">Plan</span> ou outro que a tenha habilitada — os subagentes <span className="font-mono">general</span> e <span className="font-mono">explore</span> não conseguem perguntar.
                </p>
            </CardContent>
        </Card>
    )
}
