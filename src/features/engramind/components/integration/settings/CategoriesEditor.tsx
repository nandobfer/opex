"use client"

import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { GripVertical, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { InfoTooltip } from "@/components/ui/info-tooltip"
import type { Category } from "../../../types"

interface CategoriesEditorProps {
    id: string
    value: Category[]
    onChange: (next: Category[]) => void
}

/** `categories.list`: lista reordenável (a primeira é a padrão) de `{ chave, rótulo, prioridade }`. */
export function CategoriesEditor({ id, value, onChange }: CategoriesEditorProps) {
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
    const ids = value.map((_, index) => `${id}-cat-${index}`)
    const onDragEnd = ({ active, over }: DragEndEvent) => {
        if (!over || active.id === over.id) return
        onChange(arrayMove(value, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))))
    }
    const update = (index: number, patch: Partial<Category>) => onChange(value.map((item, position) => (position === index ? { ...item, ...patch } : item)))
    return (
        <div className="space-y-2">
            <div className="hidden grid-cols-[1.5rem_1fr_1fr_6rem_2rem] gap-2 px-1 text-[11px] text-muted-foreground sm:grid">
                <span />
                <span className="flex items-center gap-1">
                    Chave <InfoTooltip text="Maiúsculas, dígitos e _, começando por letra (até 40). Retirar uma chave em uso é recusado." label="Chave" />
                </span>
                <span>Rótulo</span>
                <span className="flex items-center gap-1">
                    Prioridade <InfoTooltip text="De -1000 a 1000: maior entra antes no contexto." label="Prioridade" />
                </span>
                <span />
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                    <ul className="space-y-2">
                        <AnimatePresence initial={false}>
                            {value.map((item, index) => (
                                <CategoryRow key={ids[index]} sortableId={ids[index]!} index={index} item={item} first={index === 0} onChange={(patch) => update(index, patch)} onRemove={value.length > 1 ? () => onChange(value.filter((_, position) => position !== index)) : undefined} />
                            ))}
                        </AnimatePresence>
                    </ul>
                </SortableContext>
            </DndContext>
            {value.length < 50 && (
                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => onChange([...value, { key: "", label: "", priority: 0 }])}>
                    <Plus className="h-3.5 w-3.5" aria-hidden /> Adicionar categoria
                </Button>
            )}
        </div>
    )
}

interface CategoryRowProps {
    sortableId: string
    index: number
    item: Category
    first: boolean
    onChange: (patch: Partial<Category>) => void
    onRemove?: () => void
}

function CategoryRow({ sortableId, index, item, first, onChange, onRemove }: CategoryRowProps) {
    const reduced = useReducedMotion()
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sortableId })
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
            <div className="grid grid-cols-[1.5rem_1fr] items-center gap-2 sm:grid-cols-[1.5rem_1fr_1fr_6rem_2rem]">
                <button type="button" className="cursor-grab text-muted-foreground hover:text-foreground" aria-label={`Arrastar a categoria ${index + 1}`} {...attributes} {...listeners}>
                    <GripVertical className="h-4 w-4" aria-hidden />
                </button>
                <Input aria-label={`Chave da categoria ${index + 1}`} value={item.key} placeholder="CONSTRAINTS" onChange={(event) => onChange({ key: event.target.value.toUpperCase() })} className="font-mono" />
                <Input aria-label={`Rótulo da categoria ${index + 1}`} value={item.label} placeholder="Restrições" onChange={(event) => onChange({ label: event.target.value })} className="col-start-2 sm:col-start-auto" />
                <Input aria-label={`Prioridade da categoria ${index + 1}`} type="number" value={Number.isFinite(item.priority) ? item.priority : ""} onChange={(event) => onChange({ priority: event.target.value === "" ? Number.NaN : Number(event.target.value) })} className="col-start-2 sm:col-start-auto" />
                <span className="col-start-2 flex items-center gap-1 sm:col-start-auto">
                    {first && <span className="text-[10px] text-primary sm:hidden">padrão</span>}
                    {onRemove && (
                        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onRemove} aria-label={`Remover a categoria ${index + 1}`}>
                            <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                    )}
                </span>
            </div>
        </motion.li>
    )
}
