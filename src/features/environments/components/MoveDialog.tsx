"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { OptionTabs } from "@/components/ui/option-tabs"
import { useEnvironmentAction } from "../hooks/useEnvironments"
import type { Machine } from "../schemas"
import type { EnvironmentDto } from "../types"
import { machineOptions, moveWarning } from "../view"

/** Mover: troca a máquina de build e/ou de execução e implanta de novo. */
interface MoveDialogProps {
    env: EnvironmentDto | null
    pcAvailable: boolean
    pcReason: string | null
    onClose: () => void
    onStarted: (deployId: string, title: string) => void
}

export function MoveDialog(props: MoveDialogProps) {
    // Remonta por ambiente: as escolhas começam no build/execução salvos.
    return <MoveDialogContent key={props.env?.id ?? "none"} {...props} />
}

function MoveDialogContent({ env, pcAvailable, pcReason, onClose, onStarted }: MoveDialogProps) {
    const [buildOn, setBuildOn] = useState<Machine>(env?.buildOn ?? "server")
    const [runOn, setRunOn] = useState<Machine>(env?.runOn ?? "server")
    const action = useEnvironmentAction(env?.id ?? "")
    const options = machineOptions(pcAvailable, pcReason)
    const warning = env ? moveWarning(env, runOn) : null
    const unchanged = env ? env.buildOn === buildOn && env.runOn === runOn && (env.deployedOn?.runOn ?? runOn) === runOn : true
    return (
        <Dialog open={env !== null} onOpenChange={(open) => !open && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Mover {env?.name}</DialogTitle>
                    <DialogDescription>Escolha onde fazer o build e onde executar. Máquinas diferentes passam as imagens pelo registry do servidor.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <Label>Build em</Label>
                        <OptionTabs<Machine> aria-label="Build em" options={options} value={buildOn} onChange={setBuildOn} className="w-full" />
                    </div>
                    <div className="space-y-1.5">
                        <Label>Executar em</Label>
                        <OptionTabs<Machine> aria-label="Executar em" options={options} value={runOn} onChange={setRunOn} className="w-full" />
                    </div>
                    <AnimatePresence initial={false}>
                        {warning && (
                            <motion.p key="warning" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="flex gap-2 overflow-hidden text-sm text-warning">
                                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {warning}
                            </motion.p>
                        )}
                    </AnimatePresence>
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button
                        type="button"
                        disabled={!env || unchanged || action.isPending}
                        onClick={() =>
                            env &&
                            action.mutate(
                                { action: "move", buildOn, runOn },
                                {
                                    onSuccess: (result) => {
                                        if (result.deployId) onStarted(result.deployId, env.name)
                                        onClose()
                                    },
                                },
                            )
                        }
                    >
                        Mover e implantar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
