"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/**
 * `context.category_priorities` (tipo `map`, Engramind 0.11.0): prioridade de cada categoria na ordem do
 * contexto (−1000 a 1000), sobrepondo a de `categories.list`. Campo vazio = sem sobreposição (sai do mapa).
 */
export function CategoryPrioritiesEditor({ id, value, categories, onChange, disabled }: { id: string; value: unknown; categories: readonly { key: string; label: string }[]; onChange: (value: Record<string, number>) => void; disabled?: boolean }) {
    const map = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, number>) : {}
    if (!categories.length) return <p className="text-xs text-muted-foreground">Sem categorias em categories.list.</p>
    const set = (key: string, raw: string) => {
        const next = { ...map }
        if (raw === "") delete next[key]
        else next[key] = Number(raw)
        onChange(next)
    }
    return (
        <div id={id} className="grid grid-cols-1 gap-2 sm:grid-cols-2" data-testid="category-priorities">
            {categories.map((category) => (
                <div key={category.key} className="flex items-center gap-2">
                    <Label htmlFor={`${id}-${category.key}`} className="min-w-0 flex-1 truncate font-mono text-[11px]" title={category.label}>
                        {category.key}
                    </Label>
                    <Input id={`${id}-${category.key}`} type="number" step={1} min={-1000} max={1000} className="w-full sm:flex-1" value={typeof map[category.key] === "number" ? map[category.key] : ""} placeholder="—" onChange={(event) => set(category.key, event.target.value)} disabled={disabled} />
                </div>
            ))}
        </div>
    )
}
