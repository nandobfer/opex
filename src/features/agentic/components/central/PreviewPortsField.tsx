"use client"

import { useWatch } from "react-hook-form"
import { Field } from "@/components/ui/field"
import { FORM_GRID } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { ToggleCard } from "@/components/ui/toggle-card"
import { PREVIEW_PORT_MAX, PREVIEW_PORT_MIN } from "../../constants"
import { keepValidPort } from "../../logic"
import type { AgenticPorts } from "../../schemas"
import type { CentralForm } from "./form"

/**
 * Faixa de portas das prévias da central: switch "Personalizar portas" (desligado = herda a faixa
 * padrão de "Configurações Padrão", mostrada nos campos desabilitados; ligado = faixa própria, que
 * começa com os valores padrão exibidos).
 */
export function PreviewPortsField({ form, global }: { form: CentralForm; global: AgenticPorts | undefined }) {
    const errors = form.formState.errors.environment
    const custom = useWatch({ control: form.control, name: "environment.inheritPorts" }) === false

    const selectCustom = (on: boolean) => {
        if (on) {
            // Os campos ficam editáveis com a faixa padrão que estava na tela (os números não mudam).
            if (global) {
                form.setValue("environment.previewPortMin", global.previewPortMin, { shouldDirty: true })
                form.setValue("environment.previewPortMax", global.previewPortMax, { shouldDirty: true })
            }
        } else {
            // Herdando, a faixa própria não aparece: valor inválido volta ao salvo (ou ao padrão) para não
            // travar o Salvar com um erro que não aparece.
            const saved = form.formState.defaultValues?.environment
            for (const name of ["previewPortMin", "previewPortMax"] as const) {
                const restored = keepValidPort(form.getValues(`environment.${name}`), saved?.[name], name === "previewPortMin" ? PREVIEW_PORT_MIN : PREVIEW_PORT_MAX)
                if (restored !== form.getValues(`environment.${name}`)) form.setValue(`environment.${name}`, restored, { shouldDirty: true })
            }
        }
        form.setValue("environment.inheritPorts", !on, { shouldDirty: true })
        void form.trigger("environment")
    }

    return (
        <div className="space-y-3">
            <ToggleCard
                bare
                id="central-env-ports-custom"
                checked={custom}
                onCheckedChange={selectCustom}
                disabled={!custom && !global}
                label="Personalizar portas"
                description={custom ? "Faixa própria desta central, no lugar da faixa padrão" : "Usa a faixa padrão de Configurações Padrão"}
                onLabel="Sim"
                offLabel="Não"
            />
            <div className={FORM_GRID}>
                {custom ? (
                    <>
                        <Field id="central-env-port-min" label="Porta inicial da prévia" error={errors?.previewPortMin?.message}>
                            <Input key="own-min" id="central-env-port-min" type="number" min={1024} max={65535} {...form.register("environment.previewPortMin", { valueAsNumber: true })} aria-invalid={errors?.previewPortMin ? true : undefined} />
                        </Field>
                        <Field id="central-env-port-max" label="Porta final da prévia" error={errors?.previewPortMax?.message}>
                            <Input key="own-max" id="central-env-port-max" type="number" min={1024} max={65535} {...form.register("environment.previewPortMax", { valueAsNumber: true })} aria-invalid={errors?.previewPortMax ? true : undefined} />
                        </Field>
                    </>
                ) : (
                    <>
                        <Field id="central-env-port-min" label="Porta inicial da prévia">
                            <Input key="global-min" id="central-env-port-min" type="number" disabled readOnly value={global?.previewPortMin ?? ""} />
                        </Field>
                        <Field id="central-env-port-max" label="Porta final da prévia">
                            <Input key="global-max" id="central-env-port-max" type="number" disabled readOnly value={global?.previewPortMax ?? ""} />
                        </Field>
                    </>
                )}
            </div>
        </div>
    )
}
