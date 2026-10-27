"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Controller, useWatch, type UseFormReturn } from "react-hook-form"
import { Info } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { FORM_GRID } from "@/components/ui/form-grid"
import { OptionTabs } from "@/components/ui/option-tabs"
import { NumberField } from "@/features/pr-review/components/NumberField"
import { ADVERSARIAL_ROUNDS_MAX, ADVERSARIAL_ROUNDS_MIN, type AdversarialCorrectionMode, type AdversarialStopPolicy } from "../../constants"
import type { AdversarialSettings } from "../../schemas"

const reveal = { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: "auto" }, exit: { opacity: 0, height: 0 }, transition: { duration: 0.2 } }

const STOP_OPTIONS = (pause: string): { value: AdversarialStopPolicy; label: string }[] => [
    { value: "pause", label: pause },
    { value: "continue", label: "Seguir com aviso" },
]

/** Correção dos bloqueios, limite de rodadas e o que fazer quando o adversário falha. */
export function FlowCard({ form }: { form: UseFormReturn<AdversarialSettings> }) {
    const errors = form.formState.errors
    const correction = useWatch({ control: form.control, name: "correction" })
    const limited = useWatch({ control: form.control, name: "rounds.limited" })
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Bloqueios e falhas</CardTitle>
                <CardDescription>O que a mesa faz quando o adversário bloqueia, quantas rodadas de correção ele pode pedir e o que acontece se a revisão falhar.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                <Field id="adversarial-correction" label="Correção dos bloqueios">
                    <Controller
                        control={form.control}
                        name="correction"
                        render={({ field }) => (
                            <OptionTabs<AdversarialCorrectionMode>
                                id="adversarial-correction"
                                options={[
                                    { value: "auto", label: "Automática" },
                                    { value: "confirm", label: "Pedir confirmação" },
                                ]}
                                value={field.value}
                                onChange={field.onChange}
                                className="w-full"
                            />
                        )}
                    />
                    <p className="text-xs text-muted-foreground">
                        {correction === "auto" ? "Os achados bloqueantes voltam direto ao agente de implementação, que corrige e passa por nova revisão." : "A mesa para e você decide: corrigir (escolhendo os achados), seguir mesmo assim ou revisar de novo."}
                    </p>
                </Field>

                <AnimatePresence initial={false}>
                    {correction === "auto" && (
                        <motion.div key="rounds" {...reveal} className="space-y-4 overflow-hidden">
                            <Field id="adversarial-rounds-mode" label="Rodadas de correção">
                                <Controller
                                    control={form.control}
                                    name="rounds.limited"
                                    render={({ field }) => (
                                        <OptionTabs<"limited" | "unlimited">
                                            id="adversarial-rounds-mode"
                                            options={[
                                                { value: "limited", label: "Limitar" },
                                                { value: "unlimited", label: "Sem limite" },
                                            ]}
                                            value={field.value ? "limited" : "unlimited"}
                                            onChange={(next) => field.onChange(next === "limited")}
                                            className="w-full"
                                        />
                                    )}
                                />
                            </Field>
                            <AnimatePresence initial={false} mode="wait">
                                {limited ? (
                                    <motion.div key="limited" {...reveal} className="overflow-hidden">
                                        <div className={FORM_GRID}>
                                            <NumberField<AdversarialSettings> control={form.control} name="rounds.max" id="adversarial-rounds-max" label="Máximo de rodadas" min={ADVERSARIAL_ROUNDS_MIN} max={ADVERSARIAL_ROUNDS_MAX} error={errors.rounds?.max?.message} />
                                            <Field id="adversarial-on-limit" label="Ao atingir o limite">
                                                <Controller
                                                    control={form.control}
                                                    name="rounds.onLimit"
                                                    render={({ field }) => <OptionTabs<AdversarialStopPolicy> id="adversarial-on-limit" options={STOP_OPTIONS("Pausar e perguntar")} value={field.value} onChange={field.onChange} className="w-full" />}
                                                />
                                            </Field>
                                        </div>
                                    </motion.div>
                                ) : (
                                    <motion.p key="unlimited" {...reveal} className="flex items-start gap-2 overflow-hidden text-xs text-amber-300">
                                        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> Sem limite, o ciclo só termina quando o adversário aprovar, quando você agir na mesa (Parar, Seguir mesmo assim) ou se a revisão falhar.
                                    </motion.p>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    )}
                </AnimatePresence>

                <Field id="adversarial-on-failure" label="Se a revisão falhar (erro, tempo esgotado ou resposta sem os achados)">
                    <Controller
                        control={form.control}
                        name="onFailure"
                        render={({ field }) => <OptionTabs<AdversarialStopPolicy> id="adversarial-on-failure" options={STOP_OPTIONS("Pausar")} value={field.value} onChange={field.onChange} className="w-full" />}
                    />
                    <p className="text-xs text-muted-foreground">Pausada, a mesa oferece Tentar novamente e Seguir mesmo assim.</p>
                </Field>
            </CardContent>
        </Card>
    )
}
