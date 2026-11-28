"use client"

import type { UseFormReturn } from "react-hook-form"
import { FormSection } from "@/components/form-page/FormSection"
import { sectionAnchor } from "../../editor-sections"
import type { EnvironmentInput } from "../../schemas"
import { EnvVarsField, type EnvValuesStatus } from "../EnvVarsField"

/** Variáveis extras: cifradas no Opex, gravadas no `.env.opex` e passadas a todos os serviços. */
export function VariablesSection({ form, status, onRetry }: { form: UseFormReturn<EnvironmentInput>; status: EnvValuesStatus; onRetry: () => void }) {
    return (
        <FormSection id={sectionAnchor("variaveis")} title="Variáveis extras" description="Cifradas no Opex e entregues a todos os serviços pelo .env.opex. O environment de um serviço (em Serviços do compose) vence a variável de mesmo nome.">
            <EnvVarsField form={form} status={status} onRetry={onRetry} />
        </FormSection>
    )
}
