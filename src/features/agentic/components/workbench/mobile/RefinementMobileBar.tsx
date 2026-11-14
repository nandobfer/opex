"use client"

import { useState } from "react"
import { AnimatePresence } from "framer-motion"
import type { LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { StatusNotice } from "../../../workbench-notices"
import type { CentralDto, WorkbenchDto } from "../../../types"
import { PlanAfterRefinementSwitch } from "../PlanAfterRefinementSwitch"
import { ReconnectButton } from "../ReconnectButton"
import { WorkbenchManageDialogs, WorkbenchManageItems, type ManageDialog } from "../WorkbenchManage"
import { WorkbenchModelSettings } from "../WorkbenchModelSettings"
import { StatusNoticeLine } from "../WorkbenchStatusNotices"
import { ActionSheet, ActionSheetItem, ActionSheetSection } from "./ActionSheet"
import { DOCK_PRIMARY_BUTTON, MobileActionDock } from "./MobileActionDock"

/** Botão da barra do refinamento (desktop e celular leem a mesma lista). */
export interface RefinementButton {
    key: string
    label: string
    icon: LucideIcon
    variant: "default" | "outline"
    /** Motivo do bloqueio (`null` = disponível); no celular aparece em texto na folha. */
    disabledReason: string | null
    /** `title` do botão no desktop (ex.: refinamento indisponível). */
    title?: string | null
    hint?: string
    /** Botão principal do dock do celular. */
    primary?: boolean
    reconnect?: boolean
    ctrlEnter?: boolean
    onSelect: () => void
}

/**
 * Barra da mesa no refinamento abaixo de `lg` (OPE-166): avisos numa linha, dock com o botão principal e a
 * folha "Mais ações" (demais botões, modelo, "Gerar plano após refinar" e os itens da mesa). As perguntas do
 * Agente Refinador continuam abaixo da saída: elas são a própria conversa do refinamento.
 */
export function RefinementMobileBar({ workbench, central, buttons, notices, reconnecting }: { workbench: WorkbenchDto; central: CentralDto | null; buttons: readonly RefinementButton[]; notices: readonly StatusNotice[]; reconnecting: boolean }) {
    const [open, setOpen] = useState(false)
    const [manage, setManage] = useState<ManageDialog | null>(null)
    const primary = buttons.find((button) => button.primary) ?? null
    const secondary = buttons.filter((button) => button !== primary)
    const primaryNode = !primary ? null : primary.reconnect ? (
        <ReconnectButton reconnecting={reconnecting} variant="default" size="default" className={DOCK_PRIMARY_BUTTON} onClick={primary.onSelect} />
    ) : (
        <Button type="button" variant={primary.variant} className={DOCK_PRIMARY_BUTTON} disabled={primary.disabledReason !== null} title={primary.disabledReason ?? undefined} data-ctrl-enter-submit={primary.ctrlEnter || undefined} onClick={primary.onSelect}>
            <primary.icon className="h-4 w-4" aria-hidden />
            <span className="truncate">{primary.label}</span>
        </Button>
    )
    return (
        <>
            <StatusNoticeLine notices={notices} />
            <AnimatePresence initial={false}>
                <MobileActionDock key="dock" primary={primaryNode} blockedReason={primary && !primary.reconnect ? primary.disabledReason : null} onMore={() => setOpen(true)} />
            </AnimatePresence>
            <ActionSheet open={open} onOpenChange={setOpen} title="Mais ações" testId="workbench-more-sheet">
                {secondary.length > 0 && (
                    <ActionSheetSection title="Ações da etapa">
                        {secondary.map((button) => (
                            <ActionSheetItem key={button.key} icon={button.icon} label={button.label} hint={button.hint} disabledReason={button.disabledReason} onSelect={button.onSelect} />
                        ))}
                    </ActionSheetSection>
                )}
                {workbench.stage === "refining" && (
                    <ActionSheetSection title="Refinamento">
                        <PlanAfterRefinementSwitch workbench={workbench} layout="sheet" />
                    </ActionSheetSection>
                )}
                {workbench.models && (
                    <ActionSheetSection title="Modelo">
                        <WorkbenchModelSettings workbench={workbench} buttonClassName="h-11 min-w-11" />
                    </ActionSheetSection>
                )}
                <WorkbenchManageItems workbench={workbench} canDelete={central !== null} onPick={setManage} />
            </ActionSheet>
            <WorkbenchManageDialogs workbench={workbench} central={central} dialog={manage} onClose={() => setManage(null)} />
        </>
    )
}
