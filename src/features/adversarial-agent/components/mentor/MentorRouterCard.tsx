"use client"

import { AnimatePresence, motion } from "framer-motion"
import { useWatch, type UseFormReturn } from "react-hook-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { AI_PROVIDER_IDS, type AiProviderStatusDto } from "@/lib/ai/providers"
import { MENTOR_TARGET_LABELS, MENTOR_TARGETS } from "../../mentor/constants"
import { enabledTargets, type MentorSettings } from "../../mentor/schemas"
import { MentorCheckbox } from "./MentorCheckbox"
import { MentorModelFields } from "./MentorModelFields"

/**
 * Triador (OPE-97): escolhe, depois do decisor, em qual lista a memória é gravada — uma por execução,
 * entre os destinos ligados. Com um destino só, ele não é chamado (e o modelo fica opcional).
 */
export function MentorRouterCard({ form, providers }: { form: UseFormReturn<MentorSettings>; providers: AiProviderStatusDto[] }) {
    const targets = useWatch({ control: form.control, name: "targets" })
    const enabled = enabledTargets(targets ?? form.getValues("targets"))
    const errors = form.formState.errors
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Triador e destinos</CardTitle>
                <CardDescription>
                    Depois do decisor, o Triador escolhe UMA lista para a memória: o que o revisor deve verificar vai para o Agente Adversário; como fazer o trabalho vai para o agente desenvolvedor (globais, em qualquer projeto, ou desta central, convenções do projeto). Com o JEV, é a opção mais provável; com um provedor de texto, a lista que ele devolve. Nunca grava a mesma lição em duas listas.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                <Field id="mentor-targets" label="Destinos" error={errors.targets?.message ?? errors.targets?.root?.message}>
                    <ul className="space-y-2" aria-label="Destinos das memórias do Agente Mentor">
                        {MENTOR_TARGETS.map((target) => (
                            <MentorCheckbox key={target} form={form} name={`targets.${target}`} id={`mentor-target-${target}`} label={MENTOR_TARGET_LABELS[target].label} description={MENTOR_TARGET_LABELS[target].criteria} />
                        ))}
                    </ul>
                </Field>
                <AnimatePresence initial={false} mode="wait">
                    {enabled.length > 1 ? (
                        <motion.div key="router" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="space-y-5 overflow-hidden">
                            <MentorModelFields form={form} part="router" providerIds={AI_PROVIDER_IDS} providers={providers} />
                            <Field id="mentor-router-instructions" label="Instruções adicionais do Triador (opcional)" error={errors.router?.instructions?.message}>
                                <Textarea id="mentor-router-instructions" rows={3} className="font-mono text-xs" {...form.register("router.instructions")} />
                            </Field>
                        </motion.div>
                    ) : (
                        <motion.p key="single" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="text-sm text-muted-foreground">
                            {enabled.length === 1 ? `Só um destino ligado: as memórias vão sempre para "${MENTOR_TARGET_LABELS[enabled[0]!].label}", sem chamar o Triador.` : "Ligue ao menos um destino."}
                        </motion.p>
                    )}
                </AnimatePresence>
            </CardContent>
        </Card>
    )
}
