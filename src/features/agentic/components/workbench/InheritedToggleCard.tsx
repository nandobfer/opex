"use client"

import { Button } from "@/components/ui/button"
import { ToggleCard } from "@/components/ui/toggle-card"

interface InheritedToggleCardProps {
    id: string
    label: string
    description: string
    checked: boolean
    /** A tarefa segue o padrão da central (`null` no campo da tarefa). */
    inherited: boolean
    /** Texto do padrão da central ("Publicar prévia", "Ligado"…). */
    centralLabel: string
    disabled?: boolean
    onCheckedChange: (checked: boolean) => void
    /** Volta a seguir o padrão da central. */
    onInherit: () => void
    onLabel?: string
    offLabel?: string
}

/**
 * Switch da tela inicial da mesa com herança da central (OPE-79 "Gerar prévia" e OPE-137 "Gerar plano após
 * refinar"): mostra "Seguindo o padrão da central: …" ou "Escolhido só para esta tarefa …" e o botão
 * "Usar padrão da central" quando a tarefa tem escolha própria.
 */
export function InheritedToggleCard({ id, label, description, checked, inherited, centralLabel, disabled, onCheckedChange, onInherit, onLabel = "Ligado", offLabel = "Desligado" }: InheritedToggleCardProps) {
    return (
        <div className="space-y-1.5">
            <ToggleCard id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} label={label} description={description} onLabel={onLabel} offLabel={offLabel} />
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                    {inherited ? (
                        <>
                            Seguindo o padrão da central: <span className="font-medium text-foreground">{centralLabel}</span>.
                        </>
                    ) : (
                        <>Escolhido só para esta tarefa (a central está em {centralLabel}).</>
                    )}
                </span>
                {!inherited && (
                    <Button type="button" variant="ghost" size="sm" className="h-auto px-2 py-1 text-xs" disabled={disabled} onClick={onInherit}>
                        Usar padrão da central
                    </Button>
                )}
            </div>
        </div>
    )
}
