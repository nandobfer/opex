"use client"

import { useRouter } from "next/navigation"
import { AnimatePresence, motion } from "framer-motion"
import { AlertTriangle, CheckCircle2, Loader2, Rocket, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { deployPath } from "../../constants"
import { useEnvironmentAction } from "../../hooks/useEnvironments"
import type { EnvironmentDto } from "../../types"

const NOTICE = "flex flex-col gap-3 rounded-lg border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
const noticeMotion = { initial: { opacity: 0, y: -6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -6 }, transition: { duration: 0.2 } }

/** "Salvo": as mudanças valem no próximo deploy, com o atalho Fazer deploy (abre a página do log). */
function SavedNotice({ env, onDismiss }: { env: EnvironmentDto; onDismiss: () => void }) {
    const router = useRouter()
    const action = useEnvironmentAction(env.id)
    const deploy = () => action.mutate({ action: "deploy" }, { onSuccess: (result) => result.deployId && router.push(deployPath(result.deployId)) })
    return (
        <motion.div {...noticeMotion} role="status" className={`${NOTICE} border-success/40`}>
            <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden /> Salvo. As mudanças valem no próximo deploy.
            </span>
            <span className="flex items-center gap-1">
                <Button type="button" size="sm" className="gap-1.5" disabled={action.isPending || env.lastDeploy?.status === "running"} onClick={deploy}>
                    {action.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Rocket className="h-4 w-4" aria-hidden />} Fazer deploy
                </Button>
                <Button type="button" variant="ghost" size="icon" aria-label="Fechar o aviso" onClick={onDismiss}>
                    <X className="h-4 w-4" aria-hidden />
                </Button>
            </span>
        </motion.div>
    )
}

/** Aviso de alteração feita em outro lugar e o de salvo, animados no topo do formulário. */
export function EditorNotices({
    env,
    changedElsewhere,
    onReload,
    onKeep,
    savedAt,
    onDismissSaved,
}: {
    env: EnvironmentDto | null
    changedElsewhere: boolean
    onReload: () => void
    onKeep: () => void
    savedAt: number | null
    onDismissSaved: () => void
}) {
    return (
        <AnimatePresence initial={false}>
            {env && changedElsewhere && (
                <motion.div key="elsewhere" {...noticeMotion} role="alert" className={`${NOTICE} border-warning/50`}>
                    <span className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden /> Este ambiente foi alterado em outro lugar enquanto você editava.
                    </span>
                    <span className="flex items-center gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={onReload}>
                            Recarregar
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={onKeep}>
                            Manter o que estou editando
                        </Button>
                    </span>
                </motion.div>
            )}
            {env && savedAt !== null && !changedElsewhere && <SavedNotice key={`saved-${savedAt}`} env={env} onDismiss={onDismissSaved} />}
        </AnimatePresence>
    )
}
