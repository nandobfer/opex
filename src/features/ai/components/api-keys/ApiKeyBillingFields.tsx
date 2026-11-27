"use client"

import { Controller, type Control, type FieldErrors } from "react-hook-form"
import { DatePicker } from "@/components/ui/date-picker"
import { Field } from "@/components/ui/field"
import { FORM_GRID } from "@/components/ui/form-grid"
import { MoneyInput } from "@/components/ui/money-input"
import { FormNumberInput } from "@/components/ui/number-field"
import { OptionTabs } from "@/components/ui/option-tabs"
import { AI_BILLING_CURRENCIES, type AiBillingCurrency, type AiKeyBilling } from "@/features/ai-billing/schemas"

/** Campos de cada modalidade do plano de cobrança (OPE-203). Os erros vêm do mesmo schema Zod da API. */

type Errors = FieldErrors<Record<string, unknown>>
const errorOf = (errors: Errors, name: string) => (errors[name]?.message as string | undefined) ?? undefined
const CURRENCY_OPTIONS = AI_BILLING_CURRENCIES.map((value) => ({ value, label: value === "USD" ? "US$ (dólar)" : "R$ (real)" }))
const Hint = ({ children }: { children: string }) => <p className="text-xs text-muted-foreground">{children}</p>
const prefixOf = (currency: AiBillingCurrency) => (currency === "USD" ? "US$" : "R$")

function CurrencyTabs({ control, name, id }: { control: Control<AiKeyBilling>; name: "currency" | "paidCurrency"; id: string }) {
    return <Controller control={control} name={name as never} render={({ field }) => <OptionTabs id={id} options={CURRENCY_OPTIONS} value={(field.value as AiBillingCurrency) ?? "USD"} onChange={field.onChange} size="sm" />} />
}

function DateField({ control, name, id, label, error, hint }: { control: Control<AiKeyBilling>; name: "startsAt" | "expiresAt" | "exhaustedAt"; id: string; label: string; error?: string; hint?: string }) {
    return (
        <Field id={id} label={label} error={error}>
            <Controller control={control} name={name as never} render={({ field }) => <DatePicker id={id} value={(field.value as string | null) ?? ""} onChange={(value) => field.onChange(value || null)} placeholder="Sem data" />} />
            {hint ? <Hint>{hint}</Hint> : null}
        </Field>
    )
}

export function SubscriptionFields({ control, errors, currency }: { control: Control<AiKeyBilling>; errors: Errors; currency: AiBillingCurrency }) {
    return (
        <div className={FORM_GRID}>
            <Field id="billing-currency" label="Moeda *">
                <CurrencyTabs control={control} name="currency" id="billing-currency" />
            </Field>
            <Field id="billing-amount" label="Mensalidade *" error={errorOf(errors, "amount")}>
                <Controller control={control} name={"amount" as never} render={({ field }) => <MoneyInput id="billing-amount" prefix={prefixOf(currency)} value={field.value as number} onChange={field.onChange} />} />
            </Field>
            <Field id="billing-renewal" label="Dia de renovação *" error={errorOf(errors, "renewalDay")}>
                <FormNumberInput control={control} name={"renewalDay" as never} id="billing-renewal" min={1} max={31} />
                <Hint>Dia do mês em que a assinatura renova (31 vira o último dia nos meses mais curtos)</Hint>
            </Field>
            <Field id="billing-iof" label="IOF/spread (%)" error={errorOf(errors, "iofPercent")}>
                <FormNumberInput control={control} name={"iofPercent" as never} id="billing-iof" nullable step={0.01} min={0} max={100} placeholder="Sem IOF" />
                <Hint>Opcional: somado à mensalidade (ex.: cartão em reais numa assinatura em dólar)</Hint>
            </Field>
        </div>
    )
}

export function CreditsFields({ control, errors, paidCurrency }: { control: Control<AiKeyBilling>; errors: Errors; paidCurrency: AiBillingCurrency }) {
    return (
        <div className={FORM_GRID}>
            <Field id="billing-face" label="Valor de face (US$) *" error={errorOf(errors, "faceValueUsd")}>
                <Controller control={control} name={"faceValueUsd" as never} render={({ field }) => <MoneyInput id="billing-face" prefix="US$" value={field.value as number} onChange={field.onChange} />} />
            </Field>
            <Field id="billing-paid-currency" label="Moeda do pagamento *">
                <CurrencyTabs control={control} name="paidCurrency" id="billing-paid-currency" />
            </Field>
            <Field id="billing-paid" label="Valor pago *" error={errorOf(errors, "paidAmount")}>
                <Controller control={control} name={"paidAmount" as never} render={({ field }) => <MoneyInput id="billing-paid" prefix={prefixOf(paidCurrency)} value={field.value as number} onChange={field.onChange} />} />
                <Hint>0 quando os créditos foram concedidos</Hint>
            </Field>
            <DateField control={control} name="startsAt" id="billing-starts" label="Início" hint="Vazio = a data em que o plano foi salvo" error={errorOf(errors, "startsAt")} />
            <DateField control={control} name="expiresAt" id="billing-expires" label="Validade" hint="Depois dela, as chamadas usam o custo de tabela" error={errorOf(errors, "expiresAt")} />
            <DateField control={control} name="exhaustedAt" id="billing-exhausted" label="Esgotado em" hint="Opcional: registre quando o uso fora do Opex esgotou os créditos" error={errorOf(errors, "exhaustedAt")} />
        </div>
    )
}
