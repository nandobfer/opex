"use client"

import { useState } from "react"
import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import { AlertTriangle, Boxes, Plug, Rocket, RotateCcw, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/feedback/EmptyState"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAdoptCompose, useDiscoverCompose, useEnvironmentDetail, useEnvironmentOperationRealtime, type AmbientesApi } from "../hooks"
import type { EnvironmentDto } from "../types"
import { EnvironmentStatusBadge } from "./EnvironmentListPanel"
import { ComposeTab } from "./tabs/ComposeTab"
import { LogsTab } from "./tabs/LogsTab"
import { PublishTab } from "./tabs/PublishTab"
import { RestoreTab } from "./tabs/RestoreTab"
import { CiCdTab } from "./tabs/CiCdTab"

type TabValue = "compose" | "logs" | "publish" | "restore" | "cicd"

/**
 * Aviso de adoção: quando o ambiente ainda não tem projeto Compose próprio, procura um projeto já em
 * execução no host (mesmo diretório e compose) e oferece adotá-lo — sem reiniciar containers. Com
 * mais de um candidato, pede a escolha explícita.
 */
function ComposeAdoptionNotice({ context, envId, projectId, env }: { context: AmbientesApi; envId: string; projectId: string; env: EnvironmentDto }) {
    const enabled = !env.composeProject && env.status.reachable
    const discover = useDiscoverCompose(context, envId, enabled)
    const adopt = useAdoptCompose(context, envId, projectId)
    const data = discover.data
    if (!enabled || !data || (!data.project && !data.ambiguous)) return null

    return (
        <Card className="border-amber-400/30 bg-amber-500/10">
            <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm text-amber-300">
                    <Plug className="h-4 w-4" aria-hidden />
                    Projeto Compose já em execução
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                {data.project ? (
                    <>
                        <p className="text-xs text-amber-200/90">
                            Encontrei o projeto <span className="font-mono">{data.project}</span> no host com o mesmo diretório e compose. Adotar passa a gerenciá-lo (status, logs, publicar e restaurar) sem reiniciar nada.
                        </p>
                        <Button size="sm" disabled={adopt.isPending} onClick={() => adopt.mutate(data.project!)}>
                            Adotar {data.project}
                        </Button>
                    </>
                ) : (
                    <>
                        <p className="text-xs text-amber-200/90">Há mais de um projeto candidato neste diretório. Escolha qual gerenciar:</p>
                        <div className="flex flex-wrap gap-2">
                            {data.candidates.map((candidate) => (
                                <Button key={candidate.project} size="sm" variant="outline" disabled={adopt.isPending} onClick={() => adopt.mutate(candidate.project)}>
                                    {candidate.project}
                                </Button>
                            ))}
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    )
}

/** Coluna direita: cabeçalho do ambiente (estado real + atalhos) e as abas. */
export function EnvironmentDetailPanel({
    context,
    basePath,
    projectId,
    envId,
    initialEnv,
}: {
    context: AmbientesApi
    basePath: string
    projectId: string
    envId: string
    initialEnv: EnvironmentDto | null
}) {
    const detail = useEnvironmentDetail(context, envId)
    const env = detail.data ?? initialEnv
    const [tab, setTab] = useState<TabValue>("compose")
    useEnvironmentOperationRealtime(context, envId)

    if (!env) {
        return <EmptyState icon={Boxes} title="Ambiente não encontrado" description="Selecione outro ambiente na lista." />
    }

    return (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="flex items-center gap-2 truncate text-lg font-semibold">
                        {env.name}
                        <EnvironmentStatusBadge env={env} />
                    </h2>
                    <p className="truncate text-xs text-muted-foreground">
                        {env.branch} · schema {env.appliedDbVersion ?? env.dbVersion ?? "desconhecido"} · porta {env.publishedPort ?? "—"}
                        {env.composeProject ? ` · projeto ${env.composeProject}` : ""}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => setTab("publish")}>
                        <Rocket className="mr-2 h-3.5 w-3.5" aria-hidden />
                        Publicar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setTab("restore")}>
                        <RotateCcw className="mr-2 h-3.5 w-3.5" aria-hidden />
                        Restaurar
                    </Button>
                    <Button asChild variant="outline" size="icon" className="h-8 w-8" aria-label="Configuração do ambiente">
                        <Link href={`${basePath}/${projectId}/ambiente/${envId}`}>
                            <Settings className="h-4 w-4" aria-hidden />
                        </Link>
                    </Button>
                </div>
            </div>

            {!env.status.reachable && env.status.error && (
                <p className="flex items-start gap-2 rounded-md border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-300">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span>Não foi possível consultar o host ({env.status.error}). O estado dos containers pode estar desatualizado.</span>
                </p>
            )}

            <ComposeAdoptionNotice context={context} envId={envId} projectId={projectId} env={env} />

            <Tabs value={tab} onValueChange={(value) => setTab(value as TabValue)} className="flex min-h-0 flex-1 flex-col">
                <TabsList>
                    <TabsTrigger value="compose">Compose</TabsTrigger>
                    <TabsTrigger value="logs">Logs</TabsTrigger>
                    <TabsTrigger value="publish">Publicar</TabsTrigger>
                    <TabsTrigger value="restore">Restaurar</TabsTrigger>
                    <TabsTrigger value="cicd">CI/CD</TabsTrigger>
                </TabsList>
                <AnimatePresence mode="wait">
                    <motion.div key={tab} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }} className="min-h-0 flex-1 pt-4">
                        <TabsContent value="compose">
                            <ComposeTab context={context} envId={envId} />
                        </TabsContent>
                        <TabsContent value="logs" className="h-full">
                            <LogsTab context={context} envId={envId} />
                        </TabsContent>
                        <TabsContent value="publish">
                            <PublishTab context={context} envId={envId} projectId={projectId} env={env} operation={env.lastOperation} />
                        </TabsContent>
                        <TabsContent value="restore">
                            <RestoreTab context={context} envId={envId} projectId={projectId} env={env} />
                        </TabsContent>
                        <TabsContent value="cicd">
                            <CiCdTab context={context} projectId={projectId} branch={env.branch} />
                        </TabsContent>
                    </motion.div>
                </AnimatePresence>
            </Tabs>
        </div>
    )
}
