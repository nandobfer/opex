"use client"

import { createContext, useContext, useMemo } from "react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useCentrals } from "@/features/agentic/hooks/useAgentic"
import { cn } from "@/lib/utils"
import { centralChannelLabels, channelNameParts, type ChannelLabel } from "../../network/channel-labels"

const ChannelLabelsContext = createContext<ReadonlyMap<string, ChannelLabel>>(new Map())

/**
 * Rótulos legíveis dos canais por central (sigla do repositório + nome na dica), lidos das centrais
 * do desenvolvimento agêntico. `enabled = false` não busca nada (ex.: universo sem canal de central).
 */
export function ChannelLabelsProvider({ enabled = true, children }: { enabled?: boolean; children: React.ReactNode }) {
    const centrals = useCentrals(enabled)
    const labels = useMemo(() => centralChannelLabels(Array.isArray(centrals.data) ? centrals.data : []), [centrals.data])
    return <ChannelLabelsContext.Provider value={labels}>{children}</ChannelLabelsContext.Provider>
}

const SIZES = {
    node: { prefix: "text-[10px]", title: "text-sm" },
    center: { prefix: "text-[10px]", title: "text-sm" },
    legend: { prefix: "text-[9px]", title: "text-xs" },
} as const

/**
 * Nome do canal em duas linhas: o prefixo até a última `/` discreto em cima e a ponta final como
 * título destacado (canal de central: a sigla do repositório, com o nome na dica). O slug inteiro
 * aparece ao passar o mouse.
 */
export function ChannelName({ slug, size = "node", className, titleClassName }: { slug: string; size?: keyof typeof SIZES; className?: string; titleClassName?: string }) {
    const labels = useContext(ChannelLabelsContext)
    const { prefix, title, hint } = channelNameParts(slug, labels)
    const sizes = SIZES[size]
    const titleText = (
        <span data-testid="channel-name-title" data-hint={hint ?? undefined} className={cn("truncate font-medium text-foreground", sizes.title, titleClassName)}>
            {title}
        </span>
    )
    return (
        <span data-testid={`channel-name-${slug}`} title={hint ? undefined : slug} className={cn("flex min-w-0 flex-col leading-tight", className)}>
            {prefix && (
                <span data-testid="channel-name-prefix" className={cn("truncate text-muted-foreground/70", sizes.prefix)}>
                    {prefix}
                </span>
            )}
            {hint ? (
                <TooltipProvider delayDuration={200}>
                    <Tooltip>
                        <TooltipTrigger asChild>{titleText}</TooltipTrigger>
                        <TooltipContent className="text-xs">
                            <span className="block font-medium">{hint}</span>
                            <span className="block text-muted-foreground">{slug}</span>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            ) : (
                titleText
            )}
        </span>
    )
}
