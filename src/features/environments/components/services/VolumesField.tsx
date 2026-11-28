"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useRowIds } from "@/components/ui/key-value-rows"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Switch } from "@/components/ui/switch"
import type { VolumeOverride, VolumeType } from "../../schemas"
import { TableHeader } from "./TableHeader"

const TYPE_OPTIONS = [
    {
        value: "bind",
        label: "Pasta",
        title: "Bind mount: uma pasta da máquina (relativa à pasta do compose)",
    },
    {
        value: "volume",
        label: "Volume",
        title: "Volume do Docker (nomeado ou anônimo)",
    },
    {
        value: "tmpfs",
        label: "tmpfs",
        title: "Memória (some ao recriar o container)",
    },
] as const

/** Linha do volume: tipo, origem, destino, somente leitura e remover. */
export const VOLUME_ROW = "grid items-center gap-2 sm:grid-cols-[auto_1fr_1fr_auto_auto]"

const SOURCE_PLACEHOLDER: Record<VolumeType, string> = {
    bind: "./dados",
    volume: "nome (vazio = anônimo)",
    tmpfs: "—",
}

/** Volumes do serviço (OPE-211), na forma longa do compose; a lista substitui a do compose. */
export function VolumesField({ value, onChange }: { value: VolumeOverride[]; onChange: (value: VolumeOverride[]) => void }) {
    const ids = useRowIds(value.length)
    const update = (index: number, patch: Partial<VolumeOverride>) => onChange(value.map((item, position) => (position === index ? { ...item, ...patch } : item)))
    const remove = (index: number) => {
        ids.removeAt(index)
        onChange(value.filter((_, position) => position !== index))
    }
    return (
        <div className="space-y-2">
            {value.length > 0 && <TableHeader grid={VOLUME_ROW} columns={["Tipo", "Origem (pasta ou volume)", "Destino no container", "", ""]} />}
            <AnimatePresence initial={false}>
                {value.map((volume, index) => (
                    <motion.div key={ids.ids[index]} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className={VOLUME_ROW}>
                        <OptionTabs
                            aria-label={`Tipo do volume ${index + 1}`}
                            options={TYPE_OPTIONS}
                            value={volume.type}
                            onChange={(type) =>
                                update(index, {
                                    type,
                                    ...(type === "tmpfs" ? { source: "" } : {}),
                                })
                            }
                            size="xs"
                        />
                        <Input
                            aria-label={`Origem do volume ${index + 1}`}
                            className="font-mono"
                            disabled={volume.type === "tmpfs"}
                            placeholder={SOURCE_PLACEHOLDER[volume.type]}
                            value={volume.source}
                            onChange={(event) => update(index, { source: event.target.value })}
                        />
                        <Input aria-label={`Destino do volume ${index + 1}`} className="font-mono" placeholder="/dados" value={volume.target} onChange={(event) => update(index, { target: event.target.value })} />
                        <span className="flex items-center gap-2 text-xs text-muted-foreground">
                            Só leitura
                            <Switch aria-label={`Volume ${index + 1} somente leitura`} checked={volume.readOnly} onCheckedChange={(readOnly) => update(index, { readOnly })} />
                        </span>
                        <Button type="button" variant="ghost" size="icon" aria-label={`Remover o volume ${index + 1}`} onClick={() => remove(index)}>
                            <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                    </motion.div>
                ))}
            </AnimatePresence>
            {!value.length && <p className="text-xs text-muted-foreground">Nenhum volume (a lista vazia tira os volumes do compose).</p>}
            <p className="text-xs text-muted-foreground">Pasta relativa: a partir da pasta do primeiro arquivo do compose. Executar no PC não aceita pastas (bind mount).</p>
            <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={() => onChange([...value, { type: "volume", source: "", target: "", readOnly: false }])}>
                <Plus className="h-4 w-4" aria-hidden /> Adicionar volume
            </Button>
        </div>
    )
}
