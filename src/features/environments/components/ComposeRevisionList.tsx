"use client"

import { useState } from "react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { AnimatePresence, motion } from "framer-motion"
import { Eye, RotateCcw } from "lucide-react"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { authorLabel, formatComposeSize } from "../managed-compose"
import type { ComposeRevisionSummaryDto } from "../types"

interface Props {
    revisions: ComposeRevisionSummaryDto[]
    currentVersion: number | null
    deployedVersion: number | null
    viewing: number | null
    restoring: boolean
    onView: (version: number) => void
    onRestore: (version: number) => void
}

export const formatRevisionDate = (iso: string) => format(new Date(iso), "dd/MM/yyyy HH:mm", { locale: ptBR })

/** Histórico das revisões do compose gerenciado: Ver (só leitura) e Restaurar (cria uma revisão nova). */
export function ComposeRevisionList({ revisions, currentVersion, deployedVersion, viewing, restoring, onView, onRestore }: Props) {
    const [confirm, setConfirm] = useState<number | null>(null)
    return (
        <div className="space-y-2">
            <h3 className="text-xs font-semibold">Revisões</h3>
            <ul className="max-h-56 divide-y overflow-y-auto rounded-md border">
                <AnimatePresence initial={false}>
                    {revisions.map((revision) => (
                        <motion.li key={revision.version} layout="position" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
                            <span className="font-mono font-semibold">v{revision.version}</span>
                            {revision.version === currentVersion && <Badge variant="secondary">Vigente</Badge>}
                            {revision.version === deployedVersion && <Badge variant="outline">Implantada</Badge>}
                            <span className="text-muted-foreground">
                                {formatRevisionDate(revision.createdAt)} · {authorLabel(revision.authorId)} · {formatComposeSize(revision.size)}
                                {revision.note ? ` · ${revision.note}` : ""}
                            </span>
                            <div className="ml-auto flex items-center gap-1">
                                <Button type="button" size="sm" variant={viewing === revision.version ? "secondary" : "ghost"} className="h-7 gap-1 px-2" onClick={() => onView(revision.version)}>
                                    <Eye className="h-3.5 w-3.5" aria-hidden /> Ver
                                </Button>
                                {revision.version !== currentVersion && (
                                    <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 px-2" disabled={restoring} onClick={() => setConfirm(revision.version)}>
                                        <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Restaurar
                                    </Button>
                                )}
                            </div>
                        </motion.li>
                    ))}
                </AnimatePresence>
            </ul>
            <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Restaurar a v{confirm}?</AlertDialogTitle>
                        <AlertDialogDescription>Uma revisão nova é criada com o conteúdo da v{confirm}; o histórico continua inteiro. Ela vale a partir do próximo deploy.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (confirm !== null) onRestore(confirm)
                                setConfirm(null)
                            }}
                        >
                            Restaurar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
