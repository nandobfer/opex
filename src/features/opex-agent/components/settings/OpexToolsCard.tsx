"use client"

import { Controller, type UseFormReturn } from "react-hook-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { FORM_GRID } from "@/components/ui/form-grid"
import { OptionTabs } from "@/components/ui/option-tabs"
import { ToggleCard } from "@/components/ui/toggle-card"
import { OPEX_CONFIRMATION_POLICIES, OPEX_CONFIRMATION_POLICY_LABELS, OPEX_TOOL_GROUP_LABELS, OPEX_TOOL_GROUPS, type OpexConfirmationPolicy } from "../../constants"
import type { OpexAgentSettings } from "../../schemas"

/** Grupos de ferramentas liberados ao agente e quando ele pede confirmação. */
export function OpexToolsCard({ form, toolCounts }: { form: UseFormReturn<OpexAgentSettings>; toolCounts: Record<string, number> }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Ferramentas</CardTitle>
                <CardDescription>O agente usa quantas ferramentas precisar, sem limite de chamadas. Desligue os grupos que ele não deve usar.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                <Field id="opex-confirmation" label="Pedir confirmação antes de executar">
                    <Controller
                        control={form.control}
                        name="confirmation"
                        render={({ field }) => (
                            <OptionTabs<OpexConfirmationPolicy>
                                id="opex-confirmation"
                                options={OPEX_CONFIRMATION_POLICIES.map((value) => ({ value, label: OPEX_CONFIRMATION_POLICY_LABELS[value] }))}
                                value={field.value}
                                onChange={field.onChange}
                                className="w-full"
                            />
                        )}
                    />
                    <p className="text-xs text-muted-foreground">Ações destrutivas (excluir, arquivar, parar, gravar integração, usuário/senha/token de cliente…) sempre mostram Confirmar/Cancelar no chat.</p>
                </Field>
                <div className={FORM_GRID}>
                    {OPEX_TOOL_GROUPS.map((group) => (
                        <Controller
                            key={group}
                            control={form.control}
                            name={`toolGroups.${group}`}
                            render={({ field }) => (
                                <ToggleCard
                                    id={`opex-tools-${group}`}
                                    checked={group === "context" ? true : Boolean(field.value)}
                                    onCheckedChange={field.onChange}
                                    disabled={group === "context"}
                                    label={`${OPEX_TOOL_GROUP_LABELS[group].label} (${toolCounts[group] ?? 0})`}
                                    description={OPEX_TOOL_GROUP_LABELS[group].description}
                                    onLabel="Liberado"
                                    offLabel="Bloqueado"
                                />
                            )}
                        />
                    ))}
                </div>
            </CardContent>
        </Card>
    )
}
