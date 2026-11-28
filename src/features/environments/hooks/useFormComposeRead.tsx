"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { useWatch, type UseFormReturn } from "react-hook-form"
import { parseComposeYaml } from "../compose-config"
import { composeServicesInputSchema, type EnvironmentInput } from "../schemas"
import type { ComposeServicesDto, EnvironmentDto } from "../types"
import { useReadComposeServices } from "./useEnvironments"

/** Espera depois da última mudança da origem antes de ler o compose de novo. */
export const COMPOSE_READ_DEBOUNCE_MS = 800

/**
 * Leitura do compose da página Novo/Editar ambiente (OPE-211), uma só para a página toda: alimenta as
 * sugestões de serviços da Origem, os limites por serviço e a lista de serviços. Lê sozinha ao abrir e
 * de novo quando a origem muda (espera `COMPOSE_READ_DEBOUNCE_MS`). Lê sempre TODOS os serviços do compose
 * (a lista marca os que ficam fora do ambiente). No Novo do compose gerenciado, o YAML do editor é lido no
 * navegador (a revisão ainda não existe no Opex).
 */
export interface FormComposeRead {
    /** A origem está completa para ler. */
    canRead: boolean
    read: () => void
    result: ComposeServicesDto | null
    /** Nomes dos serviços do compose lido (`null` = ainda não lido). */
    names: string[] | null
    isPending: boolean
    isError: boolean
}

const ComposeReadContext = createContext<FormComposeRead | null>(null)

/** Serviços do YAML do compose gerenciado ainda não salvo, no formato da leitura do servidor. */
function localRead(content: string | undefined): ComposeServicesDto | null {
    const services = content?.trim() ? parseComposeYaml(content) : null
    return services ? { services: services.map((service) => ({ name: service.name, hasBuild: service.hasBuild, declared: service.declared, limitStyle: service.limitStyle, values: service.values, unreadable: service.unreadable })) } : null
}

export function ComposeReadProvider({ form, env, children }: { form: UseFormReturn<EnvironmentInput>; env: EnvironmentDto | null; children: ReactNode }) {
    const source = useWatch({ control: form.control, name: "source" })
    const compose = useWatch({ control: form.control, name: "compose" })
    const local = source?.kind === "managed" && !env
    // Todos os serviços: a escolha da Origem não muda o que o compose declara.
    const readSource = useMemo(() => (source ? { ...source, services: [] } : source), [source])
    const readKey = JSON.stringify(readSource ?? null)
    const canRead = !local && composeServicesInputSchema.safeParse({ source: readSource, environmentId: env?.id }).success
    const mutation = useReadComposeServices()
    const { mutate } = mutation
    const [result, setResult] = useState<ComposeServicesDto | null>(null)
    const lastKey = useRef<string | null>(null)
    // Cada leitura leva um número: a resposta só vale se ainda for a da leitura mais recente (uma antiga e mais
    // lenta nunca sobrescreve a atual).
    const seq = useRef(0)

    const read = useCallback(() => {
        if (!canRead || !readSource) return
        lastKey.current = readKey
        const id = ++seq.current
        mutate({ source: readSource, ...(env && readSource.kind === "managed" ? { environmentId: env.id } : {}) }, { onSuccess: (data) => (id === seq.current ? setResult(data) : undefined) })
    }, [canRead, readSource, readKey, env, mutate])

    useEffect(() => {
        if (!canRead || lastKey.current === readKey) return
        // A primeira leitura sai na hora; as seguintes esperam a origem parar de mudar.
        const delay = lastKey.current === null ? 0 : COMPOSE_READ_DEBOUNCE_MS
        const timer = setTimeout(read, delay)
        return () => clearTimeout(timer)
    }, [canRead, readKey, read])

    const localResult = useMemo(() => (local ? localRead(compose) : null), [local, compose])
    const current = local ? localResult : result
    const value: FormComposeRead = {
        canRead: canRead || (local && localResult !== null),
        read,
        result: current,
        names: current ? current.services.map((service) => service.name) : null,
        isPending: !local && mutation.isPending,
        isError: !local && mutation.isError,
    }
    return <ComposeReadContext.Provider value={value}>{children}</ComposeReadContext.Provider>
}

export function useComposeRead(): FormComposeRead {
    const value = useContext(ComposeReadContext)
    if (!value) throw new Error("useComposeRead fora do ComposeReadProvider")
    return value
}
