"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useRowIds } from "@/components/ui/key-value-rows"
import { OptionTabs } from "@/components/ui/option-tabs"
import { SearchPicker } from "@/components/ui/search-picker"
import { Switch } from "@/components/ui/switch"
import type { DependsOn } from "../../schemas"
import { TableHeader } from "./TableHeader"

const CONDITION_OPTIONS = [
    {
        value: "service_started",
        label: "Iniciado",
        title: "service_started: espera o container iniciar",
    },
    {
        value: "service_healthy",
        label: "Saudável",
        title: "service_healthy: espera o healthcheck passar",
    },
    {
        value: "service_completed_successfully",
        label: "Concluído",
        title: "service_completed_successfully: espera terminar com sucesso",
    },
] as const

/** Linha da dependência: serviço, condição, reiniciar junto e remover. */
export const DEPENDS_ROW = "grid items-center gap-2 sm:grid-cols-[1fr_auto_auto_auto]"

/** Dependências do serviço (OPE-211): os outros serviços do compose, com a condição; substitui as do compose. */
export function DependsOnField({ value, onChange, services }: { value: DependsOn[]; onChange: (value: DependsOn[]) => void; services: string[] }) {
    const ids = useRowIds(value.length)
    const update = (index: number, patch: Partial<DependsOn>) => onChange(value.map((item, position) => (position === index ? { ...item, ...patch } : item)))
    const remove = (index: number) => {
        ids.removeAt(index)
        onChange(value.filter((_, position) => position !== index))
    }
    const available = services.filter((service) => !value.some((item) => item.service === service))
    return (
        <div className="space-y-2">
            {value.length > 0 && <TableHeader grid={DEPENDS_ROW} columns={["Serviço", "Espera até", "", ""]} />}
            <AnimatePresence initial={false}>
                {value.map((item, index) => (
                    <motion.div key={ids.ids[index]} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className={DEPENDS_ROW}>
                        <span className="truncate font-mono text-sm">{item.service}</span>
                        <OptionTabs aria-label={`Condição de ${item.service}`} options={CONDITION_OPTIONS} value={item.condition} onChange={(condition) => update(index, { condition })} size="xs" />
                        <span className="flex items-center gap-2 text-xs text-muted-foreground">
                            Reiniciar junto
                            <Switch aria-label={`Reiniciar junto com ${item.service}`} checked={item.restart} onCheckedChange={(restart) => update(index, { restart })} />
                        </span>
                        <Button type="button" variant="ghost" size="icon" aria-label={`Remover a dependência ${item.service}`} onClick={() => remove(index)}>
                            <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                    </motion.div>
                ))}
            </AnimatePresence>
            {!value.length && <p className="text-xs text-muted-foreground">Sem dependências (a lista vazia tira as do compose).</p>}
            <SearchPicker
                trigger={
                    <Button type="button" variant="ghost" size="sm" className="gap-1" disabled={!available.length}>
                        <Plus className="h-4 w-4" aria-hidden /> Adicionar dependência
                    </Button>
                }
                items={available}
                getKey={(service) => service}
                renderItem={(service) => <span className="font-mono text-sm">{service}</span>}
                onPick={(service) => onChange([...value, { service, condition: "service_started", restart: false }])}
                filterItems={(items, term) => items.filter((service) => service.toLowerCase().includes(term.toLowerCase()))}
                disabled={!available.length}
                searchLabel="Buscar serviço"
                listLabel="Serviços do compose"
                emptyText="Leia o compose para listar os serviços."
                emptySearchText="Nenhum serviço encontrado."
            />
        </div>
    )
}
