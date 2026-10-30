"use client"

import { useState } from "react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Archive, History } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { RefreshButton } from "@/components/ui/refresh-button"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { VirtualizedRows } from "@/components/list/VirtualizedRows"
import { apiErrorMessage } from "@/lib/api"
import { useOpencodeBackups, useRestoreOpencodeBackup } from "@/features/opencode-resources/hooks/useOpencodeResources"
import type { OpencodeBackupDto } from "@/features/opencode-resources/types"

const formatSize = (size: number | null) => (size === null ? "" : size < 1024 ? `${size} B` : `${(size / 1024).toFixed(1)} KB`)

/** Backups automáticos da configuração (antes de cada alteração), com restauração confirmada. */
export function BackupsCard() {
    const backups = useOpencodeBackups()
    const restore = useRestoreOpencodeBackup()
    const [target, setTarget] = useState<OpencodeBackupDto | null>(null)
    const rows = backups.data ?? []
    return (
        <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <div className="space-y-1.5">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Archive className="h-4 w-4 text-primary" aria-hidden /> Backups da configuração
                    </CardTitle>
                    <CardDescription>Feitos no host antes de cada alteração (skills, agentes, comandos, plugins e MCPs); os 50 mais recentes ficam guardados.</CardDescription>
                </div>
                <RefreshButton onClick={() => void backups.refetch()} fetching={backups.isFetching} />
            </CardHeader>
            <CardContent>
                {backups.isLoading ? (
                    <Skeleton className="h-32 w-full" />
                ) : backups.isError ? (
                    <ErrorState title="Não foi possível listar os backups" description={apiErrorMessage(backups.error, "Confira se o OpenCode está no ar.")} onRetry={() => void backups.refetch()} />
                ) : rows.length === 0 ? (
                    <EmptyState icon={Archive} title="Nenhum backup ainda" description="O primeiro é criado na próxima alteração de um recurso." />
                ) : (
                    <div className="rounded-md border" role="list" aria-label="Backups">
                        <VirtualizedRows
                            rows={rows}
                            rowKey={(row) => row.id}
                            estimateSize={56}
                            rowClassName="border-b last:border-b-0"
                            renderRow={(row) => (
                                <div className="flex items-center gap-3 px-4 py-2.5">
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm text-foreground">{row.label}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {format(new Date(row.createdAt), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })} · {row.paths.length} caminho(s) {formatSize(row.size)}
                                        </p>
                                    </div>
                                    <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => setTarget(row)}>
                                        <History className="h-4 w-4" aria-hidden /> Restaurar
                                    </Button>
                                </div>
                            )}
                        />
                    </div>
                )}
            </CardContent>
            <ConfirmDialog
                open={target !== null}
                onOpenChange={(open) => !open && !restore.isPending && setTarget(null)}
                title="Restaurar este backup?"
                description="Os arquivos voltam ao estado de antes desta alteração (o estado atual é guardado em um backup novo)."
                items={target?.paths}
                confirmLabel="Restaurar"
                variant="destructive"
                pending={restore.isPending}
                onConfirm={() => target && restore.mutate(target.id, { onSettled: () => setTarget(null) })}
            />
        </Card>
    )
}
