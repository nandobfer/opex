"use client"

import { useState } from "react"
import { DatabaseZap, History, RotateCcw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { EmptyState } from "@/components/feedback/EmptyState"
import { InDevelopment } from "@/components/feedback/InDevelopment"
import { cn } from "@/lib/utils"
import { checkRestoreCompatibility } from "../../logic"
import { useEnvironmentImages, useRestore, type AmbientesApi } from "../../hooks"
import type { EnvironmentDto } from "../../types"

function formatDate(iso: string | null): string {
    if (!iso) return "—"
    const date = new Date(iso)
    return Number.isNaN(date.getTime()) ? "—" : `${date.toLocaleDateString("pt-BR")} ${date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
}

/** Aba Restaurar: lista imagens e bloqueia incompatíveis com a versão do banco. */
export function RestoreTab({ context, envId, projectId, env }: { context: AmbientesApi; envId: string; projectId: string; env: EnvironmentDto }) {
    const images = useEnvironmentImages(context, envId, true)
    const restore = useRestore(context, envId, projectId)
    const [selected, setSelected] = useState<string | null>(null)
    const [confirmed, setConfirmed] = useState(false)

    if (images.isLoading) return <Skeleton className="h-40 w-full" />
    if (images.isError) return <ErrorState title="Não foi possível listar as imagens" description="Confira o host do ambiente." onRetry={() => void images.refetch()} />
    const list = images.data ?? []
    if (list.length === 0) return <EmptyState icon={History} title="Nenhuma imagem disponível" description="Publique uma versão para criar a primeira imagem." />

    const target = list.find((image) => image.id === selected) ?? null
    const compatibility = target
        ? checkRestoreCompatibility({ currentVersion: env.dbVersion, imageVersion: target.dbVersion, origin: target.origin, confirmUnverified: confirmed })
        : null

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                    Versão atual do banco: <span className="font-mono">{env.dbVersion ?? "desconhecida"}</span>
                </p>
            </div>
            <div className="space-y-2">
                {list.map((image) => {
                    const check = checkRestoreCompatibility({ currentVersion: env.dbVersion, imageVersion: image.dbVersion, origin: image.origin, confirmUnverified: true })
                    const blocked = check.level === "blocked"
                    return (
                        <button
                            key={image.id}
                            type="button"
                            onClick={() => {
                                setSelected(image.id)
                                setConfirmed(false)
                            }}
                            disabled={blocked}
                            className={cn(
                                "flex w-full items-center justify-between gap-3 rounded-md border p-3 text-left transition-colors",
                                selected === image.id ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50",
                                blocked && "cursor-not-allowed opacity-60",
                            )}
                        >
                            <div className="min-w-0">
                                <p className="truncate font-mono text-sm">{image.tag ?? image.id.slice(0, 20)}</p>
                                <p className="text-xs text-muted-foreground">
                                    {formatDate(image.builtAt)} · banco {image.dbVersion ?? "desconhecido"} · {image.origin}
                                </p>
                            </div>
                            {blocked ? <Badge variant="destructive">Incompatível</Badge> : check.level === "compatible" ? <Badge variant="success">Compatível</Badge> : <Badge variant="warning">Confirmar</Badge>}
                        </button>
                    )
                })}
            </div>

            {compatibility?.level === "blocked" && (
                <Card className="border-destructive/40">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm text-destructive">Restauração bloqueada</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <p className="text-xs text-muted-foreground">{compatibility.message}</p>
                        <InDevelopment title="Restaurar banco" dependency="A restauração do banco será adicionada em uma próxima entrega." />
                    </CardContent>
                </Card>
            )}

            {target && compatibility && compatibility.level !== "blocked" && (
                <div className="space-y-3">
                    {compatibility.requiresConfirmation && (
                        <label className="flex items-start gap-2 text-xs text-amber-300">
                            <Checkbox checked={confirmed} onCheckedChange={(value) => setConfirmed(value === true)} />
                            <span>{compatibility.message}</span>
                        </label>
                    )}
                    <Button
                        onClick={() => restore.mutate({ imageId: target.id, confirmUnverified: confirmed })}
                        disabled={restore.isPending || (compatibility.requiresConfirmation && !confirmed)}
                    >
                        <RotateCcw className="mr-2 h-4 w-4" aria-hidden />
                        Restaurar esta imagem
                    </Button>
                </div>
            )}

            <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <DatabaseZap className="h-3.5 w-3.5" aria-hidden />
                A compatibilidade exige a mesma versão do banco; imagens sem versão conhecida pedem confirmação.
            </p>
        </div>
    )
}
