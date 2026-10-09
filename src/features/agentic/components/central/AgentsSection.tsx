"use client"

import { useWatch } from "react-hook-form"
import { Skeleton } from "@/components/ui/skeleton"
import { useAgenticSettings } from "../../hooks/useAgentic"
import { AgentRolesCard } from "../settings/AgentRolesCard"
import type { CentralForm } from "./form"

/** Aba Agentes: cada etapa herda o agente padrão da aba ou é personalizada nesta central. */
export function AgentsSection({ form }: { form: CentralForm }) {
    const settings = useAgenticSettings()
    const agents = useWatch({ control: form.control, name: "agents" })
    if (!settings.data) return <Skeleton className="h-96 w-full" />
    return (
        <AgentRolesCard
            title="Agentes da central"
            description="Personalize uma etapa só quando este produto precisar de outro agente ou modelo."
            idPrefix="central-agent"
            values={agents}
            inherited={settings.data.settings.agents}
            onChange={(role, next) => form.setValue(`agents.${role}`, next, { shouldDirty: true, shouldValidate: true })}
        />
    )
}
