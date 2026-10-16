"use client"

import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { requestPrReviewSchema, type RequestPrReviewInput } from "../schemas"
import { useRequestPrReview } from "../hooks/usePrReview"

/** "Revisar PR": revisa agora um PR de um repositório de central, pela URL. */
export function RequestPrReviewDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
    const request = useRequestPrReview()
    const form = useForm<RequestPrReviewInput>({ resolver: zodResolver(requestPrReviewSchema), mode: "onChange", defaultValues: { url: "" } })

    useEffect(() => {
        if (!open) form.reset({ url: "" })
    }, [open, form])

    // Sem <form>: o diálogo fica dentro do formulário da página (o submit subiria pelo portal).
    const submit = form.handleSubmit(async ({ url }) => {
        const queued = await request.mutateAsync(url).catch(() => null)
        if (queued) onOpenChange(false)
    })

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Revisar PR</DialogTitle>
                    <DialogDescription>O PR precisa ser de um repositório vinculado a uma central de desenvolvimento. A revisão entra na fila e roda com a configuração desta aba.</DialogDescription>
                </DialogHeader>
                <Field id="pr-review-url" label="URL do PR" error={form.formState.errors.url?.message}>
                    <Input
                        id="pr-review-url"
                        placeholder="https://github.com/org/repo/pull/12"
                        autoFocus
                        {...form.register("url")}
                        onKeyDown={(event) => {
                            if (event.key !== "Enter") return
                            event.preventDefault()
                            event.stopPropagation()
                            void submit()
                        }}
                    />
                </Field>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        Cancelar
                    </Button>
                    <Button type="button" className="gap-1.5" disabled={request.isPending || !form.formState.isValid} onClick={() => void submit()}>
                        {request.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
                        Revisar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
