"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useRowIds } from "@/components/ui/key-value-rows"
import { OptionTabs } from "@/components/ui/option-tabs"
import { PORT_PROTOCOLS, type PortOverride } from "../../schemas"

const PROTOCOL_OPTIONS = PORT_PROTOCOLS.map((value) => ({
    value,
    label: value.toUpperCase(),
}))
/** Linha da porta: publicada, no container, protocolo, IP e remover. */
export const PORT_ROW = "grid gap-2 sm:grid-cols-[1fr_1fr_auto_1fr_auto]"

/** Portas publicadas do serviço (OPE-211), na forma longa do compose; a lista substitui a do compose. */
export function PortsField({ value, onChange }: { value: PortOverride[]; onChange: (value: PortOverride[]) => void }) {
    const ids = useRowIds(value.length)
    const update = (index: number, patch: Partial<PortOverride>) => onChange(value.map((item, position) => (position === index ? { ...item, ...patch } : item)))
    const remove = (index: number) => {
        ids.removeAt(index)
        onChange(value.filter((_, position) => position !== index))
    }
    return (
        <div className="space-y-2">
            <AnimatePresence initial={false}>
                {value.map((port, index) => (
                    <motion.div key={ids.ids[index]} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className={PORT_ROW}>
                        <Input aria-label={`Porta publicada ${index + 1}`} className="font-mono" placeholder="8080 (vazio = não publica)" value={port.published} onChange={(event) => update(index, { published: event.target.value })} />
                        <Input
                            aria-label={`Porta no container ${index + 1}`}
                            className="font-mono"
                            inputMode="numeric"
                            placeholder="80"
                            value={Number.isFinite(port.target) && port.target > 0 ? String(port.target) : ""}
                            onChange={(event) => update(index, { target: Number(event.target.value) || 0 })}
                        />
                        <OptionTabs aria-label={`Protocolo da porta ${index + 1}`} options={PROTOCOL_OPTIONS} value={port.protocol} onChange={(protocol) => update(index, { protocol })} size="xs" />
                        <Input aria-label={`IP do host da porta ${index + 1}`} className="font-mono" placeholder="IP (vazio = todos)" value={port.hostIp} onChange={(event) => update(index, { hostIp: event.target.value })} />
                        <Button type="button" variant="ghost" size="icon" aria-label={`Remover a porta ${index + 1}`} onClick={() => remove(index)}>
                            <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                    </motion.div>
                ))}
            </AnimatePresence>
            {!value.length && <p className="text-xs text-muted-foreground">Nenhuma porta publicada (a lista vazia tira as portas do compose).</p>}
            <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={() => onChange([...value, { target: 0, published: "", protocol: "tcp", hostIp: "" }])}>
                <Plus className="h-4 w-4" aria-hidden /> Porta
            </Button>
        </div>
    )
}
