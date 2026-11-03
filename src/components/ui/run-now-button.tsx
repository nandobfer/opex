"use client"

import type { ReactNode } from "react"
import { Loader2, Play, type LucideIcon } from "lucide-react"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/**
 * "Executar agora" (extraído das Rotinas, OPE-117): botão secundário com spinner enquanto roda e, quando
 * bloqueado, o motivo num tooltip (o botão desabilitado não recebe ponteiro: o tooltip fica no wrapper).
 * Fundo do card (`bg-transparent`), nunca o fundo escuro do `outline`, para não competir com Salvar.
 */
export function RunNowButton({
    label,
    blockReason,
    pending,
    onClick,
    text = "Executar agora",
    icon: Icon = Play,
    className,
}: {
    label: string
    blockReason: string | null
    pending: boolean
    onClick: () => void
    text?: string
    icon?: LucideIcon
    className?: string
}) {
    const button = (
        <Button type="button" variant="outline" size="sm" className={cn("h-8 bg-transparent", className)} onClick={onClick} disabled={pending || blockReason !== null} aria-label={`${text}: ${label}`}>
            {pending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> : <Icon className="mr-1.5 h-3.5 w-3.5" aria-hidden />}
            {text}
        </Button>
    )
    if (!blockReason || pending) return button
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <span tabIndex={0} className="inline-flex" data-testid="run-now-blocked">
                        {button}
                    </span>
                </TooltipTrigger>
                <TooltipContent>{blockReason}</TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}

/** Confirmação explícita do "Executar agora", com o escopo da execução no texto. */
export function RunNowDialog({
    open,
    onOpenChange,
    title,
    description,
    confirmLabel = "Executar agora",
    onConfirm,
    extraAction,
    children,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    title: ReactNode
    description: ReactNode
    confirmLabel?: string
    onConfirm: () => void
    /** Ação extra no rodapé (ex.: "Salvar e executar" com rascunho pendente). */
    extraAction?: { label: string; onClick: () => void }
    children?: ReactNode
}) {
    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription>{description}</AlertDialogDescription>
                </AlertDialogHeader>
                {children}
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    {extraAction ? <AlertDialogAction onClick={extraAction.onClick}>{extraAction.label}</AlertDialogAction> : <AlertDialogAction onClick={onConfirm}>{confirmLabel}</AlertDialogAction>}
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
