"use client"

import { useEffect, useRef } from "react"
import { useUrlFilters, urlFilterCodecs } from "@/hooks/useUrlFilters"
import {
    IntegrationConsole,
    type IntegrationConsoleHandle,
} from "@/features/integrations/components/IntegrationConsole"
import { ErrorState } from "@/components/feedback/ErrorState"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useEnvironmentLogs } from "../hooks/useEnvironmentLogs"
const defaults = { servicoAmbiente: "" }
const schema = { servicoAmbiente: urlFilterCodecs.string() }

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
        <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
                Acompanhamento compartilhado: sair desta aba não interrompe outros espectadores. Histórico retido pela
                infraestrutura de integrações.
            </p>
            <Select value={service || "all"} onValueChange={(value) => setService(value === "all" ? "" : value)}>
                <SelectTrigger className="w-full" aria-label="Serviço dos logs">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">Todos os serviços</SelectItem>
                    {services.map((name) => (
                        <SelectItem key={name} value={name}>
                            {name}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {query.isError && <ErrorState title="Falha ao carregar logs" onRetry={() => void query.refetch()} />}
            <IntegrationConsole ref={consoleRef} className="h-[440px]" />
            {query.isLoading && (
                <p role="status" className="text-sm text-muted-foreground">
                    Carregando histórico…
                </p>
            )}
        </div>
    )
}
