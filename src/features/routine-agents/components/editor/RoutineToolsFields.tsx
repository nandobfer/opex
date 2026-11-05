"use client"

import { useMemo } from "react"
import { Controller, useWatch, type UseFormReturn } from "react-hook-form"
import { Globe, Lock } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { buildOpexToolTree } from "@/features/opex-agent/tool-tree"
import { useOpexSettings } from "@/features/opex-agent/hooks/useOpexSettings"
import { ClienteOpexToolsCard } from "@/features/opex-agent/components/settings/client/ClienteOpexToolsCard"
import { ClienteOpexMcpCard } from "@/features/opex-agent/components/settings/client/ClienteOpexMcpCard"
import { ROUTINE_INTERNAL_TOOLS, ROUTINE_INTERNAL_TOOL_LABELS } from "../../constants"
import type { RoutineAgentInput } from "../../schemas"
import { useRoutineOpencodeOptions } from "../../hooks/useRoutineAgents"

/** Ferramentas internas: entram sempre e não podem ser desmarcadas. */
function InternalToolsCard() {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <Lock className="h-4 w-4" aria-hidden /> Sempre liberadas
                </CardTitle>
                <CardDescription>Memória, espera, hibernação, confirmação e conclusão entram em toda execução, nos dois motores.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-1.5">
                {ROUTINE_INTERNAL_TOOLS.map((tool) => (
                    <span key={tool} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        {ROUTINE_INTERNAL_TOOL_LABELS[tool]}
                    </span>
                ))}
            </CardContent>
        </Card>
    )
}

function OpexTools({ form }: { form: UseFormReturn<RoutineAgentInput> }) {
    const settings = useOpexSettings()
    const tree = useMemo(() => buildOpexToolTree(settings.data?.tools ?? []), [settings.data?.tools])
    if (settings.isLoading) return <Skeleton className="h-64 w-full" />
    if (settings.isError) return <ErrorState title="Não foi possível carregar as ferramentas" description={apiErrorMessage(settings.error, "Tente novamente.")} onRetry={() => void settings.refetch()} />
    return (
        <>
            <Controller
                control={form.control}
                name="opex.enabledTools"
                render={({ field }) => (
                    <ClienteOpexToolsCard title="Ferramentas do Opex" tree={tree} value={field.value} onChange={field.onChange} description="A mesma árvore de grupos e ferramentas do Agente Opex. Com a confirmação ligada, as que pedem confirmação no Agente Opex param a execução até você confirmar." />
                )}
            />
            <Controller
                control={form.control}
                name="opex.enabledMcpServers"
                render={({ field }) => <ClienteOpexMcpCard value={field.value} onChange={field.onChange} description="MCPs cadastrados em Agente Opex › MCPs. Ligue os que este agente pode usar (ex.: um MCP de navegador)." warning={null} />}
            />
        </>
    )
}

function OpencodeMcps({ form }: { form: UseFormReturn<RoutineAgentInput> }) {
    const options = useRoutineOpencodeOptions(true)
    const mcps = options.data?.mcps ?? []
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">MCPs do host</CardTitle>
                <CardDescription>MCPs do opencode.jsonc do host liberados para este agente; os demais ficam negados na sessão. O navegador para plataformas externas vem do MCP de navegador do host.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
                {options.isLoading ? (
                    <Skeleton className="h-16 w-full" />
                ) : !options.data?.available ? (
                    <p className="text-sm text-muted-foreground">{options.data?.reason ?? "Serviço OpenCode indisponível."}</p>
                ) : mcps.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum MCP no opencode.jsonc do host.</p>
                ) : (
                    <Controller
                        control={form.control}
                        name="opencode.enabledMcps"
                        render={({ field }) => (
                            <ul className="space-y-2">
                                {mcps.map((mcp) => (
                                    <li key={mcp.name} className="flex items-center justify-between gap-3 rounded-md border p-2">
                                        <span className="flex items-center gap-2 text-sm">
                                            {mcp.browser && <Globe className="h-4 w-4 text-primary" aria-label="Navegador" />}
                                            <code>{mcp.name}</code>
                                            <span className="text-xs text-muted-foreground">{mcp.status}</span>
                                        </span>
                                        <Switch
                                            aria-label={`Liberar ${mcp.name}`}
                                            checked={field.value.includes(mcp.name)}
                                            onCheckedChange={(checked) => field.onChange(checked ? [...field.value, mcp.name] : field.value.filter((name) => name !== mcp.name))}
                                        />
                                    </li>
                                ))}
                            </ul>
                        )}
                    />
                )}
                {options.data?.available && !options.data.browserAvailable && <p className="text-xs text-warning">Nenhum MCP de navegador conectado no host: o agente não navega em plataformas externas.</p>}
            </CardContent>
        </Card>
    )
}

/** Ferramentas por motor (Opex: árvore + MCPs do Opex; OpenCode: MCPs do host) e as internas fixas. */
export function RoutineToolsFields({ form }: { form: UseFormReturn<RoutineAgentInput> }) {
    const engine = useWatch({ control: form.control, name: "engine" })
    return (
        <div className="space-y-4">
            <InternalToolsCard />
            {engine === "opex" ? <OpexTools form={form} /> : <OpencodeMcps form={form} />}
        </div>
    )
}
