"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Lock } from "lucide-react"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { FORK_MODE_LABELS, FORK_MODES, type ForkMode } from "../../constants"
import { forkModeBlockReason } from "../../fork-logic"
import type { ForkDto } from "../../types"

interface ForkModeSelectProps {
    fork: ForkDto
    disabled?: boolean
    onChange: (mode: ForkMode) => void
    onLock: () => void
}

const OPTIONS = FORK_MODES.map((mode) => ({ value: mode, label: FORK_MODE_LABELS[mode].label, title: `${FORK_MODE_LABELS[mode].label}: ${FORK_MODE_LABELS[mode].description}` }))
const FADE = { initial: { opacity: 0, scale: 0.96 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.96 }, transition: { duration: 0.16 } }

/**
 * Modo do fork na barra inferior: **Plan** (somente leitura) ou **Build** (pode alterar arquivos), trocável
 * só com o agente parado e valendo a partir da próxima mensagem, e **Travar** como somente leitura (com
 * confirmação, sem volta). Travado, mostra apenas o selo "Somente leitura".
 */
export function ForkModeSelect({ fork, disabled = false, onChange, onLock }: ForkModeSelectProps) {
    const [confirmLock, setConfirmLock] = useState(false)
    const blocked = forkModeBlockReason(fork.status, fork.runState, fork.readOnly)
    const inactive = disabled || blocked !== null
    const labelId = `fork-mode-${fork.id}`

    return (
        <TooltipProvider delayDuration={200}>
            <AnimatePresence mode="wait" initial={false}>
                {fork.readOnly ? (
                    <motion.span key="locked" {...FADE} className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs text-muted-foreground" data-testid="fork-mode-locked">
                        <Lock className="h-3.5 w-3.5" aria-hidden /> Somente leitura (travado)
                    </motion.span>
                ) : (
                    <motion.div key="modes" {...FADE} className="flex items-center gap-1.5">
                        <span id={labelId} className="text-xs text-muted-foreground">
                            Modo
                        </span>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span>
                                    <OptionTabs aria-labelledby={labelId} size="xs" options={OPTIONS} value={fork.mode} disabled={inactive} onChange={(mode) => mode !== fork.mode && onChange(mode)} />
                                </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs text-xs">{blocked ?? FORK_MODE_LABELS[fork.mode].description}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span>
                                    <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" disabled={inactive} onClick={() => setConfirmLock(true)}>
                                        <Lock className="h-3.5 w-3.5" aria-hidden /> Travar
                                    </Button>
                                </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs text-xs">{blocked ?? "Travar como somente leitura (sem volta)"}</TooltipContent>
                        </Tooltip>
                    </motion.div>
                )}
            </AnimatePresence>

            <AlertDialog open={confirmLock} onOpenChange={setConfirmLock}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Travar o Fork {fork.number} como somente leitura?</AlertDialogTitle>
                        <AlertDialogDescription>O fork passa para Plan e não poderá mais voltar para Build. Esta ação não pode ser desfeita.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                setConfirmLock(false)
                                onLock()
                            }}
                        >
                            Travar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </TooltipProvider>
    )
}
