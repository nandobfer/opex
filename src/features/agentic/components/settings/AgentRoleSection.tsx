"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { AGENT_ROLE_LABELS, type AgentRole } from "../../constants"

interface AgentRoleSectionProps {
    id: string
    role: AgentRole
    /** Título no lugar do rótulo do papel (ex.: "Este fork"). */
    title?: string
    /** Ao lado do título (ex.: "Etapa atual", indicador de gravação). */
    badge?: ReactNode
    /** Descrição no lugar da padrão do papel. */
    description?: string
    className?: string
    children: ReactNode
}

/**
 * Seção de uma etapa (título, descrição do papel e campos): usada nos agentes das Configurações
 * Padrão e da central (`AgentRolesCard`) e na configuração de modelos da mesa e do fork.
 */
export function AgentRoleSection({ id, role, title, badge, description, className, children }: AgentRoleSectionProps) {
    return (
        <section className={cn("space-y-3 py-4 first:pt-0 last:pb-0", className)} aria-labelledby={`${id}-title`}>
            <div>
                <div className="flex min-w-0 items-center gap-2">
                    <h3 id={`${id}-title`} className="text-sm font-medium">
                        {title ?? AGENT_ROLE_LABELS[role].label}
                    </h3>
                    {badge}
                </div>
                <p className="text-xs text-muted-foreground">{description ?? AGENT_ROLE_LABELS[role].description}</p>
            </div>
            {children}
        </section>
    )
}
