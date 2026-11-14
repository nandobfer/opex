"use client"

import { useState } from "react"
import { AnimatePresence } from "framer-motion"
import { GitFork, Loader2, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ForkMode } from "../../../constants"
import { isOpenFork } from "../../../fork-logic"
import type { ForkDto, WorkbenchDto } from "../../../types"
import { ForkModelSettings } from "../ForkModelSettings"
import { ForkModeSelect } from "../ForkModeSelect"
import { ActionSheet, ActionSheetItem, ActionSheetSection } from "./ActionSheet"
import { DOCK_PRIMARY_BUTTON, MobileActionDock } from "./MobileActionDock"

/** Botão da barra do fork (desktop e celular leem a mesma lista). */
export interface ForkButton {
    key: string
    label: string
    icon: LucideIcon
    variant: "default" | "outline"
    disabled: boolean
    title?: string | null
    destructive?: boolean
    ctrlEnter?: boolean
    /** Envio em andamento (troca o ícone por um indicador). */
    spinning?: boolean
    onSelect: () => void
}

/**
 * Barra do fork abaixo de `lg` (OPE-166): o botão principal (o primeiro de destaque: Enviar, Tentar
 * novamente ou Integrar) no dock e o restante — Abrir fork, Pausar, Parar, Retomar, Descartar, o Modo e os
 * Modelos — na folha "Mais ações".
 */
export function ForkMobileBar({ fork, workbench, buttons, canFork, pending, onFork, onMode, onLock }: { fork: ForkDto; workbench?: WorkbenchDto; buttons: readonly ForkButton[]; canFork: boolean; pending: boolean; onFork: () => void; onMode: (mode: ForkMode) => void; onLock: () => void }) {
    const [open, setOpen] = useState(false)
    const primary = buttons.find((button) => button.variant === "default") ?? null
    const secondary = buttons.filter((button) => button !== primary)
    const primaryNode = primary ? (
        <Button type="button" variant={primary.variant} className={DOCK_PRIMARY_BUTTON} disabled={primary.disabled} title={primary.title ?? undefined} data-ctrl-enter-submit={primary.ctrlEnter || undefined} onClick={primary.onSelect}>
            {primary.spinning ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <primary.icon className="h-4 w-4" aria-hidden />}
            <span className="truncate">{primary.label}</span>
        </Button>
    ) : null
    const busy = pending ? "Aguarde a ação em andamento" : null
    return (
        <>
            <AnimatePresence initial={false}>
                <MobileActionDock key="dock" primary={primaryNode} blockedReason={primary?.disabled ? (primary.title ?? busy) : null} onMore={() => setOpen(true)} />
            </AnimatePresence>
            <ActionSheet open={open} onOpenChange={setOpen} title={`Fork ${fork.number}`} testId="fork-more-sheet">
                {(canFork || secondary.length > 0) && (
                    <ActionSheetSection title="Ações do fork">
                        {canFork && <ActionSheetItem icon={GitFork} label="Abrir fork" hint="Abre um fork a partir deste fork" disabledReason={busy} onSelect={onFork} />}
                        {secondary.map((button) => (
                            <ActionSheetItem key={button.key} icon={button.icon} label={button.label} destructive={button.destructive} disabledReason={button.disabled ? (button.title ?? busy ?? "Indisponível agora") : null} onSelect={button.onSelect} />
                        ))}
                    </ActionSheetSection>
                )}
                {isOpenFork(fork.status) && (
                    <ActionSheetSection title="Modo e modelo">
                        <div className="flex flex-wrap items-center gap-2">
                            <ForkModeSelect fork={fork} disabled={pending} onChange={onMode} onLock={onLock} />
                            {workbench && <ForkModelSettings workbench={workbench} fork={fork} buttonClassName="h-11 min-w-11" />}
                        </div>
                    </ActionSheetSection>
                )}
            </ActionSheet>
        </>
    )
}
