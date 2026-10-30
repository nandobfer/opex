"use client"

import type { ReactNode } from "react"
import { AlertTriangle } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import type { OpexToolRisk } from "../../tool-tree"

export const RISK_BADGES: Record<OpexToolRisk, { label: string; className: string }> = {
    read: { label: "Leitura", className: "bg-muted text-muted-foreground" },
    write: { label: "Altera", className: "bg-primary/10 text-primary" },
    destructive: { label: "Destrutiva", className: "bg-warning/15 text-warning" },
}

interface ToolConfirmMetaProps {
    /** Id do switch (único na tela). */
    id: string
    /** Nome técnico exibido em `code`. */
    name: string
    label: string
    risk: OpexToolRisk
    confirms: boolean
    /** Difere do padrão ("· personalizado"). */
    custom: boolean
    onChange: (confirms: boolean) => void
    /** Selos extras depois do risco (ex.: "Sempre ligada"). */
    badges?: ReactNode
}

/**
 * Nome técnico, selo de risco e o switch "Pede confirmação" de uma ferramenta — usado na árvore de
 * Ferramentas do Agente Opex e na lista de ferramentas de cada MCP.
 */
export function ToolConfirmMeta({ id, name, label, risk, confirms, custom, onChange, badges }: ToolConfirmMetaProps) {
    const badge = RISK_BADGES[risk]
    return (
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            <code className="text-[10px] text-muted-foreground">{name}</code>
            <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", badge.className)}>{badge.label}</span>
            {badges}
            <span className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                <Switch id={id} checked={confirms} onCheckedChange={onChange} className="scale-75" aria-label={`${label}: pede confirmação`} />
                <label htmlFor={id} className="cursor-pointer">
                    Pede confirmação
                </label>
                {custom && <span className="font-semibold text-primary">· personalizado</span>}
            </span>
            {risk === "destructive" && !confirms && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-warning" role="note">
                    <AlertTriangle className="h-3 w-3" aria-hidden /> Ação destrutiva sem confirmação
                </span>
            )}
        </span>
    )
}
