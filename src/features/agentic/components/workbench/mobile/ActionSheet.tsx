"use client"

import { useId, type ReactNode } from "react"
import { ExternalLink, type LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

/**
 * Folha que sobe do pé da tela (celular, `< lg`, OPE-166): "Mais ações", pedidos do agente e a decisão do
 * adversário. Rola por dentro e nunca passa de 85% da altura visível.
 */
export function ActionSheet({ open, onOpenChange, title, description, children, testId }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string; children: ReactNode; testId?: string }) {
    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto rounded-t-xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" data-testid={testId}>
                <SheetHeader className="mb-3 pr-8 text-left">
                    <SheetTitle className="text-base">{title}</SheetTitle>
                    <SheetDescription className={cn(!description && "sr-only")}>{description ?? title}</SheetDescription>
                </SheetHeader>
                <div className="space-y-4">{children}</div>
            </SheetContent>
        </Sheet>
    )
}

/** Grupo de itens da folha, com título discreto. */
export function ActionSheetSection({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="space-y-1.5" aria-label={title}>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
            <div className="space-y-1.5">{children}</div>
        </section>
    )
}

interface ActionSheetItemProps {
    icon: LucideIcon
    label: string
    /** Explicação curta abaixo do rótulo. */
    hint?: string | null
    /** Bloqueado: o motivo aparece em texto (no toque não há dica). */
    disabledReason?: string | null
    destructive?: boolean
    /** Link externo (prévia, PR): abre em nova guia. */
    href?: string
    onSelect?: () => void
}

/**
 * Item da folha: alvo de toque de 44 px, ícone, rótulo e o motivo do bloqueio em texto. Escolher um item
 * sempre fecha a folha (inclusive os links), para o que vem depois não ficar coberto.
 */
export function ActionSheetItem({ icon: Icon, label, hint, disabledReason, destructive = false, href, onSelect }: ActionSheetItemProps) {
    const blocked = Boolean(disabledReason)
    const description = disabledReason ?? hint ?? null
    const descriptionId = useId()
    const body = (
        <>
            <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", destructive && !blocked && "text-destructive")} aria-hidden />
            <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left">
                <span className={cn("text-sm font-medium", destructive && !blocked && "text-destructive")}>{label}</span>
                {description && <span id={descriptionId} className={cn("whitespace-normal text-xs font-normal", blocked ? "text-amber-300" : "text-muted-foreground")}>{description}</span>}
            </span>
            {href && <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />}
        </>
    )
    const classes = "h-auto min-h-11 w-full items-start justify-start gap-3 px-3 py-2.5"
    if (href && !blocked)
        return (
            <SheetClose asChild>
                <Button asChild variant="outline" className={classes}>
                    <a href={href} target="_blank" rel="noreferrer noopener" aria-label={label}>
                        {body}
                    </a>
                </Button>
            </SheetClose>
        )
    if (blocked)
        return (
            <Button type="button" variant="outline" className={cn(classes, "opacity-60")} aria-disabled aria-label={label} aria-describedby={descriptionId}>
                {body}
            </Button>
        )
    return (
        <SheetClose asChild>
            <Button type="button" variant="outline" className={classes} aria-label={label} onClick={onSelect}>
                {body}
            </Button>
        </SheetClose>
    )
}

/** Chave da folha (ex.: "Gerar prévia"): rótulo, explicação visível e o `Switch` à direita. */
export function ActionSheetSwitch({ id, label, hint, checked, disabled, onCheckedChange }: { id: string; label: string; hint: string; checked: boolean; disabled?: boolean; onCheckedChange: (checked: boolean) => void }) {
    return (
        <div className="flex min-h-11 items-start gap-3 rounded-md border px-3 py-2.5">
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <label htmlFor={id} className="text-sm font-medium">
                    {label}
                </label>
                <span id={`${id}-hint`} className="text-xs text-muted-foreground">
                    {hint}
                </span>
            </span>
            <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} aria-describedby={`${id}-hint`} />
        </div>
    )
}
