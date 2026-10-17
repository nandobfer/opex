"use client"

import { Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { EnvironmentDto } from "../types"

/** Aba Compose: configuração efetiva observada no host (com overrides), com a importação manual. */
export function ComposeTab({ environment, inspecting, onInspect }: { environment: EnvironmentDto; inspecting: boolean; onInspect: () => void }) {
    return (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <Card>
                <CardHeader>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                            <CardTitle className="text-base">Serviços observados</CardTitle>
                            <CardDescription>
                                Configuração efetiva no host, incluindo overrides. Os valores das variáveis são omitidos — só os
                                nomes.
                            </CardDescription>
                        </div>
                        <Button
                            size="sm"
                            className="gap-1.5"
                            disabled={Boolean(environment.activeOperationId) || inspecting}
                            onClick={onInspect}
                        >
                            {inspecting ? (
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                            ) : (
                                <RefreshCw className="h-4 w-4" aria-hidden />
                            )}
                            Inspecionar / importar estado do host
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {!environment.compose.length ? (
                        <p className="text-sm text-muted-foreground">
                            Nenhum Compose observado ainda. Inspecione o host para carregar os serviços.
                        </p>
                    ) : (
                        <ul className="divide-y">
                            {environment.compose.map((service) => (
                                <li key={service.service} className="space-y-2 py-4 first:pt-0 last:pb-0">
                                    <h3 className="font-semibold">{service.service}</h3>
                                    <dl className="grid gap-1 text-sm sm:grid-cols-[8rem_1fr]">
                                        <dt className="text-muted-foreground">Imagem</dt>
                                        <dd className="break-all font-mono text-xs">{service.image || "—"}</dd>
                                        <dt className="text-muted-foreground">Portas</dt>
                                        <dd className="font-mono text-xs">{service.ports.join(", ") || "—"}</dd>
                                        <dt className="text-muted-foreground">Volumes</dt>
                                        <dd className="break-all font-mono text-xs">{service.volumes.join(", ") || "—"}</dd>
                                        <dt className="text-muted-foreground">Variáveis</dt>
                                        <dd className="break-all font-mono text-xs">{service.variables.join(", ") || "—"}</dd>
                                    </dl>
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
