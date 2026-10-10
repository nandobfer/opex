"use client"

import { Check, Loader2, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"

/** Card de largura total para ajustar (correção) ou aprovar a prévia. */
export function CorrectionCard({
    value,
    onChange,
    onCorrect,
    onApprove,
    correcting,
    approving,
    disabled,
}: {
    value: string
    onChange: (value: string) => void
    onCorrect: () => void
    onApprove: () => void
    correcting: boolean
    approving: boolean
    disabled: boolean
}) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Ajustar ou aprovar</CardTitle>
                <CardDescription>Descreva o que mudar na prévia, ou aprove para criar a tarefa.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3" data-ctrl-enter-scope>
                <Textarea rows={4} placeholder="Ex.: O prazo está alto; é só ajustar o texto do rodapé." value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} />
                <div className="flex flex-wrap justify-end gap-2">
                    <Button type="button" data-ctrl-enter-submit variant="secondary" className="gap-1.5" onClick={onCorrect} disabled={disabled || !value.trim()}>
                        {correcting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />} Solicitar correção
                    </Button>
                    <Button type="button" className="gap-1.5" onClick={onApprove} disabled={approving}>
                        {approving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />} Aprovar tarefa
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
