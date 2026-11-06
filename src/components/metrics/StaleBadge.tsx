import { Clock } from "lucide-react"

/** Etiqueta "Desatualizado" dos painéis de consumo (quota do OpenCode e recursos do servidor). */
export function StaleBadge({ title }: { title: string }) {
    return (
        <span className="flex shrink-0 items-center gap-0.5 rounded-sm bg-warning/15 px-1 text-[10px] text-warning" title={title} data-testid="stale-badge">
            <Clock className="h-2.5 w-2.5" aria-hidden />
            Desatualizado
        </span>
    )
}
