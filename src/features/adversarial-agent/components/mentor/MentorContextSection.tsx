"use client"

import type { UseFormReturn } from "react-hook-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { MentorContext, MentorSettings } from "../../mentor/schemas"
import { MentorCheckbox } from "./MentorCheckbox"

const ITEMS: { key: keyof MentorContext; label: string; description: string }[] = [
    { key: "userMessage", label: "Mensagem do usuário", description: "O que você pediu (correção, feedback, orientação)" },
    { key: "agentResponse", label: "Resposta do agente", description: "O fim da resposta de cada turno da cadeia" },
    { key: "taskBasics", label: "Dados básicos da tarefa", description: "Código e título: só para julgar, nunca copiados para a memória" },
    { key: "adversarialVerdict", label: "Último veredito do adversário", description: "Resumo e títulos dos achados da rodada mais recente da mesa" },
    { key: "approvedPlan", label: "Plano aprovado", description: "A versão mais recente do plano da mesa" },
]

/** O que entra no caso avaliado pelo decisor e pelo redator. */
export function MentorContextSection({ form }: { form: UseFormReturn<MentorSettings> }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Contexto</CardTitle>
                <CardDescription>Tudo é tratado como dado: nada do caso vira instrução nem é copiado literalmente para a memória. As memórias existentes do adversário sempre vão ao redator, para deduplicar e fundir.</CardDescription>
            </CardHeader>
            <CardContent>
                <ul className="grid gap-2 sm:grid-cols-2" aria-label="Contexto do Agente Mentor">
                    {ITEMS.map((item) => (
                        <MentorCheckbox key={item.key} form={form} name={`context.${item.key}`} id={`mentor-context-${item.key}`} label={item.label} description={item.description} />
                    ))}
                </ul>
            </CardContent>
        </Card>
    )
}
