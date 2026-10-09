"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useAiAgents, useAiModels } from "@/features/ai/hooks/useAi"
import { AGENT_ROLE_LABELS, AGENT_ROLES, type AgentRole } from "../../constants"
import type { AgentConfig } from "../../schemas"
import { AgentConfigFields } from "./AgentConfigFields"

interface AgentRolesCardProps {
    title: string
    description: string
    values: Record<AgentRole, AgentConfig | null>
    onChange: (role: AgentRole, next: AgentConfig | null) => void
    /** Padrões da aba: com eles, cada etapa pode herdar (`null`) ou personalizar. */
    inherited?: Record<AgentRole, AgentConfig>
    idPrefix: string
}

/** Agente/modelo/variante do OpenCode de cada etapa da mesa. */
export function AgentRolesCard({ title, description, values, onChange, inherited, idPrefix }: AgentRolesCardProps) {
    const agents = useAiAgents(true)
    const models = useAiModels("opencode")
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent className="divide-y">
                {AGENT_ROLES.map((role) => (
                    <section key={role} className="space-y-3 py-4 first:pt-0 last:pb-0" aria-labelledby={`${idPrefix}-${role}-title`}>
                        <div>
                            <h3 id={`${idPrefix}-${role}-title`} className="text-sm font-medium">
                                {AGENT_ROLE_LABELS[role].label}
                            </h3>
                            <p className="text-xs text-muted-foreground">{AGENT_ROLE_LABELS[role].description}</p>
                        </div>
                        <AgentConfigFields id={`${idPrefix}-${role}`} value={values[role]} onChange={(next) => onChange(role, next)} agents={agents} models={models} inherited={inherited?.[role]} />
                    </section>
                ))}
            </CardContent>
        </Card>
    )
}
