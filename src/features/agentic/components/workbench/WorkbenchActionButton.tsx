"use client"

import { CheckCheck, GitFork, Hammer, MessageSquareWarning, PlugZap, RefreshCw, RotateCcw, Square, X, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TooltipIconButton } from "@/components/ui/tooltip-icon-button"
import type { ActionItemId, WorkbenchActionItem } from "../../workbench-action-items"
import { ReconnectButton } from "./ReconnectButton"

/** Ícone de cada botão da barra (desktop, dock e folha do celular). */
export const ACTION_ICONS: Partial<Record<ActionItemId, LucideIcon>> = {
    fork: GitFork,
    "revise-plan": MessageSquareWarning,
    "request-correction": MessageSquareWarning,
    "submit-pr-feedback": MessageSquareWarning,
    reopen: RotateCcw,
    implement: Hammer,
    approve: CheckCheck,
    reconnect: PlugZap,
    retry: RefreshCw,
    "cancel-wait": X,
    interrupt: Square,
}

/** Botão de ícone da barra: mesma altura dos botões `size="sm"`. */
export const ICON_BUTTON = "h-8 min-w-8 px-2"

/** Botões das etapas na linha do desktop (abaixo de `lg` a linha vira o dock do celular, OPE-166). */
export const ACTION_BUTTON = "gap-1.5"

/** Um botão da linha de ações do desktop, a partir do descritor (`workbenchActionItems`). */
export function WorkbenchActionButton({ item, reconnecting, onSelect }: { item: WorkbenchActionItem; reconnecting: boolean; onSelect: (item: WorkbenchActionItem) => void }) {
    const Icon = ACTION_ICONS[item.id] ?? MessageSquareWarning
    if (item.kind === "reconnect") return <ReconnectButton reconnecting={reconnecting} className={ACTION_BUTTON} onClick={() => onSelect(item)} />
    if (item.iconOnly)
        return (
            <TooltipIconButton label={item.label} tooltip={item.hint ?? item.label} disabledReason={item.disabledReason} className={ICON_BUTTON} onClick={() => onSelect(item)}>
                <Icon aria-hidden />
            </TooltipIconButton>
        )
    return (
        <Button
            type="button"
            variant={item.variant}
            size="sm"
            className={ACTION_BUTTON}
            disabled={item.disabledReason !== null}
            title={item.title ?? undefined}
            aria-label={item.ariaLabel ? item.label : undefined}
            data-ctrl-enter-submit={item.ctrlEnter || undefined}
            onClick={() => onSelect(item)}
        >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {item.label}
        </Button>
    )
}
