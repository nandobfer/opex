"use client"

import { Cpu } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { usePluginKernel } from "../hooks/usePlugins"

/** Runtime do plugin no kernel (só o dono): fibers ativas e o que elas registraram. */
export function PluginRuntimeCard({ pluginId }: { pluginId: string }) {
    const kernel = usePluginKernel()
    const data = kernel.data
    const fibers = data?.fibers.filter((fiber) => fiber.pluginId === pluginId) ?? []
    const tools = data?.tools.filter((item) => item.pluginId === pluginId) ?? []
    const routes = data?.routes.filter((item) => item.pluginId === pluginId) ?? []
    const crons = data?.crons.filter((item) => item.pluginId === pluginId) ?? []
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <Cpu className="h-4 w-4" aria-hidden /> Runtime no servidor
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
                {kernel.isPending ? (
                    <Skeleton className="h-16 w-full" />
                ) : !data ? (
                    <p className="text-muted-foreground">Não foi possível ler o kernel de plugins.</p>
                ) : (
                    <>
                        {data.mode === "preview-instance" && <p className="text-xs text-warning">Instância de prévia: código de servidor dos plugins desligado.</p>}
                        {!fibers.length ? (
                            <p className="text-muted-foreground">Sem código de servidor ativo.</p>
                        ) : (
                            fibers.map((fiber) => (
                                <p key={fiber.channel} className="text-xs text-muted-foreground">
                                    <span className="font-medium text-foreground">{fiber.channel === "preview" ? "Prévia" : "Estável"}</span> · {fiber.effects.length} efeito(s){fiber.warning ? ` · ${fiber.warning}` : ""}
                                </p>
                            ))
                        )}
                        {tools.length > 0 && <p className="text-xs text-muted-foreground">Ferramentas: {tools.map((item) => `${item.name}${item.channel === "preview" ? " (prévia)" : ""}`).join(", ")}</p>}
                        {routes.length > 0 && <p className="text-xs text-muted-foreground">Rotas: {routes.map((item) => `${item.method} /api/p/${pluginId}${item.path}`).join(", ")}</p>}
                        {crons.length > 0 && <p className="text-xs text-muted-foreground">Crons: {crons.map((item) => `${item.name}${item.scheduled ? "" : " (não agenda)"}`).join(", ")}</p>}
                    </>
                )}
            </CardContent>
        </Card>
    )
}
