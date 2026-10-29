"use client"

import { Controller, type Control, type FieldErrors } from "react-hook-form"
import { ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import type { AddAccountFormValues } from "../form-schema"
import type { OpencodeFormField } from "../types"

const INPUT_TYPES = { email: "email", uri: "url", date: "date", "date-time": "datetime-local" } as const

interface MethodFormFieldsProps {
    fields: readonly OpencodeFormField[]
    control: Control<AddAccountFormValues>
    errors: FieldErrors<AddAccountFormValues>
}

/** Campos que o OpenCode pede para um método de login (ex.: tipo de deploy do GitHub). */
export function MethodFormFields({ fields, control, errors }: MethodFormFieldsProps) {
    const answerErrors = (errors.answer ?? {}) as Record<string, { message?: string } | undefined>
    return (
        <>
            {fields.map((field) => {
                const id = `opencode-answer-${field.key}`
                const label = field.title ?? field.key
                const error = answerErrors[field.key]?.message
                if (field.type === "external")
                    return (
                        <div key={field.key} className="space-y-1.5">
                            <Button asChild variant="outline" size="sm" className="gap-1.5">
                                <a href={field.url} target="_blank" rel="noreferrer">
                                    <ExternalLink className="h-4 w-4" aria-hidden />
                                    {label}
                                </a>
                            </Button>
                            {field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}
                        </div>
                    )
                return (
                    <Field key={field.key} id={id} label={field.required ? `${label} *` : label} error={error}>
                        <Controller
                            control={control}
                            name={`answer.${field.key}`}
                            render={({ field: input }) => {
                                if (field.type === "boolean") return <Switch id={id} checked={input.value === true} onCheckedChange={input.onChange} />
                                if (field.type === "multiselect") {
                                    const selected = Array.isArray(input.value) ? input.value : []
                                    return (
                                        <div id={id} className="space-y-1.5" role="group" aria-label={label}>
                                            {field.options.map((option) => (
                                                <label key={option.value} className="flex items-center gap-2 text-sm">
                                                    <Checkbox
                                                        checked={selected.includes(option.value)}
                                                        onCheckedChange={(checked) => input.onChange(checked ? [...selected, option.value] : selected.filter((item) => item !== option.value))}
                                                    />
                                                    {option.label}
                                                </label>
                                            ))}
                                        </div>
                                    )
                                }
                                if (field.type === "string" && field.options && field.options.length > 0 && !field.custom)
                                    return (
                                        <Select value={typeof input.value === "string" && input.value ? input.value : undefined} onValueChange={input.onChange}>
                                            <SelectTrigger id={id}>
                                                <SelectValue placeholder="Selecione" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {field.options.map((option) => (
                                                    <SelectItem key={option.value} value={option.value}>
                                                        {option.description ? `${option.label} — ${option.description}` : option.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    )
                                const numeric = field.type === "number" || field.type === "integer"
                                return (
                                    <Input
                                        id={id}
                                        type={numeric ? "number" : field.type === "string" && field.format ? INPUT_TYPES[field.format] : "text"}
                                        placeholder={field.type === "string" ? field.placeholder : undefined}
                                        value={typeof input.value === "string" || typeof input.value === "number" ? String(input.value) : ""}
                                        onChange={(event) => input.onChange(numeric && event.target.value !== "" ? Number(event.target.value) : event.target.value)}
                                        onBlur={input.onBlur}
                                    />
                                )
                            }}
                        />
                        {field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}
                    </Field>
                )
            })}
        </>
    )
}
