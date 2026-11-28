"use client"

import type { LucideIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

/** Botão de ícone (linhas do builder de Ambientes). */
export function EnvironmentActionButton({ label, icon: Icon, disabled, title, onClick }: { label: string; icon: LucideIcon; disabled?: boolean; title?: string; onClick: () => void }) {
    return (
        <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title={title ?? label} aria-label={label} disabled={disabled} onClick={onClick}>
            <Icon className="h-4 w-4" aria-hidden />
        </Button>
    )
}

/** Versão em execução (ou a implantada), no card do dono e no do portal. */
export function EnvironmentVersionBadge({ version }: { version: { text: string; live: boolean } | null }) {
    if (!version) return null
    return (
        <Badge variant="outline" className="font-mono text-xs" title={version.live ? "Versão do package.json do app em execução" : "Versão do código do último deploy"}>
            {version.text}
            {version.live ? "" : " (implantada)"}
        </Badge>
    )
}
