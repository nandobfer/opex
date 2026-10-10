"use client"

import { useState } from "react"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { AnimatePresence, motion } from "framer-motion"
import { CheckCircle2, Loader2, PlugZap, Trash2, Workflow, XCircle } from "lucide-react"
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
import { DEV_CENTER_PATH } from "../../constants"
import { useDeleteCentral, useTestCentral } from "../../hooks/useAgentic"
import { useDevCenterCentral } from "../../hooks/useDevCenterCentral"
import type { CentralDto, CentralTestOutcome } from "../../types"

/** Testar a central (com o resultado de cada verificação), abrir na Central e excluir. */
export function CentralHeaderActions({ central, onDeleted }: { central: CentralDto; onDeleted: () => void }) {
    const test = useTestCentral(central.id)
    const remove = useDeleteCentral()
    const { setCentralId } = useDevCenterCentral()
    const [confirming, setConfirming] = useState(false)
    const [result, setResult] = useState<CentralTestOutcome | null>(null)
    const last = central.lastTest

    return (
        <div className="flex flex-col items-start gap-2 md:items-end">
            <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" className="gap-1.5" disabled={test.isPending} onClick={() => void test.mutateAsync().then(setResult).catch(() => undefined)}>
                    {test.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <PlugZap className="h-4 w-4" aria-hidden />}
                    Testar central
                </Button>
                <Button asChild variant="outline" className="gap-1.5">
                    <Link href={DEV_CENTER_PATH} onClick={() => setCentralId(central.id)}>
                        <Workflow className="h-4 w-4" aria-hidden /> Abrir na Central
                    </Link>
                </Button>
                <Button type="button" variant="ghost" size="icon" aria-label="Excluir central" onClick={() => setConfirming(true)}>
                    <Trash2 className="h-4 w-4 text-destructive" aria-hidden />
                </Button>
            </div>
            {last && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {last.ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" aria-hidden /> : <XCircle className="h-3.5 w-3.5 text-destructive" aria-hidden />}
                    {last.message} · {formatDistanceToNow(new Date(last.at), { addSuffix: true, locale: ptBR })}
                </p>
            )}
            <AnimatePresence>
                {result && (
                    <motion.ul initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="w-full max-w-md space-y-1 overflow-hidden rounded-lg border p-3 text-xs" aria-label="Resultado do teste">
                        {result.checks.map((check) => (
                            <li key={check.label} className="flex items-start gap-2">
                                <span className={check.status === "ok" ? "text-emerald-400" : check.status === "warn" ? "text-amber-300" : "text-destructive"}>{check.status === "ok" ? "✓" : check.status === "warn" ? "!" : "✕"}</span>
                                <span>
                                    <span className="font-medium">{check.label}:</span> <span className="text-muted-foreground">{check.detail}</span>
                                </span>
                            </li>
                        ))}
                        <li className="pt-1 text-right">
                            <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setResult(null)}>
                                Fechar
                            </button>
                        </li>
                    </motion.ul>
                )}
            </AnimatePresence>
            <AlertDialog open={confirming} onOpenChange={setConfirming}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Excluir a central {central.projectName}?</AlertDialogTitle>
                        <AlertDialogDescription>As mesas concluídas e a saída delas também são excluídas. Centrais com mesas em andamento não podem ser excluídas. O repositório e os worktrees não são tocados.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() =>
                                void remove
                                    .mutateAsync(central.id)
                                    .then(onDeleted)
                                    .catch(() => undefined)
                            }
                        >
                            Excluir
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
