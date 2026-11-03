"use client"

import Fuse from "fuse.js"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { settingHelp } from "../../../help/settings"
import { changedSettings } from "../../../schemas/settings"
import type { SettingMeta } from "../../../types"

/** Configurações visíveis: busca tolerante (chave, rótulo e ajuda) e "Só alteradas" (salvas fora do padrão ou no rascunho). */
export function filterSettingMetas(metas: readonly SettingMeta[], options: { term: string; onlyChanged: boolean; draft: Record<string, unknown> }): SettingMeta[] {
    let list = [...metas]
    if (options.onlyChanged) {
        const saved = Object.fromEntries(metas.map((meta) => [meta.key, meta.updated_at ? meta.value : null]))
        const pending = changedSettings(saved, options.draft)
        list = list.filter((meta) => Boolean(meta.updated_at) || meta.key in pending)
    }
    const term = options.term.trim()
    if (!term) return list
    const rows = list.map((meta) => ({ meta, key: meta.key, label: settingHelp(meta.key, meta.description).label, help: settingHelp(meta.key, meta.description).help }))
    const fuse = new Fuse(rows, { keys: ["key", "label", "help"], threshold: 0.35, ignoreLocation: true })
    return fuse.search(term).map((result) => result.item.meta)
}

/** Busca e "Só alteradas" (fundo do card, como os demais filtros). */
export function SettingsFilters({ term, onTerm, onlyChanged, onOnlyChanged, shown, total }: { term: string; onTerm: (value: string) => void; onlyChanged: boolean; onOnlyChanged: (value: boolean) => void; shown: number; total: number }) {
    return (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center" data-testid="settings-filters">
            <div className="relative w-full sm:flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input aria-label="Buscar configuração" className="bg-transparent pl-8" value={term} placeholder="Buscar por chave, nome ou descrição" onChange={(event) => onTerm(event.target.value)} />
            </div>
            <div className="flex items-center gap-2">
                <Switch id="settings-only-changed" checked={onlyChanged} onCheckedChange={onOnlyChanged} />
                <Label htmlFor="settings-only-changed" className="text-sm">
                    Só alteradas
                </Label>
                <span className="text-xs text-muted-foreground" data-testid="settings-count">
                    {shown} de {total}
                </span>
            </div>
        </div>
    )
}
