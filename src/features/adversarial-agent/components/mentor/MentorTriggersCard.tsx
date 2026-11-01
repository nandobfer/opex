"use client"

import type { UseFormReturn } from "react-hook-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { MENTOR_AI_STAGE_LABELS, MENTOR_AI_STAGES, MENTOR_USER_TRIGGER_LABELS, MENTOR_USER_TRIGGERS } from "../../mentor/constants"
import type { MentorSettings } from "../../mentor/schemas"
import { MentorCheckbox } from "./MentorCheckbox"

/**
 * Quando o Mentor roda: mensagens do usuário e turnos da IA (etapas da mesa e revisões do Adversário).
 * Os agentes também aprendem sozinhos (memória própria); o Mentor consolida lições a partir destes turnos.
 */
export function MentorTriggersCard({ form }: { form: UseFormReturn<MentorSettings> }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Gatilhos</CardTitle>
                <CardDescription>O Mentor avalia ao fim da cadeia de turnos da mesa, em segundo plano (a mesa nunca espera), e consolida lições para o agente desenvolvedor e o Agente Adversário. Os dois também aprendem sozinhos (memória própria).</CardDescription>
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
                    <p className="text-xs text-muted-foreground">Avalia toda resposta do agente nessas etapas e as rodadas do Agente Adversário, mesmo sem mensagem sua (mais custo e mais chance de ruído).</p>
                    <ul className="grid gap-2 sm:grid-cols-2" aria-label="Turnos da IA que disparam o Mentor">
                        {MENTOR_AI_STAGES.map((stage) => (
                            <MentorCheckbox key={stage} form={form} name={`triggers.ai.${stage}`} id={`mentor-ai-${stage}`} label={MENTOR_AI_STAGE_LABELS[stage]} />
                        ))}
                    </ul>
                </section>
            </CardContent>
        </Card>
    )
}
