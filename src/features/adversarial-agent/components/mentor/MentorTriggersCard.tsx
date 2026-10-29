"use client"

import { AnimatePresence, motion } from "framer-motion"
import { useWatch, type UseFormReturn } from "react-hook-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { MENTOR_AI_STAGE_LABELS, MENTOR_AI_STAGES, MENTOR_USER_TRIGGER_LABELS, MENTOR_USER_TRIGGERS } from "../../mentor/constants"
import type { MentorSettings } from "../../mentor/schemas"
import { MentorCheckbox } from "./MentorCheckbox"

const reveal = { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: "auto" }, exit: { opacity: 0, height: 0 }, transition: { duration: 0.2 } }

/** Quando o Mentor roda: mensagens do usuário, turnos da IA e pedidos do agente desenvolvedor. */
export function MentorTriggersCard({ form }: { form: UseFormReturn<MentorSettings> }) {
    const developer = useWatch({ control: form.control, name: "triggers.developer.enabled" })
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Gatilhos</CardTitle>
                <CardDescription>O Mentor avalia ao fim da cadeia de turnos da mesa, em segundo plano (a mesa nunca espera). Mensagem do usuário e pedido do desenvolvedor no mesmo turno viram uma avaliação só.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                <section className="space-y-2">
                    <h4 className="text-sm font-medium">Mensagens do usuário</h4>
                    <p className="text-xs text-muted-foreground">Roda ao fim do turno que a mensagem originou, com o diagnóstico e a correção do agente no contexto.</p>
                    <ul className="grid gap-2 sm:grid-cols-2" aria-label="Mensagens do usuário que disparam o Mentor">
                        {MENTOR_USER_TRIGGERS.map((key) => (
                            <MentorCheckbox key={key} form={form} name={`triggers.user.${key}`} id={`mentor-user-${key}`} label={MENTOR_USER_TRIGGER_LABELS[key].label} description={MENTOR_USER_TRIGGER_LABELS[key].description} />
                        ))}
                    </ul>
                </section>
                <section className="space-y-2">
                    <h4 className="text-sm font-medium">Turnos da IA</h4>
                    <p className="text-xs text-muted-foreground">Avalia toda resposta do agente nessas etapas, mesmo sem mensagem sua (mais custo e mais chance de ruído).</p>
                    <ul className="grid gap-2 sm:grid-cols-2" aria-label="Turnos da IA que disparam o Mentor">
                        {MENTOR_AI_STAGES.map((stage) => (
                            <MentorCheckbox key={stage} form={form} name={`triggers.ai.${stage}`} id={`mentor-ai-${stage}`} label={MENTOR_AI_STAGE_LABELS[stage]} />
                        ))}
                    </ul>
                </section>
                <section className="space-y-2">
                    <h4 className="text-sm font-medium">Pedidos do desenvolvedor</h4>
                    <ul className="grid gap-2" aria-label="Pedidos do desenvolvedor">
                        <MentorCheckbox
                            form={form}
                            name="triggers.developer.enabled"
                            id="mentor-developer"
                            label="Aceitar pedidos do agente desenvolvedor"
                            description="O agente da mesa recebe a instrução de, quando julgar relevante, terminar a resposta com um bloco opex-lesson descrevendo o que o revisor deveria ter pegado."
                        />
                    </ul>
                    <AnimatePresence initial={false}>
                        {developer && (
                            <motion.div key="developer" {...reveal} className="overflow-hidden">
                                <ul className="grid gap-2 pt-1 sm:grid-cols-2" aria-label="Etapas em que o desenvolvedor pode pedir">
                                    {MENTOR_AI_STAGES.map((stage) => (
                                        <MentorCheckbox key={stage} form={form} name={`triggers.developer.stages.${stage}`} id={`mentor-developer-${stage}`} label={`Instrução na etapa: ${MENTOR_AI_STAGE_LABELS[stage]}`} />
                                    ))}
                                    <MentorCheckbox
                                        form={form}
                                        name="triggers.developer.skipDecider"
                                        id="mentor-developer-skip"
                                        label="Pedidos do desenvolvedor pulam o decisor"
                                        description="Vão direto ao redator (que ainda pode recusar e funde com memórias parecidas)."
                                    />
                                </ul>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </section>
            </CardContent>
        </Card>
    )
}
