"use client"

import type { UseFormReturn } from "react-hook-form"
import type { AiProviderId, AiProviderStatusDto } from "@nandobfer/integracoes/modules/integrations/ia/ai/providers"
import { ProviderModelCard } from "@nandobfer/integracoes/modules/integrations/ia/features/ai/components/shared/ProviderModelCard"
import type { SecretarySettings } from "../schemas"

/** Onde fica cada modelo do Secretário no formulário. */
export type SecretaryModelPrefix = "main" | "media.model" | "analysis.model" | "decision.model"

const namesOf = (prefix: SecretaryModelPrefix) => ({ provider: `${prefix}.provider`, model: `${prefix}.model`, agent: `${prefix}.agent`, variant: `${prefix}.variant` })

/**
 * Provedor e modelo de um dos modelos do Secretário. O `ProviderModelCard` compartilhado só avisa a troca de provedor
 * (`onProviderChange`): aqui a troca grava o provedor e limpa o modelo e a variante, como nas outras telas.
 */
export function SecretaryModelCard({ form, prefix, idPrefix, providers }: { form: UseFormReturn<SecretarySettings>; prefix: SecretaryModelPrefix; idPrefix: string; providers: AiProviderStatusDto[] }) {
    const set = form.setValue as (name: string, value: unknown, options?: { shouldDirty?: boolean; shouldValidate?: boolean }) => void
    const changeProvider = (provider: AiProviderId) => {
        set(`${prefix}.provider`, provider, { shouldDirty: true, shouldValidate: true })
        set(`${prefix}.model`, null, { shouldDirty: true, shouldValidate: true })
        set(`${prefix}.variant`, null, { shouldDirty: true })
    }
    return <ProviderModelCard form={form} providers={providers} names={namesOf(prefix)} hideAgent idPrefix={idPrefix} onProviderChange={changeProvider} />
}
