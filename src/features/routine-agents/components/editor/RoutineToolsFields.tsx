"use client"

import { useMemo } from "react"
import { Controller, useWatch, type UseFormReturn } from "react-hook-form"
import { Globe, Lock } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { SearchableCheckList } from "@/components/ui/check-list/SearchableCheckList"
import { FormToggleCard } from "@/components/ui/toggle-card"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { buildOpexToolTree } from "@/features/opex-agent/tool-tree"
import { useOpexSettings } from "@/features/opex-agent/hooks/useOpexSettings"
import { ClienteOpexToolsCard } from "@/features/opex-agent/components/settings/client/ClienteOpexToolsCard"
import { ClienteOpexMcpCard } from "@/features/opex-agent/components/settings/client/ClienteOpexMcpCard"
import { ROUTINE_INTERNAL_TOOLS, ROUTINE_INTERNAL_TOOL_LABELS, isRoutineForbiddenToolGroup } from "../../constants"
import type { RoutineAgentInput } from "../../schemas"
import { useRoutineOpencodeOptions } from "../../hooks/useRoutineAgents"
import type { RoutineOpencodeOptionsDto } from "../../types"
import { RoutineOpencodeSkillsCard, RoutineOpexSkillsCard } from "./RoutineSkillsFields"
import { ROUTINE_MCPS_LIST_SKELETON } from "./routine-tools-layout"

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
    const tree = useMemo(() => buildOpexToolTree((settings.data?.tools ?? []).filter((tool) => !isRoutineForbiddenToolGroup(tool.group))), [settings.data?.tools])
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
            <RoutineOpexSkillsCard form={form} />
        </>
    )
}

function OpencodeMcps({ form, options, loading, onRetry }: { form: UseFormReturn<RoutineAgentInput>; options: RoutineOpencodeOptionsDto | undefined; loading: boolean; onRetry: () => void }) {
    const unavailable = !loading && !options?.available
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">MCPs do host</CardTitle>
                <CardDescription>MCPs do opencode.jsonc do host liberados para este agente; os demais ficam negados na sessão. O navegador para plataformas externas vem do MCP de navegador do host.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                {loading ? (
                    <Skeleton className={ROUTINE_MCPS_LIST_SKELETON} />
                ) : (
                    <>
                        {unavailable ? <ErrorState title="Não foi possível listar os MCPs do host" description={options?.reason ?? "Serviço OpenCode indisponível."} onRetry={onRetry} /> : null}
                        <Controller
                            control={form.control}
                            name="opencode.enabledMcps"
                            render={({ field }) => (
                                <SearchableCheckList
                                    ariaLabel="MCPs do host"
                                    items={(options?.mcps ?? []).map((mcp) => ({
                                        key: mcp.name,
                                        label: mcp.name,
                                        icon: mcp.browser ? <Globe className="h-4 w-4 text-primary" aria-label="Navegador" /> : undefined,
                                        meta: <span className="text-xs text-muted-foreground">{mcp.status}</span>,
                                    }))}
                                    value={field.value}
                                    onChange={field.onChange}
                                    missingLabel={unavailable ? "(salvo; OpenCode indisponível)" : "(não encontrado)"}
                                    searchPlaceholder="Buscar MCP"
                                    emptyText={unavailable ? "A lista volta quando o OpenCode responder." : "Nenhum MCP no opencode.jsonc do host."}
                                />
                            )}
                        />
                    </>
                )}
                {options?.available && !options.browserAvailable && <p className="text-xs text-warning">Nenhum MCP de navegador conectado no host: o agente não navega em plataformas externas.</p>}
            </CardContent>
        </Card>
    )
}

function OpencodeFields({ form }: { form: UseFormReturn<RoutineAgentInput> }) {
    const options = useRoutineOpencodeOptions(true)
    const retry = () => void options.refetch()
    return (
        <>
            <OpencodeMcps form={form} options={options.data} loading={options.isLoading} onRetry={retry} />
            <RoutineOpencodeSkillsCard form={form} options={options.data} loading={options.isLoading} onRetry={retry} />
        </>
    )
}

/** Ferramentas por motor (Opex: árvore + MCPs e skills do Opex; OpenCode: MCPs e skills do host) e as internas fixas. */
export function RoutineToolsFields({ form }: { form: UseFormReturn<RoutineAgentInput> }) {
    const engine = useWatch({ control: form.control, name: "engine" })
    return (
        <div className="space-y-4">
            <InternalToolsCard />
            {engine === "opex" ? (
                <OpexTools form={form} />
            ) : (
                <>
                    <OpencodeFields form={form} />
                    <FormToggleCard
                        control={form.control}
                        name="opencode.httpRequests"
                        id="routine-opencode-http"
                        label="Chamadas HTTP com segredos"
                        description="Entrega ao agente a Chamada HTTP do Opex pelo MCP da execução, com os segredos da aba Segredos ({{secret:NOME}}). A chamada sai do servidor Opex e o OpenCode recebe só a resposta, com os segredos mascarados; webfetch e bash do OpenCode não têm acesso aos segredos."
                        onLabel="Ligado"
                        offLabel="Desligado"
                    />
                </>
            )}
        </div>
    )
}
