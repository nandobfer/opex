"use client"

import { useState } from "react"
import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import { Boxes, Rocket, RotateCcw, Settings } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/feedback/EmptyState"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useEnvironmentDetail, useEnvironmentOperationRealtime, type AmbientesApi } from "../hooks"
import type { EnvironmentDto } from "../types"
import { ComposeTab } from "./tabs/ComposeTab"
import { LogsTab } from "./tabs/LogsTab"
import { PublishTab } from "./tabs/PublishTab"
import { RestoreTab } from "./tabs/RestoreTab"
import { CiCdTab } from "./tabs/CiCdTab"

type TabValue = "compose" | "logs" | "publish" | "restore" | "cicd"

/** Coluna direita: cabeçalho do ambiente (atalhos Publicar/Restaurar + config) e as abas. */
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
        <div className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="flex items-center gap-2 truncate text-lg font-semibold">
                        {env.name}
                        {env.status.running ? <Badge variant="success">No ar</Badge> : <Badge variant="secondary">Parado</Badge>}
                    </h2>
                    <p className="truncate text-xs text-muted-foreground">
                        {env.branch} · banco {env.dbVersion ?? "desconhecido"} · porta {env.publishedPort ?? "—"}
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

            <Tabs value={tab} onValueChange={(value) => setTab(value as TabValue)}>
                <TabsList>
                    <TabsTrigger value="compose">Compose</TabsTrigger>
                    <TabsTrigger value="logs">Logs</TabsTrigger>
                    <TabsTrigger value="publish">Publicar</TabsTrigger>
                    <TabsTrigger value="restore">Restaurar</TabsTrigger>
                    <TabsTrigger value="cicd">CI/CD</TabsTrigger>
                </TabsList>
                <AnimatePresence mode="wait">
                    <motion.div key={tab} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }} className="pt-4">
                        <TabsContent value="compose">
                            <ComposeTab context={context} envId={envId} />
                        </TabsContent>
                        <TabsContent value="logs">
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
