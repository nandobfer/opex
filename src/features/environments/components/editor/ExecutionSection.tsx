"use client"

import { Controller, type UseFormReturn } from "react-hook-form"
import { FormSection } from "@/components/form-page/FormSection"
import { ChipInput } from "@/components/ui/chip-input"
import { Field } from "@/components/ui/field"
import { FORM_GRID } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { OptionTabs } from "@/components/ui/option-tabs"
import { sectionAnchor } from "../../editor-sections"
import type { EnvironmentInput, Machine } from "../../schemas"
import { machineOptions } from "../../view"

/** Portas digitadas ou coladas ("4100, 4101"): só números de 1 a 65535, sem repetir. */
export function parsePorts(items: string[]): number[] {
    const ports = items.map((item) => Number(item.trim())).filter((port) => Number.isInteger(port) && port >= 1 && port <= 65535)
    return [...new Set(ports)]
}

/** Execução: onde buildar e executar, as portas (repasse do PC) e a URL de saúde. */
export function ExecutionSection({ form, pcAvailable, pcReason }: { form: UseFormReturn<EnvironmentInput>; pcAvailable: boolean; pcReason: string | null }) {
    const errors = form.formState.errors
    const options = machineOptions(pcAvailable, pcReason)
    const portsError = errors.ports?.message ?? errors.ports?.find?.((item) => item?.message)?.message
    return (
        <FormSection id={sectionAnchor("execucao")} title="Execução" description="Onde o build roda e onde os containers sobem. Em máquinas diferentes, a imagem passa pelo registry do servidor.">
            <div className={FORM_GRID}>
                <Field id="environment-build-on" label="Build em" error={errors.buildOn?.message}>
                    <Controller
                        control={form.control}
                        name="buildOn"
                        render={({ field }) => <OptionTabs<Machine> id="environment-build-on" aria-label="Build em" options={options} value={field.value} onChange={field.onChange} className="w-full" />}
                    />
                </Field>
                <Field id="environment-run-on" label="Executar em" error={errors.runOn?.message}>
                    <Controller control={form.control} name="runOn" render={({ field }) => <OptionTabs<Machine> id="environment-run-on" aria-label="Executar em" options={options} value={field.value} onChange={field.onChange} className="w-full" />} />
                </Field>
                {!pcAvailable && <p className="text-xs text-muted-foreground sm:col-span-2">PC indisponível: {pcReason ?? "túnel fechado"}.</p>}
                <Field id="environment-ports" label="Portas" error={portsError}>
                    <Controller
                        control={form.control}
                        name="ports"
                        render={({ field }) => <ChipInput id="environment-ports" aria-label="Portas" value={field.value.map(String)} onChange={(items) => field.onChange(parsePorts(items))} placeholder="4100, 4101 (Enter adiciona)" />}
                    />
                    <p className="text-xs text-muted-foreground">Portas do ambiente; executando no PC, são repassadas para o servidor.</p>
                </Field>
                <Field id="environment-health" label="URL de saúde (opcional)" error={errors.healthUrl?.message}>
                    <Input id="environment-health" aria-invalid={errors.healthUrl ? true : undefined} className="font-mono" placeholder="http://localhost:4100/api/health" {...form.register("healthUrl")} />
                    <p className="text-xs text-muted-foreground">O deploy espera esta URL responder antes de dar sucesso.</p>
                </Field>
            </div>
        </FormSection>
    )
}
