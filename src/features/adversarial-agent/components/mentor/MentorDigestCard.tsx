"use client"

import type { UseFormReturn } from "react-hook-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FORM_GRID } from "@/components/ui/form-grid"
import { AI_TEXT_PROVIDER_IDS, type AiProviderStatusDto } from "@/lib/ai/providers"
import { NumberField } from "@/features/pr-review/components/NumberField"
import { MENTOR_BUDGET_MAX, MENTOR_BUDGET_MIN, MENTOR_COMPACT_MAX, MENTOR_COMPACT_MIN, MENTOR_DIGEST_TIMEOUT_MAX, MENTOR_DIGEST_TIMEOUT_MIN } from "../../mentor/constants"
import type { MentorSettings } from "../../mentor/schemas"
import { MentorModelFields } from "./MentorModelFields"

/** Digestor (OPE-165): lê a transcrição inteira da mesa e extrai os casos; orçamento e limiar de compactação. */
export function MentorDigestCard({ form, providers }: { form: UseFormReturn<MentorSettings>; providers: AiProviderStatusDto[] }) {
    const errors = form.formState.errors.digest
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Digestor, orçamento e transcrição</CardTitle>
                <CardDescription>
                    O digestor lê a transcrição inteira da mesa concluída (mensagens do dono, texto e ferramentas do agente, avisos, plano, revisões do Adversário, PR e conclusão) e extrai os casos: a lição, a evidência citada, se é positiva ou negativa e se vale em qualquer projeto ou só neste. Prefira um modelo barato de contexto longo. Acima do limiar, a transcrição é compactada de forma determinística (as mensagens do dono, o plano e os achados nunca são cortados). O orçamento vale para a execução inteira: passou, ela é interrompida e o motivo fica registrado.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                <MentorModelFields form={form} part="digest" providerIds={AI_TEXT_PROVIDER_IDS} providers={providers} />
                <div className={FORM_GRID}>
                    <NumberField<MentorSettings>
                        control={form.control}
                        name="digest.budgetUsd"
                        id="mentor-digest-budget"
                        label={`Orçamento por execução (US$ ${MENTOR_BUDGET_MIN}–${MENTOR_BUDGET_MAX})`}
                        min={MENTOR_BUDGET_MIN}
                        max={MENTOR_BUDGET_MAX}
                        step={0.01}
                        error={errors?.budgetUsd?.message}
                    />
                    <NumberField<MentorSettings>
                        control={form.control}
                        name="digest.timeoutSeconds"
                        id="mentor-digest-timeout"
                        label={`Tempo máximo do digestor (${MENTOR_DIGEST_TIMEOUT_MIN}–${MENTOR_DIGEST_TIMEOUT_MAX} segundos)`}
                        min={MENTOR_DIGEST_TIMEOUT_MIN}
                        max={MENTOR_DIGEST_TIMEOUT_MAX}
                        error={errors?.timeoutSeconds?.message}
                    />
                    <NumberField<MentorSettings>
                        control={form.control}
                        name="digest.compactThresholdChars"
                        id="mentor-digest-threshold"
                        label={`Compactar a transcrição acima de (caracteres, ${MENTOR_COMPACT_MIN.toLocaleString("pt-BR")}–${MENTOR_COMPACT_MAX.toLocaleString("pt-BR")})`}
                        min={MENTOR_COMPACT_MIN}
                        max={MENTOR_COMPACT_MAX}
                        step={1000}
                        error={errors?.compactThresholdChars?.message}
                    />
                </div>
            </CardContent>
        </Card>
    )
}
