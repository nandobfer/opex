import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"

interface PanelMessageProps {
    icon: LucideIcon
    tone?: "muted" | "warning" | "destructive"
    title: string
    description?: string
    children?: ReactNode
}

/** Aviso compacto dos painéis de consumo (vazio, falha, sem configuração), com ação opcional. */
export function PanelMessage({ icon: Icon, tone = "muted", title, description, children }: PanelMessageProps) {
    const color = tone === "destructive" ? "text-destructive" : tone === "warning" ? "text-warning" : "text-muted-foreground"
    return (
        <div className="flex gap-2 rounded-md bg-muted/40 p-2 text-[11px]" role={tone === "muted" ? "status" : "alert"}>
            <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${color}`} aria-hidden />
            <div className="min-w-0 flex-1 space-y-1">
                <p className="font-medium text-foreground">{title}</p>
                {description && <p className="text-muted-foreground">{description}</p>}
                {children}
            </div>
        </div>
    )
}
