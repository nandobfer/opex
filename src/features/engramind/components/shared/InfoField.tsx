import type { ReactNode } from "react"
import { InfoTooltip } from "@/components/ui/info-tooltip"
import { Label } from "@/components/ui/label"

/** Campo rotulado com o ícone de informação ao lado do rótulo e a mensagem de erro pt-BR. */
export function InfoField({ id, label, info, error, hint, children, className }: { id: string; label: string; info?: ReactNode; error?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
    return (
        <div className={className ?? "space-y-1.5"}>
            <span className="flex items-center gap-1.5">
                <Label htmlFor={id} className="text-xs font-semibold">
                    {label}
                </Label>
                {info && <InfoTooltip text={info} label={label} />}
            </span>
            {children}
            {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
            {error && (
                <p role="alert" className="text-xs text-destructive">
                    {error}
                </p>
            )}
        </div>
    )
}
