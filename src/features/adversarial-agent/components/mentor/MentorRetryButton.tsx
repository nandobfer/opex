"use client"

import { useState } from "react"
import { Loader2, RotateCcw } from "lucide-react"
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { useRetryMentorRun } from "../../hooks/useMentor"

/** "Tentar novamente" o aprendizado que falhou, com confirmação (uma nova execução tem custo). */
export function MentorRetryButton({ runId }: { runId: string }) {
    const retry = useRetryMentorRun()
    const [confirm, setConfirm] = useState(false)
    return (
        <>
            <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={retry.isPending} onClick={() => setConfirm(true)}>
                {retry.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RotateCcw className="h-3.5 w-3.5" aria-hidden />} Tentar novamente
            </Button>
            <AlertDialog open={confirm} onOpenChange={setConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Aprender com esta mesa de novo?</AlertDialogTitle>
                        <AlertDialogDescription>O Mentor lê a transcrição outra vez, com a configuração atual, e consome o orçamento de uma nova execução. As memórias já gravadas pela tentativa anterior continuam e são consideradas.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Voltar</AlertDialogCancel>
                        <Button
                            onClick={() => {
                                setConfirm(false)
                                retry.mutate(runId)
                            }}
                        >
                            Tentar novamente
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}
