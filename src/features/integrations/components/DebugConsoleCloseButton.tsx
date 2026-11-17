"use client"

import { forwardRef, type ComponentPropsWithoutRef } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

type DebugConsoleCloseButtonProps = Omit<ComponentPropsWithoutRef<typeof Button>, "children">

/**
 * "Fechar" (X) da barra do console de logs, compartilhado pela janela de logs e pela coluna de
 * debug do formulário. Repassa ref e props ao botão, então funciona dentro de `DialogClose asChild`.
 */
export const DebugConsoleCloseButton = forwardRef<HTMLButtonElement, DebugConsoleCloseButtonProps>(
    function DebugConsoleCloseButton({ className, ...props }, ref) {
        return (
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            ref={ref}
                            type="button"
                            variant="ghost"
                            size="icon"
                            className={className ?? "h-8 w-8"}
                            aria-label="Fechar"
                            {...props}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Fechar</TooltipContent>
                </Tooltip>
            </TooltipProvider>
        )
    },
)
