"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { AnimatePresence } from "framer-motion"
import { CheckCircle2, Eye, Sparkles } from "lucide-react"
import { ActiveItemRow } from "@/components/list/ActiveItemRow"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { taskPathOrId } from "@/features/tasks/constants"
import { useApprovePluginPreview, useGeneratePluginVersionSummary, useRollbackPlugin, useTogglePluginPreview } from "../hooks/usePlugins"
import type { PluginDetailDto, PluginVersionSummaryDto } from "../types"
import { PluginVersionBadge } from "./PluginBadges"

/** Só uma versão já consolidada (estável ou arquivada) pode voltar a ser a versão em uso. */
export const canUseVersion = (version: PluginVersionSummaryDto, stableId: string | null) => Boolean(version.promotedAt) && version.id !== stableId

/**
 * Versões do plugin (OPE-172), no componente "um item em uso" das contas do OpenCode e das chaves de IA:
 * a estável é a "Em uso"; clicar numa versão consolidada a põe em uso para todos (rollback, com
 * confirmação). A versão em prévia não é clicável — chega a "Em uso" pelo fluxo da mesa — e traz
 * "Ver prévia" (liga a prévia neste navegador e abre a tela) e "Aprovar prévia".
 */
export function PluginVersionsCard({ plugin, showTaskLinks, canGenerateSummary }: { plugin: PluginDetailDto; showTaskLinks: boolean; canGenerateSummary: boolean }) {
    const router = useRouter()
    const rollback = useRollbackPlugin(plugin.id)
    const approve = useApprovePluginPreview(plugin.id)
    const preview = useTogglePluginPreview(plugin.id)
    const summary = useGeneratePluginVersionSummary(plugin.id)
    const [target, setTarget] = useState<PluginVersionSummaryDto | null>(null)
    const stableId = plugin.stable?.id ?? null

    const openPreview = async (version: PluginVersionSummaryDto) => {
        await preview.mutateAsync(true)
        router.push(version.previewPath)
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Versões</CardTitle>
            </CardHeader>
            <CardContent>
                <ul className="space-y-2" data-testid="plugin-versions">
                    <AnimatePresence initial={false}>
                        {plugin.versions.map((version) => {
                            const isPreview = plugin.preview?.id === version.id
                            const generating = summary.isPending && summary.variables === version.id
                            return (
                                <ActiveItemRow
                                    key={version.id}
                                    label={`v${version.number}`}
                                    active={version.id === stableId}
                                    activatable={canUseVersion(version, stableId)}
                                    activateLabel={`Usar a versão v${version.number}`}
                                    activateDisabled={rollback.isPending}
                                    onActivate={() => setTarget(version)}
                                    badges={version.id === stableId ? null : <PluginVersionBadge state={version.state} number={version.number} />}
                                    sublabel={<VersionSublabel version={version} showTaskLinks={showTaskLinks} />}
                                    actions={
                                        canGenerateSummary && !version.changeSummary ? (
                                            <Button type="button" size="sm" variant="ghost" className="h-8 gap-1.5" disabled={generating} onClick={() => summary.mutate(version.id)}>
                                                <Sparkles className="h-3.5 w-3.5" aria-hidden />
                                                {generating ? "Gerando…" : "Gerar descritivo"}
                                            </Button>
                                        ) : null
                                    }
                                >
                                    <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground" data-testid={`plugin-version-summary-${version.number}`}>
                                        {version.changeSummary ?? "Sem descritivo desta mudança"}
                                    </p>
                                    {isPreview && (
                                        <div className="pointer-events-auto mt-2 flex flex-wrap items-center gap-2">
                                            <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5" disabled={preview.isPending} onClick={() => void openPreview(version)}>
                                                <Eye className="h-3.5 w-3.5" aria-hidden />
                                                Ver prévia
                                            </Button>
                                            {plugin.previewWorkbenchId && (
                                                <Button type="button" size="sm" className="h-8 gap-1.5" disabled={approve.isPending} onClick={() => approve.mutate()}>
                                                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                                                    Aprovar prévia
                                                </Button>
                                            )}
                                        </div>
                                    )}
                                </ActiveItemRow>
                            )
                        })}
                    </AnimatePresence>
                </ul>
            </CardContent>
            <ConfirmDialog
                open={target !== null}
                onOpenChange={(open) => !open && setTarget(null)}
                title={`Usar a versão v${target?.number ?? ""}?`}
                description="A versão escolhida passa a ser a versão em uso para todos e as telas abertas trocam na hora. A atual fica arquivada e pode voltar depois."
                confirmLabel="Usar esta versão"
                variant="destructive"
                pending={rollback.isPending}
                onConfirm={() => target && rollback.mutate(target.id, { onSettled: () => setTarget(null) })}
            />
        </Card>
    )
}

function VersionSublabel({ version, showTaskLinks }: { version: PluginVersionSummaryDto; showTaskLinks: boolean }) {
    return (
        <>
            {format(new Date(version.createdAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
            {version.source.taskCode && (
                <>
                    {" · "}
                    {showTaskLinks && version.source.taskId ? (
                        <Link href={taskPathOrId(version.source.taskCode, version.source.taskId)} className="pointer-events-auto relative z-10 font-mono text-primary hover:underline">
                            {version.source.taskCode}
                        </Link>
                    ) : (
                        <span className="font-mono">{version.source.taskCode}</span>
                    )}
                </>
            )}
            {` · ${version.tests.length} teste(s)`}
            {version.hasServer ? " · servidor" : ""}
            {version.hasClient ? " · interface" : ""}
        </>
    )
}
