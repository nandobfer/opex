import { AlertTriangle } from "lucide-react"

/** Marca de ferramenta (ou grupo) que exige o escopo destrutivo pelo token. */
export function SensitiveToolBadge({ label = "Destrutiva" }: { label?: string }) {
    return (
        <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-1.5 py-0.5 text-[10px] font-semibold text-warning" data-sensitive="true">
            <AlertTriangle className="h-3 w-3" aria-hidden /> {label}
        </span>
    )
}
