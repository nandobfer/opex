"use client"

import { useEffect, useRef } from "react"
import { useUrlFilters, urlFilterCodecs } from "@/hooks/useUrlFilters"
import { OptionTabs } from "@/components/ui/option-tabs"
import { ErrorState } from "@/components/feedback/ErrorState"
import {
    IntegrationConsole,
    type IntegrationConsoleHandle,
} from "@/features/integrations/components/IntegrationConsole"
import { useEnvironmentLogs } from "../hooks/useEnvironmentLogs"

const defaults = { servicoAmbiente: "" }
const schema = { servicoAmbiente: urlFilterCodecs.string() }

/** Aba Logs: acompanhamento compartilhado do ambiente, com o console ocupando o painel. */
export function EnvironmentLogsTab({ repoId, envId, services }: { repoId: string; envId: string; services: string[] }) {
    const [filters, setFilters] = useUrlFilters(defaults, schema)
    const service = filters.servicoAmbiente
    const setService = (value: string) => setFilters((previous) => ({ ...previous, servicoAmbiente: value }))
    const query = useEnvironmentLogs(repoId, envId, service)
    const consoleRef = useRef<IntegrationConsoleHandle>(null)
    const written = useRef(new Set<string>())
    useEffect(() => {
        written.current.clear()
        consoleRef.current?.clear()
    }, [service])
    useEffect(() => {
        const lines = (query.data ?? []).filter((line) => !written.current.has(line.id))
        if (!lines.length) return
        consoleRef.current?.writeLines(
            lines.map((line) => `[${new Date(line.ts).toLocaleTimeString("pt-BR")}] ${line.message}`),
        )
        lines.forEach((line) => written.current.add(line.id))
    }, [query.data])
    return (
        <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
            <p className="text-sm text-muted-foreground">
                Acompanhamento compartilhado: sair desta aba não interrompe outros espectadores. O histórico é retido pela
                infraestrutura de integrações.
            </p>
            {services.length > 0 && (
                <OptionTabs<string>
                    id="environment-log-service"
                    aria-label="Serviço dos logs"
                    className="w-fit"
                    options={[{ value: "", label: "Todos" }, ...services.map((name) => ({ value: name, label: name }))]}
                    value={service}
                    onChange={setService}
                />
            )}
            {query.isError && <ErrorState title="Não foi possível carregar os logs" onRetry={() => void query.refetch()} />}
            {query.isLoading && (
                <p role="status" className="text-sm text-muted-foreground">
                    Carregando histórico…
                </p>
            )}
            <IntegrationConsole ref={consoleRef} className="min-h-[320px] flex-1" />
        </div>
    )
}
