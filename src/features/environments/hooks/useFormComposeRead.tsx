"use client"

import { createContext, useContext, useState, type ReactNode } from "react"
import { useWatch, type UseFormReturn } from "react-hook-form"
import { toast } from "sonner"
import { mergeComposeServices } from "../limits-form"
import { composeServicesInputSchema, DEFAULT_ENVIRONMENT_LIMITS, type EnvironmentInput } from "../schemas"
import type { ComposeServicesDto, EnvironmentDto } from "../types"
import { useReadComposeServices } from "./useEnvironments"

/**
 * "Ler compose" compartilhado pelo formulário do ambiente (OPE-211): uma leitura alimenta os limites e os
 * serviços do compose. A leitura pedida pelo usuário (`explicit`) também preenche os limites declarados; a
 * automática (Editar abre o bloco dos serviços) só traz os valores "Do compose". Vive dentro do diálogo:
 * fechar descarta o resultado.
 */
export interface FormComposeRead {
    /** A origem está completa (no gerenciado, só depois de salvo: a revisão está no Opex). */
    canRead: boolean
    read: (options?: { explicit?: boolean }) => void
    result: ComposeServicesDto | null
    /** Nomes dos serviços do último "Ler compose" (`null` = ainda não lido). */
    names: string[] | null
    isPending: boolean
    isError: boolean
}

const ComposeReadContext = createContext<FormComposeRead | null>(null)

/** Limites declarados no compose entram no campo (e o toast diz o que aconteceu). */
function applyComposeLimits(form: UseFormReturn<EnvironmentInput>, result: ComposeServicesDto): void {
    const merged = mergeComposeServices(form.getValues("limits") ?? DEFAULT_ENVIRONMENT_LIMITS, result)
    form.setValue("limits", merged.limits, { shouldValidate: true, shouldDirty: true })
    if (merged.differs) toast.info("O compose declara limites diferentes por serviço: use \"Por serviço\" para vê-los.")
    else toast.success(`Compose lido: ${result.services.length} serviço(s)${merged.filled ? "; limites declarados preenchidos" : ""}`)
}

export function ComposeReadProvider({ form, env, children }: { form: UseFormReturn<EnvironmentInput>; env: EnvironmentDto | null; children: ReactNode }) {
    const source = useWatch({ control: form.control, name: "source" })
    // Origem incompleta (ex.: Novo sem a central) não dá para ler: nada de pedido que só voltaria erro.
    const canRead = composeServicesInputSchema.safeParse({ source, environmentId: env?.id }).success && (source?.kind !== "managed" || Boolean(env))
    const mutation = useReadComposeServices()
    const [result, setResult] = useState<ComposeServicesDto | null>(null)
    const read = ({ explicit = true }: { explicit?: boolean } = {}) => {
        if (!canRead) return
        const current = form.getValues("source")
        mutation.mutate(
            { source: current, ...(env && current?.kind === "managed" ? { environmentId: env.id } : {}) },
            {
                onSuccess: (data) => {
                    setResult(data)
                    if (explicit) applyComposeLimits(form, data)
                },
            },
        )
    }
    const value: FormComposeRead = { canRead, read, result, names: result ? result.services.map((service) => service.name) : null, isPending: mutation.isPending, isError: mutation.isError }
    return <ComposeReadContext.Provider value={value}>{children}</ComposeReadContext.Provider>
}

export function useComposeRead(): FormComposeRead {
    const value = useContext(ComposeReadContext)
    if (!value) throw new Error("useComposeRead fora do ComposeReadProvider")
    return value
}
