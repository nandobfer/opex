"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence } from "framer-motion"
import { ExternalLink, GitPullRequest, MessageSquareWarning, ShieldAlert, ShieldQuestion } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AdversarialActions } from "@/features/adversarial-agent/components/workbench/AdversarialActions"
import { dockLayout, requestsLabel, type WorkbenchActionItem } from "../../../workbench-action-items"
import type { StatusNotice } from "../../../workbench-notices"
import type { CentralDto, WorkbenchDto } from "../../../types"
import { pendingRequestCount, PendingRequestCards } from "../PendingRequests"
import { PreviewSwitch, previewSwitchVisible } from "../PreviewSwitch"
import { ReconnectButton } from "../ReconnectButton"
import { ACTION_ICONS } from "../WorkbenchActionButton"
import { WorkbenchManageDialogs, WorkbenchManageItems, type ManageDialog } from "../WorkbenchManage"
import { WorkbenchModelSettings } from "../WorkbenchModelSettings"
import { StatusNoticeLine } from "../WorkbenchStatusNotices"
import { ActionSheet, ActionSheetItem, ActionSheetSection } from "./ActionSheet"
import { DOCK_PRIMARY_BUTTON, MobileActionDock } from "./MobileActionDock"

type SheetKind = "more" | "requests" | "adversarial"

interface WorkbenchMobileBarProps {
    workbench: WorkbenchDto
    central: CentralDto | null
    items: readonly WorkbenchActionItem[]
    notices: readonly StatusNotice[]
    /** Campo de correção ou de fork aberto: o dock some (o campo tem os próprios botões), como no desktop. */
    editing: boolean
    reconnecting: boolean
    /** Bloqueio do adversário (Corrigir / Revisar de novo / Seguir) e revisão que falhou (Seguir mesmo assim). */
    adversarialBlocked: boolean
    adversarialAvailable: boolean
    rebuildAvailable: boolean
    actionPending: boolean
    onRebuild: () => void
    onSelect: (item: WorkbenchActionItem) => void
}

/**
 * Barra da mesa no celular (`< lg`, OPE-166): avisos numa linha, dock com a ação principal e as folhas
 * "Mais ações", "Pedidos do agente" e "Revisão adversária". Os pedidos ficam aqui (e não abaixo da
 * saída): a folha abre sozinha quando chega um pedido novo.
 */
