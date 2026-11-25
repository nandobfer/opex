"use client"

import { AgentPage } from "@/features/agent-metrics/components/AgentPage"
import { SecretaryMemories } from "./SecretaryMemories"

export function SecretaryMetricsPage() {
    return <AgentPage agent="secretario" tabs={[{ value: "memorias", label: "Memórias", render: () => <SecretaryMemories /> }]} />
}
