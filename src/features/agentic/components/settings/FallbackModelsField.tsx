"use client"

import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { GripVertical, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FieldTrigger } from "@/components/ui/field-trigger"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { AiModelDto } from "@/lib/ai/providers"
import { MAX_MODEL_FALLBACKS, type ModelChoice } from "../../schemas"
import { ModelSearchPicker } from "./ModelSearchPicker"

const DEFAULT_OPTION = "__default__"

interface FallbackModelsFieldProps {
    id: string
    value: ModelChoice[]
    onChange: (next: ModelChoice[]) => void
    models: { data?: AiModelDto[]; isLoading: boolean }
    /** Modelo principal do papel (o fallback igual a ele é apontado como erro). */
    primary: { model: string | null; variant: string | null }
}

const same = (a: { model: string | null; variant: string | null }, b: { model: string | null; variant: string | null }) => a.model === b.model && (a.variant ?? null) === (b.variant ?? null)

/** Problema de um item da lista (mesma regra do schema): igual ao principal ou repetido. */
export function fallbackIssue(list: ModelChoice[], index: number, primary: { model: string | null; variant: string | null }): string | null {
    const item = list[index]
    if (primary.model && same(item, primary)) return "Igual ao modelo principal"
    if (list.slice(0, index).some((other) => same(other, item))) return "Modelo repetido"
    return null
}

/** Texto curto da lista ("GPT-5 (high) → DeepSeek V3"), para o resumo herdado. */
export function describeFallbacks(list: ModelChoice[] | null | undefined, models?: AiModelDto[]): string {
    if (!list?.length) return "sem fallback"
    return list.map((item) => `${models?.find((model) => model.id === item.model)?.name ?? item.model}${item.variant ? ` (${item.variant})` : ""}`).join(" → ")
}

/**
 * Lista ordenada de modelos de fallback de um papel (até 5): tentados em ordem quando o modelo
 * principal (ou o anterior da lista) falha no provedor. Ordem por arrastar (dnd-kit).
 */
export function FallbackModelsField({ id, value, onChange, models, primary }: FallbackModelsFieldProps) {
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
    const ids = value.map((_, index) => `${id}-item-${index}`)
    const onDragEnd = ({ active, over }: DragEndEvent) => {
        if (!over || active.id === over.id) return
        onChange(arrayMove(value, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))))
    }
    const update = (index: number, patch: Partial<ModelChoice>) => onChange(value.map((item, position) => (position === index ? { ...item, ...patch } : item)))

    return (
        <div className="space-y-2" role="group" aria-labelledby={`${id}-label`}>
            <div>
                <p id={`${id}-label`} className="text-sm font-medium">
                    Modelos de fallback
                </p>
                <p className="text-xs text-muted-foreground">Tentados em ordem, no mesmo turno, quando o modelo falha no provedor (limite de uso, cota, indisponível). O agente continua o mesmo.</p>
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                    <ul className="space-y-2">
                        <AnimatePresence initial={false}>
                            {value.map((item, index) => (
                                <FallbackRow
                                    key={ids[index]}
                                    sortableId={ids[index]}
                                    rowId={`${id}-${index}`}
                                    index={index}
                                    item={item}
                                    models={models}
                                    issue={fallbackIssue(value, index, primary)}
                                    onPick={(model) => update(index, { model: model.id, variant: null })}
                                    onVariant={(variant) => update(index, { variant })}
                                    onRemove={() => onChange(value.filter((_, position) => position !== index))}
                                />
                            ))}
                        </AnimatePresence>
                    </ul>
                </SortableContext>
            </DndContext>
            {value.length < MAX_MODEL_FALLBACKS ? (
                <ModelSearchPicker
                    trigger={
                        <Button type="button" variant="outline" size="sm" className="gap-1.5">
                            <Plus className="h-3.5 w-3.5" aria-hidden /> Adicionar fallback
                        </Button>
                    }
                    models={models}
                    onPick={(model) => onChange([...value, { model: model.id, variant: null }])}
                    align="start"
                />
            ) : (
                <p className="text-xs text-muted-foreground">Limite de {MAX_MODEL_FALLBACKS} modelos de fallback.</p>
            )}
        </div>
    )
}

interface FallbackRowProps {
    sortableId: string
    rowId: string
    index: number
    item: ModelChoice
    models: { data?: AiModelDto[]; isLoading: boolean }
    issue: string | null
    onPick: (model: AiModelDto) => void
    onVariant: (variant: string | null) => void
    onRemove: () => void
}

function FallbackRow({ sortableId, rowId, index, item, models, issue, onPick, onVariant, onRemove }: FallbackRowProps) {
    const reduced = useReducedMotion()
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sortableId })
    const model = models.data?.find((entry) => entry.id === item.model)
    return (
        <motion.li
            ref={setNodeRef}
            style={{ transform: CSS.Transform.toString(transform), transition }}
            initial={reduced ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className={isDragging ? "relative z-10 opacity-80" : undefined}
        >
            <div className="flex items-start gap-2">
                <button type="button" className="mt-2 cursor-grab text-muted-foreground hover:text-foreground" aria-label={`Arrastar o fallback ${index + 1}`} {...attributes} {...listeners}>
                    <GripVertical className="h-4 w-4" aria-hidden />
                </button>
                <span className="mt-2 w-4 shrink-0 text-xs text-muted-foreground">{index + 1}.</span>
                <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                    <div className={model && model.variants.length > 0 ? "min-w-0" : "min-w-0 sm:col-span-2"}>
                        <ModelSearchPicker trigger={<FieldTrigger id={`${rowId}-model`} placeholder="Escolha o modelo" value={model ? model.name : item.model} />} models={models} onPick={onPick} matchTriggerWidth />
                    </div>
                    {model && model.variants.length > 0 && (
                        <Select value={item.variant ?? DEFAULT_OPTION} onValueChange={(next) => onVariant(next === DEFAULT_OPTION ? null : next)}>
                            <SelectTrigger id={`${rowId}-variant`} className="w-full" aria-label={`Variante do fallback ${index + 1}`}>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value={DEFAULT_OPTION}>Padrão do modelo</SelectItem>
                                {model.variants.map((variant) => (
                                    <SelectItem key={variant} value={variant}>
                                        {variant}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                    {issue && <p className="text-xs text-destructive sm:col-span-2">{issue}</p>}
                </div>
                <Button type="button" variant="ghost" size="icon" className="h-9 w-9 shrink-0" aria-label={`Remover o fallback ${index + 1}`} onClick={onRemove}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
            </div>
        </motion.li>
    )
}