export function WorkbenchMobileBar({ workbench, central, items, notices, editing, reconnecting, adversarialBlocked, adversarialAvailable, rebuildAvailable, actionPending, onRebuild, onSelect }: WorkbenchMobileBarProps) {
    const [sheet, setSheet] = useState<SheetKind | null>(null)
    const [manage, setManage] = useState<ManageDialog | null>(null)
    const requestCount = pendingRequestCount(workbench)
    const layout = dockLayout({ items, requestCount, adversarialBlocked })

    // Pedido novo (permissão ou pergunta) é bloqueante: a folha abre sozinha; sem pedidos, ela fecha.
    const previousCount = useRef(requestCount)
    useEffect(() => {
        if (requestCount > previousCount.current) setSheet("requests")
        previousCount.current = requestCount
    }, [requestCount])
    const open = sheet === "requests" && requestCount === 0 ? null : sheet === "adversarial" && !adversarialAvailable ? null : sheet
    // Fechar uma folha só limpa o estado se ela ainda é a aberta (um item pode ter aberto outra no mesmo clique).
    const closeIf = (kind: SheetKind) => (next: boolean) => !next && setSheet((current) => (current === kind ? null : current))

    const primary = layout.primary
    const primaryNode =
        primary?.type === "requests" ? (
            <Button type="button" className={DOCK_PRIMARY_BUTTON} onClick={() => setSheet("requests")}>
                <ShieldQuestion className="h-4 w-4" aria-hidden /> {requestsLabel(primary.count)}
            </Button>
        ) : primary?.type === "adversarial" ? (
            <Button type="button" className={DOCK_PRIMARY_BUTTON} onClick={() => setSheet("adversarial")}>
                <ShieldAlert className="h-4 w-4" aria-hidden /> Decidir revisão
            </Button>
        ) : primary?.type === "item" ? (
            <DockPrimaryButton item={primary.item} reconnecting={reconnecting} onSelect={onSelect} />
        ) : null

    return (
        <>
            <StatusNoticeLine notices={notices} />
            <AnimatePresence initial={false}>{!editing && <MobileActionDock key="dock" primary={primaryNode} blockedReason={primary?.type === "item" ? primary.item.disabledReason : null} onMore={() => setSheet("more")} />}</AnimatePresence>

            <ActionSheet open={open === "more"} onOpenChange={closeIf("more")} title="Mais ações" testId="workbench-more-sheet">
                {(layout.secondary.length > 0 || (adversarialAvailable && !adversarialBlocked)) && (
                    <ActionSheetSection title="Ações da etapa">
                        {layout.secondary.map((item) => (
                            <ActionSheetItem key={item.id} icon={ACTION_ICONS[item.id] ?? MessageSquareWarning} label={item.label} hint={item.hint} disabledReason={item.disabledReason} onSelect={() => onSelect(item)} />
                        ))}
                        {adversarialAvailable && !adversarialBlocked && <ActionSheetItem icon={ShieldAlert} label="Revisão adversária" hint="Seguir sem a revisão que falhou" onSelect={() => setSheet("adversarial")} />}
                    </ActionSheetSection>
                )}
                {(workbench.previewUrl || workbench.pr || previewSwitchVisible(workbench.stage, workbench)) && (
                    <ActionSheetSection title="Prévia e PR">
                        {workbench.previewUrl && <ActionSheetItem icon={ExternalLink} label="Abrir prévia" hint="Abre em nova guia" href={workbench.previewUrl} />}
                        {workbench.pr && <ActionSheetItem icon={GitPullRequest} label={`Abrir PR #${workbench.pr.number}`} hint="Abre em nova guia" href={workbench.pr.url} />}
                        <PreviewSwitch workbench={workbench} rebuildAvailable={rebuildAvailable} actionPending={actionPending} onRebuild={onRebuild} layout="sheet" />
                    </ActionSheetSection>
                )}
                {workbench.models && (
                    <ActionSheetSection title="Modelo">
                        <WorkbenchModelSettings workbench={workbench} buttonClassName="h-11 min-w-11" />
                    </ActionSheetSection>
                )}
                <WorkbenchManageItems workbench={workbench} canDelete={central !== null} onPick={setManage} />
            </ActionSheet>

            <ActionSheet open={open === "requests"} onOpenChange={closeIf("requests")} title="Pedidos do agente" description="O agente está esperando a sua resposta para continuar." testId="workbench-requests-sheet">
                <div className="space-y-3">
                    <PendingRequestCards workbench={workbench} />
                </div>
            </ActionSheet>

            <ActionSheet open={open === "adversarial"} onOpenChange={closeIf("adversarial")} title="Revisão adversária" testId="workbench-adversarial-sheet">
                <AdversarialActions workbench={workbench} />
            </ActionSheet>

            <WorkbenchManageDialogs workbench={workbench} central={central} dialog={manage} onClose={() => setManage(null)} />
        </>
    )
}

/** Botão principal do dock a partir do descritor (o mesmo da barra do desktop). */
function DockPrimaryButton({ item, reconnecting, onSelect }: { item: WorkbenchActionItem; reconnecting: boolean; onSelect: (item: WorkbenchActionItem) => void }) {
    if (item.kind === "reconnect") return <ReconnectButton reconnecting={reconnecting} variant="default" size="default" className={DOCK_PRIMARY_BUTTON} onClick={() => onSelect(item)} />
    const Icon = ACTION_ICONS[item.id] ?? MessageSquareWarning
    return (
        <Button
            type="button"
            variant={item.variant}
            className={DOCK_PRIMARY_BUTTON}
            disabled={item.disabledReason !== null}
            title={item.disabledReason ?? undefined}
            aria-label={item.label}
            data-ctrl-enter-submit={item.ctrlEnter || undefined}
            onClick={() => onSelect(item)}
        >
            <Icon className="h-4 w-4" aria-hidden />
            <span className="truncate">{item.label}</span>
        </Button>
    )
}
