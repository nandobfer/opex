"use client"

import { useEffect } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { AnimatePresence, motion } from "framer-motion"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { OptionTabs } from "@/components/ui/option-tabs"
import { AI_BILLING_MODE_LABELS, AI_BILLING_MODES, aiKeyBillingSchema, type AiBillingMode, type AiKeyBilling } from "@/features/ai-billing/schemas"
import type { AiApiKeyDto, AiApiKeyProviderId } from "../../api-keys"
import { useUpdateAiKeyBilling } from "../../hooks/useAiApiKeys"
import { CreditsFields, SubscriptionFields } from "./ApiKeyBillingFields"

const MODE_OPTIONS = AI_BILLING_MODES.map((value) => ({ value, label: AI_BILLING_MODE_LABELS[value] }))

const MODE_HELP: Record<AiBillingMode, string> = {
    usage: "O custo efetivo é o custo de tabela de cada chamada.",
    subscription: "A mensalidade é rateada por dia e dividida pelo uso total da assinatura no dia (o uso fora do Opex também consome o plano). Chaves da mesma conta contam a mensalidade uma vez.",
    credits: "O custo efetivo é o custo de tabela × (valor pago ÷ valor de face). Fora da validade ou com os créditos esgotados, vale o custo de tabela.",
}

/** Valores iniciais de cada modalidade (mantém o plano salvo quando a modalidade é a mesma). */
export function billingDefaults(mode: AiBillingMode, current: AiKeyBilling | null): AiKeyBilling {
    if (current?.mode === mode) return current
    if (mode === "subscription") return { mode, amount: 10, currency: "USD", renewalDay: new Date().getDate(), iofPercent: null }
    if (mode === "credits") return { mode, faceValueUsd: 100, paidAmount: 0, paidCurrency: "USD", startsAt: null, expiresAt: null, exhaustedAt: null }
    return { mode: "usage" }
}

/**
 * Plano de cobrança da chave (OPE-203): Pago por uso, Assinatura ou Créditos. Sem `<form>` (o diálogo é filho do
 * formulário da página); o envio é por botão. Trocar o plano recalcula o custo efetivo; o custo de tabela não muda.
 */
export function ApiKeyBillingDialog({ provider, target, open, onOpenChange }: { provider: AiApiKeyProviderId; target: AiApiKeyDto | null; open: boolean; onOpenChange: (open: boolean) => void }) {
    const save = useUpdateAiKeyBilling(provider)
    const form = useForm<AiKeyBilling>({ resolver: zodResolver(aiKeyBillingSchema), mode: "onChange", defaultValues: target?.billing ?? { mode: "usage" } })
    const values = useWatch({ control: form.control }) as AiKeyBilling
    const errors = form.formState.errors as Record<string, { message?: string }>

    useEffect(() => {
        if (open) form.reset(target?.billing ?? { mode: "usage" })
    }, [open, target, form])

    const changeMode = (mode: AiBillingMode) => form.reset(billingDefaults(mode, target?.billing ?? null), { keepDefaultValues: true })

    const submit = form.handleSubmit(async (billing) => {
        if (!target) return
        const done = await save.mutateAsync({ id: target.id, billing }).then(() => true, () => false)
        if (done) onOpenChange(false)
    })

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>Plano de cobrança{target ? ` — ${target.name}` : ""}</DialogTitle>
                    <DialogDescription>Define o custo efetivo das chamadas que esta chave atender (agentes rotineiros com motor Opex).</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <OptionTabs id="billing-mode" options={MODE_OPTIONS} value={values.mode} onChange={changeMode} className="w-full" />
                    <AnimatePresence mode="wait" initial={false}>
                        <motion.div key={values.mode} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} className="space-y-4">
                            <p className="text-sm text-muted-foreground">{MODE_HELP[values.mode]}</p>
                            {values.mode === "subscription" ? <SubscriptionFields control={form.control} errors={errors} currency={values.currency ?? "USD"} /> : null}
                            {values.mode === "credits" ? <CreditsFields control={form.control} errors={errors} paidCurrency={values.paidCurrency ?? "USD"} /> : null}
                        </motion.div>
                    </AnimatePresence>
                </div>
                <DialogFooter>
                    <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={save.isPending}>
                        Cancelar
                    </Button>
                    <Button type="button" className="gap-1.5" disabled={save.isPending || !target} onClick={() => void submit()}>
                        {save.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                        Salvar plano
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
