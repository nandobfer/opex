"use client"

import { AlertTriangle, Container, Layers } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { EmptyState } from "@/components/feedback/EmptyState"
import { useEnvironmentCompose, type AmbientesApi } from "../../hooks"

/** Aba Compose: lê o `docker-compose` pela API do GitHub e apresenta os serviços. */
export function ComposeTab({ context, envId }: { context: AmbientesApi; envId: string }) {
    const query = useEnvironmentCompose(context, envId, true)

    if (query.isLoading) {
        return (
            <div className="space-y-3">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
            </div>
        )
    }
    if (query.isError) {
        return <ErrorState title="Não foi possível ler o compose" description="Confira o token do GitHub e o arquivo configurado no ambiente." onRetry={() => void query.refetch()} />
    }
    const data = query.data
    if (!data || data.summary.services.length === 0) {
        return <EmptyState icon={Layers} title="Nenhum serviço no compose" description="O arquivo não declarou serviços ou está vazio." />
    }

    return (
        <div className="space-y-4">
            {data.conflicts.length > 0 && (
                <div className="flex gap-2 rounded-md border border-amber-400/30 bg-amber-500/10 p-3 text-xs text-amber-300">
                    <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                    <div className="space-y-1">
                        <p className="font-semibold">Avisos de isolamento</p>
                        {data.conflicts.map((conflict) => (
                            <p key={conflict}>{conflict}</p>
                        ))}
                    </div>
                </div>
            )}
            <p className="text-xs text-muted-foreground">
                Arquivo <span className="font-mono">{data.summary.file}</span> · volumes: {data.summary.volumes.length || "—"} · redes: {data.summary.networks.join(", ") || "—"}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
                {data.summary.services.map((service) => (
                    <Card key={service.name}>
                        <CardHeader className="pb-2">
                            <CardTitle className="flex items-center gap-2 text-sm">
                                <Container className="h-4 w-4 text-primary" aria-hidden />
                                {service.name}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-xs">
                            <p>
                                <span className="text-muted-foreground">Imagem:</span> <span className="font-mono">{service.image ?? "—"}</span>
                            </p>
                            {service.build && (
                                <p>
                                    <span className="text-muted-foreground">Build:</span> <span className="font-mono">{service.build}</span>
                                </p>
                            )}
                            {service.ports.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                    {service.ports.map((port) => (
                                        <Badge key={port} variant="outline" className="font-mono">
                                            {port}
                                        </Badge>
                                    ))}
                                </div>
                            )}
                            {service.environment.length > 0 && (
                                <p className="break-words">
                                    <span className="text-muted-foreground">Variáveis:</span> {service.environment.join(", ")}
                                </p>
                            )}
                            {service.volumes.length > 0 && (
                                <p className="break-words">
                                    <span className="text-muted-foreground">Volumes:</span> {service.volumes.join(", ")}
                                </p>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    )
}
