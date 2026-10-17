"use client"

import Link from "next/link"
import { useUrlFilters, urlFilterCodecs } from "@/hooks/useUrlFilters"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { OptionTabs } from "@/components/ui/option-tabs"
import { useEnvironmentApi, useEnvironmentDetail, useEnvironmentOperation } from "../hooks/useEnvironments"
import { PublishRestoreTab } from "./PublishRestoreTab"
import { EnvironmentLogsTab } from "./EnvironmentLogsTab"
import { CiCdTab } from "./CiCdTab"

const tabs = [
    { value: "compose", label: "Compose" },
    { value: "logs", label: "Logs" },
    { value: "publish", label: "Publicar" },
    { value: "restore", label: "Restaurar" },
    { value: "ci", label: "CI/CD" },
] as const
type Tab = (typeof tabs)[number]["value"]
const defaultFilters = { abaAmbiente: "compose" as Tab }
const filterSchema = { abaAmbiente: urlFilterCodecs.string<Tab>(tabs.map((tab) => tab.value)) }
export function EnvironmentPanel({ repoId, envId }: { repoId: string; envId: string }) {
    const api = useEnvironmentApi()
    const query = useEnvironmentDetail(repoId, envId)
    const inspect = useEnvironmentOperation(repoId, envId)
    const [filters, setFilters] = useUrlFilters(defaultFilters, filterSchema)
    const tab = filters.abaAmbiente
    const setTab = (value: Tab) => setFilters((previous) => ({ ...previous, abaAmbiente: value }))
    const reduced = useReducedMotion()
    if (query.isLoading) return <Skeleton className="h-96 w-full" />
    if (!query.data || query.isError)
        return <ErrorState title="Falha ao carregar ambiente" onRetry={() => void query.refetch()} />
    const data = query.data
    return (
        <div className="flex min-w-0 flex-col gap-5">
            <header className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-xl font-semibold">{data.environment.name}</h2>
                    <p className="text-sm text-muted-foreground">
                        {data.environment.branch} · Banco registrado: {data.environment.dbVersion ?? "desconhecido"}
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button onClick={() => setTab("publish")}>Publicar</Button>
                    <Button variant="outline" onClick={() => setTab("restore")}>
                        Restaurar
                    </Button>
                    {data.canEdit && (
                        <Button variant="outline" size="icon" asChild>
                            <Link
                                href={`${api.href}/${repoId}/ambiente/${envId}`}
                                aria-label="Configurações do ambiente"
                            >
                                <Settings />
                            </Link>
                        </Button>
                    )}
                </div>
            </header>
            <OptionTabs<Tab> options={[...tabs]} value={tab} onChange={setTab} className="w-full" />
            {data.environment.activeOperationId && (
                <p role="status" className="rounded-md border bg-muted/30 p-3 text-sm">
                    Operação em andamento: {data.operations[0]?.stage ?? "Na fila"}. O acompanhamento continua após
                    fechar a tela.
                </p>
            )}
            <AnimatePresence mode="wait" initial={false}>
                <motion.div
                    key={tab}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: reduced ? 0 : 0.18 }}
                    className="min-w-0"
                >
                    {tab === "compose" && (
                        <div className="space-y-4">
                            <p className="text-sm text-muted-foreground">
                                Configuração efetiva observada no host, incluindo overrides. Valores de variáveis são
                                omitidos.
                            </p>
                            <Button
                                variant="outline"
                                disabled={Boolean(data.environment.activeOperationId) || inspect.isPending}
                                onClick={() =>
                                    inspect.mutate({
                                        kind: "inspect",
                                        method: "host",
                                        confirmation: true,
                                        riskConfirmed: false,
                                        expectedRevision: data.environment.revision,
                                        requestId: crypto.randomUUID(),
                                    })
                                }
                            >
                                Inspecionar / importar estado do host
                            </Button>
                            {!data.environment.compose.length && (
                                <p className="rounded-lg border border-dashed p-6 text-sm">
                                    Nenhum Compose observado. Inspecione o host para carregar os serviços.
                                </p>
                            )}
                            {data.environment.compose.map((service) => (
                                <article className="space-y-2 rounded-lg border p-4 text-sm" key={service.service}>
                                    <h3 className="font-semibold">{service.service}</h3>
                                    <p className="break-all">Imagem: {service.image}</p>
                                    <p>Portas: {service.ports.join(", ") || "—"}</p>
                                    <p className="break-all">Volumes: {service.volumes.join(", ") || "—"}</p>
                                    <p>Variáveis: {service.variables.join(", ") || "—"}</p>
                                </article>
                            ))}
                        </div>
                    )}
                    {tab === "logs" && (
                        <EnvironmentLogsTab
                            repoId={repoId}
                            envId={envId}
                            services={data.environment.compose.map((s) => s.service)}
                        />
                    )}
                    {(tab === "publish" || tab === "restore") && (
                        <PublishRestoreTab repoId={repoId} data={data} restore={tab === "restore"} />
                    )}
                    {tab === "ci" && <CiCdTab repoId={repoId} />}
                </motion.div>
            </AnimatePresence>
        </div>
    )
}
