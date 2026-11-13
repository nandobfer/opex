"use client"

import type { UseFormReturn } from "react-hook-form"
import { BookOpenCheck, Filter, ListChecks, Route, ShieldCheck } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FormToggleCard } from "@/components/ui/toggle-card"
import type { MentorSettings } from "../../mentor/schemas"

const STEPS = [
    { icon: BookOpenCheck, title: "Transcrição", text: "Ao concluir a mesa, lê a conversa principal, os forks integrados, o plano, as revisões do Adversário, o PR e a conclusão." },
    { icon: ListChecks, title: "Digestor", text: "Extrai os casos (lições positivas e negativas) com a evidência citada." },
    { icon: Filter, title: "Decisor", text: "Dá a nota de cada caso contra o rigor da curadoria." },
    { icon: Route, title: "Triador", text: "Escolhe UMA lista por caso: desenvolvedor (globais ou desta central) ou Adversário." },
    { icon: ShieldCheck, title: "Redator e sanitizador", text: "Cria, atualiza, funde ou arquiva nessa lista, sem aprovação. Nunca exclui; a memória do dono só recebe atualização ou fusão." },
] as const

/**
 * Como o Agente Mentor aprende desde a OPE-165 (uma vez por conclusão da mesa) e a chave do aprendizado
 * na conclusão. Com ela ligada, o agente desenvolvedor das centrais no escopo fica somente leitura.
 */
export function MentorHowItWorksCard({ form }: { form: UseFormReturn<MentorSettings> }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Aprendizado na conclusão da mesa</CardTitle>
                <CardDescription>
                    Uma execução por conclusão (reabrir e concluir de novo gera outra). Excluir, cancelar ou abandonar uma mesa não dispara o Mentor. Uma execução pode gravar em várias listas: cada caso vai para a sua. O resultado aparece na aba Aprendizado da mesa.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <ol className="grid gap-2 sm:grid-cols-2" aria-label="Etapas do aprendizado">
                    {STEPS.map((step, index) => (
                        <li key={step.title} className="flex gap-2.5 rounded-lg border p-3 last:sm:col-span-2">
                            <step.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                            <div className="min-w-0 space-y-0.5">
                                <p className="text-sm font-medium">{`${index + 1}. ${step.title}`}</p>
                                <p className="text-xs text-muted-foreground">{step.text}</p>
                            </div>
                        </li>
                    ))}
                </ol>
                <FormToggleCard<MentorSettings>
                    control={form.control}
                    name="learnOnDone"
                    id="mentor-learn-on-done"
                    label="Aprender ao concluir a mesa"
                    description="Ligado, o agente desenvolvedor das centrais no escopo fica somente leitura (contexto, dicas, busca e leitura por id) e quem grava as memórias é o Mentor. Desligado, vale a chave de aprendizado autônomo do desenvolvedor."
                />
            </CardContent>
        </Card>
    )
}
