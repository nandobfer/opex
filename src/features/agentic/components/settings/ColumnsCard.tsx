"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useTaskBoard } from "@/features/tasks/hooks/useTaskBoard"

const NONE = "__none__"

export interface ColumnsCardField {
    id: string
    label: string
    /** Rótulo da opção "nada" (padrão: "Não mover"). */
    noneLabel?: string
    value: string | null
    /** Valor do padrão global da aba, mostrado no modo herdado (a central). */
    globalValue?: string | null
    onChange: (value: string | null) => void
}

interface ColumnsCardProps {
    title: string
    description: string
    idPrefix: string
    fields: ColumnsCardField[]
    /**
     * Herança (só na central): `value` diz que a central usa o padrão global e `onChange` alterna o
     * modo. Sem `inherited`, o card edita o padrão global direto.
     */
    inherited?: { value: boolean; onChange: (inherit: boolean) => void }
}

/**
 * Card de colunas da **fila** ou da **movimentação** (OPE-79), usado nos dois escopos: o padrão
 * global da aba "Agente Desenvolvedor" e a configuração da central, que pode herdar o padrão ou
 * personalizá-lo — a mesma experiência do card de agentes.
 */
export function ColumnsCard({ title, description, idPrefix, fields, inherited }: ColumnsCardProps) {
    const board = useTaskBoard()
    const inheriting = inherited?.value === true
    const columnLabel = (value: string | null | undefined, noneLabel: string | undefined) =>
        value ? board.columns.find((column) => column.key === value)?.label ?? value : noneLabel ?? "Não mover"

    const isKnown = (value: string | null) => !value || board.columns.some((column) => column.key === value)

    const select = (field: ColumnsCardField) => (
        <Field key={field.id} id={field.id} label={field.label}>
            <Select value={field.value ?? NONE} onValueChange={(value) => field.onChange(value === NONE ? null : value)}>
                <SelectTrigger id={field.id} className="w-full">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value={NONE}>{field.noneLabel ?? "Não mover"}</SelectItem>
                    {field.value && !isKnown(field.value) && <SelectItem value={field.value}>{board.isLoading ? "Carregando colunas…" : `Coluna removida (${field.value})`}</SelectItem>}
                    {board.columns.map((column) => (
                        <SelectItem key={column.key} value={column.key}>
                            {column.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </Field>
    )

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                {inherited && (
                    <OptionTabs<"inherit" | "custom">
                        id={`${idPrefix}-mode`}
                        options={[
                            { value: "inherit", label: "Padrão global" },
                            { value: "custom", label: "Personalizar" },
                        ]}
                        value={inheriting ? "inherit" : "custom"}
                        onChange={(mode) => inherited.onChange(mode === "inherit")}
                        className="w-full"
                    />
                )}
                <AnimatePresence mode="wait" initial={false}>
                    {inheriting ? (
                        <motion.dl key="inherit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="space-y-1 text-sm text-muted-foreground">
                            {fields.map((field) => (
                                <div key={field.id} className="flex items-center justify-between gap-3">
                                    <dt className="min-w-0 truncate">{field.label}</dt>
                                    <dd className="shrink-0 font-medium text-foreground">{columnLabel(field.globalValue, field.noneLabel)}</dd>
                                </div>
                            ))}
                        </motion.dl>
                    ) : (
                        <motion.div key="custom" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="space-y-3">
                            {fields.map(select)}
                        </motion.div>
                    )}
                </AnimatePresence>
            </CardContent>
        </Card>
    )
}
