"use client"

import { AnimatePresence, motion } from "framer-motion"
import { GitFork, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useForksDonePrompt } from "../../hooks/useForks"
import type { WorkbenchDto } from "../../types"

/** Pergunta da mesa concluída com forks em aberto (política "Sempre perguntar" da central). */
export function ForksDonePrompt({ workbench }: { workbench: WorkbenchDto }) {
    const mutation = useForksDonePrompt(workbench)
    const prompt = workbench.forksDonePrompt
    return (
        <AnimatePresence initial={false}>
            {prompt && (
                <motion.div key="forks-done" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden border-t bg-amber-500/5">
                    <div className="flex flex-wrap items-center gap-3 p-3" role="alert">
                        <p className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                            <GitFork className="h-4 w-4 shrink-0 text-amber-200" aria-hidden />A mesa foi concluída com {prompt.count} fork(s) em aberto. Concluir os forks também?
                        </p>
                        <div className="flex gap-2">
                            <Button type="button" variant="outline" size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate("keep")}>
                                Manter forks
                            </Button>
                            <Button type="button" size="sm" className="gap-1.5" disabled={mutation.isPending} onClick={() => mutation.mutate("conclude")}>
                                {mutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />} Concluir forks
                            </Button>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
