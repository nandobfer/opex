"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ChevronDown, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { SERVICE_FIELDS, type Machine, type ServiceField, type ServiceOverride, type ServiceValues } from "../../schemas"
import { composeFieldText, customizedCount, initialFieldValue, SERVICE_FIELD_LABELS, shadowedEnvKeys, unforwardedPorts } from "../../services-form"
import { OverrideToggle } from "./OverrideToggle"
import { ServiceFieldEditor } from "./ServiceFieldEditor"

/** Caixa do item (o skeleton usa a mesma). */
export const SERVICE_ITEM = "rounded-md border border-border"
export const SERVICE_ITEM_HEADER = "flex items-center justify-between gap-2 px-3 py-2"

interface Props {
    override: ServiceOverride
    /** Dados do serviço no compose (`undefined` = compose ainda não lido; `null` = o serviço não está no compose). */
    compose: ServiceValues | null | undefined
    orphan: boolean
    /** Serviços do compose (dependências). */
    services: string[]
    envKeys: string[]
    ports: number[]
    runOn: Machine
    /** Mensagem de erro de cada campo (validação do formulário). */
    errors: Partial<Record<ServiceField, string>>
    onFieldChange: <F extends ServiceField>(field: F, value: ServiceValues[F]) => void
    onRemove: () => void
    /** Portas e volumes do compose que a tela não conseguiu ler (ex.: alvo com `${VAR}`). */
    unreadable?: { ports: string[]; volumes: string[] }
}

/** Um serviço do bloco "Serviços do compose" (OPE-211): cabeçalho recolhível e os campos com "Personalizar". */
export function ServiceOverrideItem({ override, compose, orphan, services, envKeys, ports, runOn, errors, onFieldChange, onRemove, unreadable }: Props) {
    const [open, setOpen] = useState(true)
    const count = customizedCount(override)
    const shadowed = shadowedEnvKeys(override, envKeys)
    const unforwarded = unforwardedPorts(override, ports, runOn)
    const contentId = `service-override-${override.service}`
    const hasErrors = Object.values(errors).some(Boolean)
    return (
        <div className={cn(SERVICE_ITEM, hasErrors && "border-destructive/60")}>
            <div className={SERVICE_ITEM_HEADER}>
                <button type="button" aria-expanded={open} aria-controls={contentId} className="flex flex-1 items-center gap-2 text-left" onClick={() => setOpen((value) => !value)}>
                    <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")} aria-hidden />
                    <span className="font-mono text-sm">{override.service}</span>
                    {override.image !== null && <Badge variant="outline">imagem própria</Badge>}
                    <Badge variant="secondary">{count === 1 ? "1 personalizado" : `${count} personalizados`}</Badge>
                    {orphan && <Badge variant="outline">não está no compose</Badge>}
                </button>
                <Button type="button" variant="ghost" size="icon" aria-label={`Remover os ajustes de ${override.service}`} onClick={onRemove}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
            </div>
            <AnimatePresence initial={false}>
                {open && (
                    <motion.div id={contentId} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                        <div className="space-y-2 px-3 pb-3">
                            {override.image !== null && <p className="text-xs text-muted-foreground">Com imagem própria o serviço não faz build nem passa pelo registry; a imagem é baixada (pull) a cada deploy.</p>}
                            {SERVICE_FIELDS.map((field) => (
                                <OverrideToggle
                                    key={field}
                                    id={`${contentId}-${field}`}
                                    label={SERVICE_FIELD_LABELS[field]}
                                    customized={override[field] !== null}
                                    onToggle={(customized) => onFieldChange(field, customized ? initialFieldValue(field, compose ?? null) : null)}
                                    composeText={compose === undefined ? undefined : composeFieldText(field, compose)}
                                    error={errors[field]}
                                    warning={(field === "ports" || field === "volumes") && unreadable?.[field].length ? `Não foi possível ler este item do compose: ${unreadable[field].join(", ")}. Ao personalizar, ele sai do serviço: inclua-o à mão se precisar.` : null}
                                >
                                    {override[field] !== null && (
                                        <ServiceFieldEditor id={`${contentId}-${field}-input`} service={override.service} field={field} value={override[field]!} onChange={(value) => onFieldChange(field, value)} services={services} />
                                    )}
                                </OverrideToggle>
                            ))}
                            {shadowed.length > 0 && <p className="text-xs text-warning">O environment do serviço vence as Variáveis extras com o mesmo nome: {shadowed.join(", ")}.</p>}
                            {unforwarded.length > 0 && <p className="text-xs text-warning">Executando no PC, o repasse para o servidor só vale para as Portas do ambiente: inclua {unforwarded.join(", ")} em Portas.</p>}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
