"use client"

import { useState } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { FileDiff, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { taskPathOrId } from "@/features/tasks/constants"
import { useRollbackPlugin } from "../hooks/usePlugins"
import type { PluginDetailDto, PluginVersionSummaryDto } from "../types"
import { PluginVersionBadge } from "./PluginBadges"

/** Versões do plugin: estado, origem (tarefa), testes e as ações de diff e rollback. */
export function PluginVersionsCard({ plugin, selectedId, onSelect, showTaskLinks }: { plugin: PluginDetailDto; selectedId: string | null; onSelect: (id: string) => void; showTaskLinks: boolean }) {
    const rollback = useRollbackPlugin(plugin.id)
    const [target, setTarget] = useState<PluginVersionSummaryDto | null>(null)
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Versões</CardTitle>
            </CardHeader>
            <CardContent>
                <ul className="divide-y">
                    {plugin.versions.map((version) => {
                        const canRollback = Boolean(version.promotedAt) && version.id !== plugin.stable?.id
                        return (
                            <li key={version.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center" data-testid={`plugin-version-${version.number}`}>
                                <div className="min-w-0 flex-1 space-y-0.5">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <PluginVersionBadge state={version.state} number={version.number} />
                                        {version.source.taskCode &&
                                            (showTaskLinks && version.source.taskId ? (
                                                <Link href={taskPathOrId(version.source.taskCode, version.source.taskId)} className="font-mono text-xs text-primary hover:underline">
                                                    {version.source.taskCode}
                                                </Link>
                                            ) : (
                                                <span className="font-mono text-xs text-muted-foreground">{version.source.taskCode}</span>
                                            ))}
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        {format(new Date(version.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })} · {version.tests.length} teste(s){version.hasServer ? " · servidor" : ""}
                                        {version.hasClient ? " · interface" : ""}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button type="button" size="sm" variant={selectedId === version.id ? "secondary" : "ghost"} onClick={() => onSelect(version.id)}>
                                        <FileDiff className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                                        Diferença
                                    </Button>
                                    {canRollback && (
                                        <Button type="button" size="sm" variant="outline" onClick={() => setTarget(version)} disabled={rollback.isPending}>
                                            <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                                            Rollback
                                        </Button>
                                    )}
                                </div>
                            </li>
                        )
                    })}
                </ul>
            </CardContent>
            <ConfirmDialog
                open={target !== null}
                onOpenChange={(open) => !open && setTarget(null)}
                title={`Voltar para a versão ${target?.number ?? ""}?`}
                description="A versão escolhida volta a ser a estável e as telas abertas trocam na hora. A estável atual fica arquivada e pode voltar depois."
                confirmLabel="Fazer rollback"
                variant="destructive"
                pending={rollback.isPending}
                onConfirm={() => target && rollback.mutate(target.id, { onSettled: () => setTarget(null) })}
            />
        </Card>
    )
}
