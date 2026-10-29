"use client"

import { Loader2, type LucideIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { HEALTH_LABELS, type EnvironmentHealth } from "../view"

/** Botão de ícone das linhas de ambiente (tela do dono e portal do cliente). */
export function EnvironmentActionButton({ label, icon: Icon, disabled, title, onClick }: { label: string; icon: LucideIcon; disabled?: boolean; title?: string; onClick: () => void }) {
    return (
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title={title ?? label} aria-label={label} disabled={disabled} onClick={onClick}>
            <Icon className="h-4 w-4" aria-hidden />
        </Button>
    )
}

const HEALTH_CLASS: Record<EnvironmentHealth, string> = { running: "text-success", partial: "text-warning", stopped: "text-muted-foreground", never: "text-muted-foreground" }

/** Estado do ambiente ("No ar", "Implantando"…) e a versão em execução (ou a implantada). */
export function EnvironmentStatusBadges({ health, deploying, version }: { health: EnvironmentHealth; deploying: boolean; version: { text: string; live: boolean } | null }) {
    return (
        <>
            <Badge variant="outline" className={cn("gap-1", HEALTH_CLASS[health])}>
                {deploying && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
                {deploying ? "Implantando" : HEALTH_LABELS[health]}
            </Badge>
            {version && (
                <Badge variant="outline" className="font-mono text-xs" title={version.live ? "Versão do package.json do app em execução" : "Versão do código do último deploy"}>
                    {version.text}
                    {version.live ? "" : " (implantada)"}
                </Badge>
            )}
        </>
    )
}
