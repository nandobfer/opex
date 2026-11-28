"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Pencil, Undo2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { ServiceField, ServiceValues } from "../../schemas"
import { composeFieldText, SERVICE_FIELD_LABELS } from "../../services-form"
import { ServiceFieldEditor } from "../services/ServiceFieldEditor"

interface Props<F extends ServiceField> {
    service: string
    field: F
    /** Valor personalizado (`null` = vale o do compose). */
    value: ServiceValues[F]
    /** Dados do serviço no compose (`undefined` = compose não lido). */
    compose: ServiceValues | null | undefined
    services: string[]
    error?: string
    warnings?: string[]
    onEdit: () => void
    onChange: (value: NonNullable<ServiceValues[F]>) => void
    onRevert: () => void
}

/**
 * Um campo do serviço: rótulo, valor em vigor e a origem dele ("do compose" ou "personalizado"). "Editar"
 * abre o editor no lugar, já com o valor do compose; "Voltar ao do compose" desfaz o ajuste do campo.
 */
export function ServiceFieldRow<F extends ServiceField>({ service, field, value, compose, services, error, warnings = [], onEdit, onChange, onRevert }: Props<F>) {
    const customized = value !== null
    const label = SERVICE_FIELD_LABELS[field]
    const composeText = compose === undefined ? "compose ainda não lido" : (composeFieldText(field, compose) ?? "não declarado")
    return (
        <div className="space-y-2 py-3" data-field={field}>
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 space-y-1">
                    <p className="flex items-center gap-2 text-sm font-medium">
                        {label}
                        <Badge variant={customized ? "default" : "outline"} className={customized ? undefined : "text-muted-foreground"}>
                            {customized ? "personalizado" : "do compose"}
                        </Badge>
                    </p>
                    {!customized && <p className="break-all font-mono text-xs text-muted-foreground">{composeText}</p>}
                </div>
                {customized ? (
                    <Button type="button" variant="ghost" size="sm" className="gap-1.5" aria-label={`Voltar ${label} ao do compose`} onClick={onRevert}>
                        <Undo2 className="h-4 w-4" aria-hidden /> Voltar ao do compose
                    </Button>
                ) : (
                    <Button type="button" variant="outline" size="sm" className="gap-1.5" aria-label={`Editar ${label}`} onClick={onEdit}>
                        <Pencil className="h-4 w-4" aria-hidden /> Editar
                    </Button>
                )}
            </div>
            <AnimatePresence initial={false}>
                {customized && (
                    <motion.div key="editor" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="space-y-2 overflow-hidden">
                        <ServiceFieldEditor id={`service-${service}-${field}`} service={service} field={field} value={value as NonNullable<ServiceValues[F]>} onChange={onChange} services={services} />
                        {compose !== undefined && <p className="break-all text-xs text-muted-foreground">No compose: {composeText}</p>}
                    </motion.div>
                )}
            </AnimatePresence>
            {customized && error && <p className="text-xs text-destructive">{error}</p>}
            {warnings.map((warning) => (
                <p key={warning} className="text-xs text-warning">
                    {warning}
                </p>
            ))}
        </div>
    )
}
