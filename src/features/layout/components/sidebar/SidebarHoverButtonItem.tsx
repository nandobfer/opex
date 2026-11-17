"use client"

import { useEffect, useId, type MouseEvent, type ReactNode } from "react"
import { usePathname } from "next/navigation"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { useHoverPopover } from "@/hooks/useHoverPopover"
import { SidebarItemSurface } from "./SidebarItemSurface"
import { SidebarHoverPanel } from "./SidebarHoverPanel"
import { SidebarTooltip } from "./SidebarTooltip"
import { SIDEBAR_FOCUS_RING } from "./sidebar-styles"
import { HeaderIconButton } from "../header/HeaderIconButton"
import { useMobileHeaderFloating } from "../header/mobile-header-context"

interface SidebarHoverButtonItemProps {
    /** Nome do item: tooltip e `aria-label` (barra recolhida) e título do painel. */
    label: string
    /** Texto da linha na gaveta (expandida); padrão: `label`. */
    drawerLabel?: string
    icon: LucideIcon
    collapsed: boolean
    reduceMotion: boolean
    /** Marcadores sobre o ícone (ex.: bolinhas de status). */
    indicator?: ReactNode
    /** Conteúdo do painel (montado só com o painel aberto). */
    panel: ReactNode
    panelWidthClassName?: string
    testId: string
    /**
     * `"header"`: botão de ícone do cabeçalho do celular (OPE-168), sem `<li>`, com o painel abaixo e
     * alinhado à direita. Padrão: item do menu lateral.
     */
    variant?: "sidebar" | "header"
}

/**
 * Item do menu que **não navega**: um botão que abre um painel por hover (`useHoverPopover`), clique,
 * toque e teclado (Enter/Espaço focam o primeiro botão ou link; setas percorrem; Esc fecha e devolve
 * o foco). Barra recolhida: painel à direita, com tooltip; gaveta: linha com o rótulo e painel abaixo.
 */
export function SidebarHoverButtonItem({ label, drawerLabel, icon: Icon, collapsed, reduceMotion, indicator, panel, panelWidthClassName, testId, variant = "sidebar" }: SidebarHoverButtonItemProps) {
    const pathname = usePathname()
    const { open, setOpen, toggle, triggerHandlers, panelHandlers, openedByHover } = useHoverPopover()
    const panelId = useId()
    const floating = useMobileHeaderFloating()
    const header = variant === "header"

    useEffect(() => {
        setOpen(false)
    }, [pathname, setOpen])

    const icon = (
        <span className="relative inline-flex">
            <Icon className="h-5 w-5 shrink-0" aria-hidden />
            {indicator}
        </span>
    )
    const onClick = (event: MouseEvent) => {
        event.preventDefault()
        toggle()
    }

    const panelNode = (
        <SidebarHoverPanel
            open={open}
            label={label}
            collapsed={collapsed}
            reduceMotion={reduceMotion}
            openedByHover={openedByHover}
            panelHandlers={panelHandlers}
            widthClassName={panelWidthClassName}
            testId={`${testId}-panel`}
            id={panelId}
            focusSelector="button:not([disabled]), a[href]"
            side={header ? "bottom" : undefined}
            align={header ? "end" : undefined}
        >
            {panel}
        </SidebarHoverPanel>
    )

    if (header) {
        return (
            <div data-testid={testId}>
                <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
                    <PopoverPrimitive.Trigger asChild>
                        <HeaderIconButton
                            aria-label={label}
                            title={label}
                            aria-expanded={open}
                            aria-controls={open ? panelId : undefined}
                            floating={floating}
                            active={open}
                            onClick={onClick}
                            data-testid={`${testId}-trigger`}
                            {...triggerHandlers}
                        >
                            {icon}
                        </HeaderIconButton>
                    </PopoverPrimitive.Trigger>
                    {panelNode}
                </PopoverPrimitive.Root>
            </div>
        )
    }

    return (
        <li data-testid={testId}>
            <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
                <SidebarTooltip label={label} enabled={collapsed} suppressed={open}>
                    <PopoverPrimitive.Trigger asChild>
                        <button
                            type="button"
                            aria-label={label}
                            aria-expanded={open}
                            aria-controls={open ? panelId : undefined}
                            className={cn("block w-full rounded-[4px]", SIDEBAR_FOCUS_RING)}
                            onClick={onClick}
                            data-testid={`${testId}-trigger`}
                            {...triggerHandlers}
                        >
                            <SidebarItemSurface active={open} activeBar={false} collapsed={collapsed} reduceMotion={reduceMotion}>
                                {icon}
                                {!collapsed && <span className="min-w-0 flex-1 truncate text-left">{drawerLabel ?? label}</span>}
                            </SidebarItemSurface>
                        </button>
                    </PopoverPrimitive.Trigger>
                </SidebarTooltip>
                {panelNode}
            </PopoverPrimitive.Root>
        </li>
    )
}
