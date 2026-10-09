"use client"

import { useState } from "react"
import { ExternalLink, MessageCircleQuestion } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Textarea } from "@/components/ui/textarea"
import { useReplyForm } from "../../hooks/useAgentic"
import type { OpencodeFormDto, OpencodeFormFieldDto, WorkbenchDto } from "../../types"

type Answer = Record<string, string | number | boolean | string[]>

function initialAnswer(form: OpencodeFormDto): Answer {
    const answer: Answer = {}
    for (const field of form.fields) {
        if (field.defaultValue !== null) answer[field.key] = field.defaultValue
        else if (field.type === "boolean") answer[field.key] = false
        else if (field.type === "multiselect") answer[field.key] = []
    }
    return answer
}

/** Pergunta do agente (formulário do OpenCode) com resposta ou dispensa. */
export function AgentFormCard({ workbench, form }: { workbench: WorkbenchDto; form: OpencodeFormDto }) {
    const reply = useReplyForm(workbench)
    const [answer, setAnswer] = useState<Answer>(() => initialAnswer(form))
    const missing = form.fields.some((field) => field.required && field.type !== "external" && (answer[field.key] === undefined || answer[field.key] === "" || (Array.isArray(answer[field.key]) && (answer[field.key] as string[]).length === 0)))
    const set = (key: string, value: Answer[string]) => setAnswer((current) => ({ ...current, [key]: value }))

    return (
        <div className="space-y-3 rounded-lg border border-amber-500/40 bg-background p-3" role="alertdialog" aria-label="Pergunta do agente">
            <p className="flex items-center gap-2 text-sm font-medium">
                <MessageCircleQuestion className="h-4 w-4 text-amber-300" aria-hidden /> {form.title}
            </p>
            {form.fields.map((field) => (
                <FieldInput key={field.key} id={`form-${form.id}-${field.key}`} field={field} value={answer[field.key]} onChange={(value) => set(field.key, value)} />
            ))}
            <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" size="sm" variant="outline" disabled={reply.isPending} onClick={() => reply.mutate({ formId: form.id, cancel: true })}>
                    Dispensar
                </Button>
                <Button type="button" size="sm" disabled={reply.isPending || missing} onClick={() => reply.mutate({ formId: form.id, answer })}>
                    Responder
                </Button>
            </div>
        </div>
    )
}

function FieldInput({ id, field, value, onChange }: { id: string; field: OpencodeFormFieldDto; value: Answer[string] | undefined; onChange: (value: Answer[string]) => void }) {
    const label = (
        <Label htmlFor={id} className="text-xs">
            {field.title ?? field.key}
            {field.required && <span className="text-destructive"> *</span>}
        </Label>
    )
    const help = field.description && <p className="text-xs text-muted-foreground">{field.description}</p>
    if (field.type === "external") {
        return (
            <div className="space-y-1">
                {label}
                {help}
                {field.url && (
                    <a href={field.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        Abrir <ExternalLink className="h-3 w-3" aria-hidden />
                    </a>
                )}
            </div>
        )
    }
    if (field.type === "boolean") {
        return (
            <label htmlFor={id} className="flex items-start gap-2 text-sm">
                <Checkbox id={id} checked={value === true} onCheckedChange={(checked) => onChange(checked === true)} />
                <span>
                    {field.title ?? field.key}
                    {help}
                </span>
            </label>
        )
    }
    if (field.type === "multiselect") {
        const selected = Array.isArray(value) ? value : []
        return (
            <fieldset className="space-y-1.5">
                <legend className="text-xs font-medium">{field.title ?? field.key}</legend>
                {help}
                {field.options.map((option) => (
                    <label key={option.value} className="flex items-center gap-2 text-sm">
                        <Checkbox checked={selected.includes(option.value)} onCheckedChange={(checked) => onChange(checked === true ? [...selected, option.value] : selected.filter((item) => item !== option.value))} />
                        {option.label}
                    </label>
                ))}
            </fieldset>
        )
    }
    if (field.type === "string" && field.options.length > 0 && field.options.length <= 5 && !field.custom) {
        return (
            <div className="space-y-1">
                {label}
                {help}
                <OptionTabs<string> id={id} options={field.options.map((option) => ({ value: option.value, label: option.label }))} value={typeof value === "string" ? value : ""} onChange={onChange} className="w-full" />
            </div>
        )
    }
    const numeric = field.type === "number" || field.type === "integer"
    return (
        <div className="space-y-1">
            {label}
            {help}
            {field.options.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {field.options.map((option) => (
                        <Button key={option.value} type="button" size="sm" variant={value === option.value ? "default" : "outline"} className="h-7 text-xs" onClick={() => onChange(option.value)}>
                            {option.label}
                        </Button>
                    ))}
                </div>
            )}
            {numeric ? (
                <Input id={id} type="number" step={field.type === "integer" ? 1 : "any"} value={typeof value === "number" ? value : ""} onChange={(event) => onChange(event.target.value === "" ? "" : Number(event.target.value))} placeholder={field.placeholder ?? undefined} />
            ) : (
                <Textarea id={id} rows={2} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} placeholder={field.placeholder ?? "Sua resposta"} />
            )}
        </div>
    )
}
