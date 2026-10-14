"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { RefreshCw, Terminal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useEnvironmentCompose, useEnvironmentLogs, type AmbientesApi } from "../../hooks"
import type { EnvironmentLogLine } from "../../types"

const ALL_SERVICES = "__all__"

function formatLine(line: EnvironmentLogLine): string {
    const ts = new Date(line.ts)
    const stamp = `${ts.toISOString().slice(0, 10)} ${ts.toISOString().slice(11, 23)}`
    const level = line.level.toUpperCase().padEnd(7)
    const service = line.service ? `[${line.service}] ` : ""
    return `[${stamp}] ${level} ${service}${line.message}`
}

/**
 * Aba Logs: transmite os logs reais dos containers do projeto Compose (histórico gravado + ao vivo,
 * pelo coletor do servidor) por serviço ou todos. Não depende de o deploy ter sido feito pelo Opex.
 */
export function LogsTab({ context, envId }: { context: AmbientesApi; envId: string }) {
    const [service, setService] = useState<string>(ALL_SERVICES)
    const [lines, setLines] = useState<string[]>([])
    const [reloadKey, setReloadKey] = useState(0)
    const [received, setReceived] = useState(false)
    const buffer = useRef<string[]>([])
    const viewport = useRef<HTMLDivElement>(null)
    const compose = useEnvironmentCompose(context, envId, true)

    const onLines = useCallback((incoming: EnvironmentLogLine[], reset: boolean) => {
        if (reset) buffer.current = []
        if (incoming.length > 0) {
            buffer.current = [...buffer.current, ...incoming.map(formatLine)].slice(-2_000)
            setLines(buffer.current)
            setReceived(true)
        } else if (reset) {
            setLines([])
        }
    }, [])

    // `reloadKey` reinicia a assinatura (efeito refeito com reset), como o botão "Atualizar".
    useEnvironmentLogs(context, envId, {
        enabled: true,
        service: service === ALL_SERVICES ? null : service,
        onLines,
        reloadKey,
    })

    const services = useMemo(() => compose.data?.summary.services.map((item) => item.name) ?? [], [compose.data])

    // Rola para o fim quando chegam linhas novas (o usuário pode rolar para cima para inspecionar).
    useEffect(() => {
        const node = viewport.current
        if (node && lines.length > 0) node.scrollTop = node.scrollHeight
    }, [lines.length])

    const hostUnavailable = compose.isError

    return (
        <div className="flex h-full min-h-0 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
                <Select value={service} onValueChange={setService}>
                    <SelectTrigger className="w-full sm:w-64" aria-label="Serviço">
                        <SelectValue placeholder="Todos os serviços" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={ALL_SERVICES}>Todos os serviços</SelectItem>
                        {services.map((name) => (
                            <SelectItem key={name} value={name}>
                                {name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={() => setReloadKey((value) => value + 1)} className="ml-auto">
                    <RefreshCw className="mr-2 h-3.5 w-3.5" aria-hidden />
                    Atualizar
                </Button>
            </div>
            <div ref={viewport} className="min-h-[320px] flex-1 overflow-auto rounded-md border border-border bg-black/40 p-3 font-mono text-xs leading-relaxed text-foreground">
                {lines.length === 0 ? (
                    <p className="flex items-center gap-2 text-muted-foreground">
                        <Terminal className="h-4 w-4" aria-hidden />
                        {hostUnavailable
                            ? "Não foi possível ler o compose nem os containers deste ambiente."
                            : received
                              ? "Sem saída nos containers no momento."
                              : "Aguardando logs do container..."}
                    </p>
                ) : (
                    lines.map((line, index) => <div key={`${index}-${line.slice(0, 24)}`}>{line}</div>)
                )}
            </div>
        </div>
    )
}
