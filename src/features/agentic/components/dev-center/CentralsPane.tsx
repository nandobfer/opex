"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { FolderGit2, Settings2 } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { centralSettingsPath, DEV_CENTER_PATH } from "../../constants"
import { PANE_WIDTHS } from "../../dev-center-layout"
import type { CentralDto } from "../../types"
import { CollapsiblePane, PaneToggle } from "./CollapsiblePane"

interface CentralsPaneProps {
    centrals: CentralDto[]
    activeId: string | null
    collapsed: boolean
    wide: boolean
    onToggle: () => void
}

const LABEL = "lista de centrais"

/** Lista de centrais (uma por produto); a selecionada mostra as tarefas do produto. Recolhível. */
export function CentralsPane({ centrals, activeId, collapsed, wide, onToggle }: CentralsPaneProps) {
    return (
        <CollapsiblePane
            label={LABEL}
            width={PANE_WIDTHS.centrals}
            collapsed={collapsed}
            wide={wide}
            rail={
                <>
                    <PaneToggle label={LABEL} collapsed onToggle={onToggle} />
                    <nav aria-label="Centrais de desenvolvimento" className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto">
                        <TooltipProvider delayDuration={150}>
                            {centrals.map((central) => {
                                const active = central.id === activeId
                                return (
                                    <Tooltip key={central.id}>
                                        <TooltipTrigger asChild>
                                            <Link
                                                href={`${DEV_CENTER_PATH}/${central.id}`}
                                                aria-current={active ? "page" : undefined}
                                                aria-label={central.productName}
                                                className={cn("relative flex h-8 w-8 items-center justify-center rounded-md transition-colors", active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground")}
                                            >
                                                <FolderGit2 className="h-4 w-4" aria-hidden />
                                                {central.runningWorkbenches > 0 && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />}
                                            </Link>
                                        </TooltipTrigger>
                                        <TooltipContent side="right">{central.productName}</TooltipContent>
                                    </Tooltip>
                                )
                            })}
                        </TooltipProvider>
                    </nav>
                </>
            }
        >
            <div className="flex items-center justify-between gap-1 border-b py-2 pl-3 pr-1.5">
                <h2 className="text-sm font-semibold">Centrais</h2>
                <div className="flex items-center">
                    {activeId && (
                        <Link href={centralSettingsPath(activeId)} className="rounded p-1.5 text-muted-foreground hover:text-foreground" aria-label="Configurar a central" title="Configurar a central">
                            <Settings2 className="h-4 w-4" aria-hidden />
                        </Link>
                    )}
                    {wide && <PaneToggle label={LABEL} collapsed={false} onToggle={onToggle} />}
                </div>
            </div>
            <nav aria-label="Centrais de desenvolvimento" className="min-h-0 flex-1 overflow-y-auto p-1.5">
                {centrals.map((central) => {
                    const active = central.id === activeId
                    return (
                        <Link
                            key={central.id}
                            href={`${DEV_CENTER_PATH}/${central.id}`}
                            aria-current={active ? "page" : undefined}
                            className={cn("relative flex items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors", active ? "text-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground")}
                        >
                            {active && <motion.span layoutId="dev-center-central" className="absolute inset-0 rounded-md bg-primary/15" transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                            <FolderGit2 className={cn("relative h-4 w-4 shrink-0", active && "text-primary")} aria-hidden />
                            <span className="relative min-w-0 flex-1 truncate">{central.productName}</span>
                            {central.runningWorkbenches > 0 && (
                                <span className="relative rounded-full bg-primary px-1.5 font-mono text-[10px] text-primary-foreground" title="Mesas executando">
                                    {central.runningWorkbenches}
                                </span>
                            )}
                            {!central.config.enabled && <span className="relative text-[10px] text-muted-foreground">off</span>}
                        </Link>
                    )
                })}
            </nav>
        </CollapsiblePane>
    )
}
