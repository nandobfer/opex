"use client"

import { Controller, type UseFormReturn } from "react-hook-form"
import { AnimatePresence, motion } from "framer-motion"
import { Info, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { FormToggleCard } from "@/components/ui/toggle-card"
import type { AiFeatureAvailability } from "@/features/ai/types"
import { ColumnColorPicker } from "@/features/tasks/components/ColumnColorPicker"
import { DEFAULT_OPEX_TITLE_INSTRUCTIONS } from "@/features/opex-agent/constants"
import { OpexFilesCard } from "@/features/opex-agent/components/settings/OpexFilesCard"
import { DEFAULT_MADDOX_INSTRUCTIONS } from "../../constants"
import type { MaddoxAgentSettings } from "../../schemas"
import { MaddoxMcpCard } from "./MaddoxMcpCard"
import { MaddoxModelCard } from "./MaddoxModelCard"

const noticeMotion = { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: "auto" }, exit: { opacity: 0, height: 0 }, transition: { duration: 0.2 } }

const FILES_DESCRIPTION = "Os arquivos vão junto da mensagem para o OpenCode (até 20 MB cada; acima disso, só a referência com o id). O agente também pode anexá-los a tarefas e prévias pelas ferramentas do Opex."

/** Seção Geral do Agente Maddox: ativo, cor, modelo padrão, subagente de título, instruções, arquivos e o MCP do Opex. */
export function MaddoxGeneralSection({ form, availability, dirty }: { form: UseFormReturn<MaddoxAgentSettings>; availability: AiFeatureAvailability; dirty: boolean }) {
    const errors = form.formState.errors
    return (
        <>
            <Card>
                <CardContent className="space-y-4 pt-6">
                    <FormToggleCard<MaddoxAgentSettings>
                        control={form.control}
                        name="enabled"
                        id="maddox-enabled"
                        label="Agente Maddox"
                        description="Agente de chat que roda no OpenCode (no mesmo item do Agente Opex, Ctrl+Shift+M): usa o terminal, os arquivos, as skills e os MCPs do OpenCode e as ferramentas do Opex. Só o dono por padrão; ligue por cliente no portal de orçamentos."
                    />
                    <AnimatePresence initial={false}>
                        {!dirty && !availability.available && availability.reason && (
                            <motion.p key="availability" {...noticeMotion} className="flex items-start gap-2 overflow-hidden text-xs text-muted-foreground">
                                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {availability.reason}
                            </motion.p>
                        )}
                    </AnimatePresence>
                    <div className="space-y-1.5">
                        <p id="maddox-color" className="text-sm font-medium">
                            Cor do agente
                        </p>
                        <Controller
                            control={form.control}
                            name="color"
                            render={({ field }) => (
                                <ColumnColorPicker allowNone noneOption={{ label: "Primária (padrão)", swatch: "bg-primary" }} aria-labelledby="maddox-color" value={field.value ?? null} onChange={field.onChange} />
                            )}
                        />
                        <p className="text-xs text-muted-foreground">Pinta o ícone da barra lateral, o ponto de atividade, o cabeçalho, os destaques e as bolhas do chat, no app e no portal.</p>
                    </div>
                </CardContent>
            </Card>

            <MaddoxModelCard form={form} target="main" title="Modelo padrão" description="Modelo e variante do catálogo do OpenCode. As sessões novas começam nele; no chat dá para trocar o modelo só da sessão." />
            <MaddoxModelCard form={form} target="title" title="Título e resumo" description="Subagente (também pelo OpenCode) que atualiza o título e o resumo da sessão a cada turno. Um modelo rápido basta." />

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Instruções</CardTitle>
                    <CardDescription>Instruções da sessão do OpenCode (dono). No portal valem instruções próprias com o cliente e o papel do usuário. As memórias entram sozinhas.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    <Field id="maddox-instructions" label="Agente" error={errors.instructions?.message}>
                        <Textarea id="maddox-instructions" rows={10} className="font-mono text-xs" {...form.register("instructions")} />
                        <div className="flex justify-end">
                            <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => form.setValue("instructions", DEFAULT_MADDOX_INSTRUCTIONS, { shouldDirty: true, shouldValidate: true })}>
                                <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restaurar padrão
                            </Button>
                        </div>
                    </Field>
                    <Field id="maddox-title-instructions" label="Título e resumo" error={errors.titleInstructions?.message}>
                        <Textarea id="maddox-title-instructions" rows={6} className="font-mono text-xs" {...form.register("titleInstructions")} />
                        <div className="flex justify-end">
                            <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => form.setValue("titleInstructions", DEFAULT_OPEX_TITLE_INSTRUCTIONS, { shouldDirty: true, shouldValidate: true })}>
                                <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restaurar padrão
                            </Button>
                        </div>
                    </Field>
                </CardContent>
            </Card>

            <OpexFilesCard form={form} description={FILES_DESCRIPTION} />
            <MaddoxMcpCard />
        </>
    )
}
