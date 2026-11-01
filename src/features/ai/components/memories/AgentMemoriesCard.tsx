"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AI_AGENTS, isCentralScopedAgent, isClientScopedAgent, memoryChannelOf, type AiAgentId } from "../../agents"
import { agentMemoriesSource, centralMemoriesSource, clientMemoriesSource } from "../../hooks/useMemories"
import { MemoryNetworkView } from "./MemoryNetworkView"

/**
 * Card de uma lista de memórias do agente (um canal do Engramind), mostrada como o universo do canal
 * na rede (OPE-109): alimenta e treina o agente com instruções permanentes. Salva sozinho (cada memória grava na hora). O tempo real
 * (`useMemoriesRealtime`) fica com quem monta os cards. `centralId`/`clientId` escolhem a central ou o
 * cliente nas listas com escopo; `action` entra no cabeçalho (ex.: o seletor de cliente).
 */
export function AgentMemoriesCard({ agentId, centralId, clientId, action }: { agentId: AiAgentId; centralId?: string; clientId?: string; action?: React.ReactNode }) {
    const agent = AI_AGENTS[agentId]
    const source = isCentralScopedAgent(agentId) && centralId ? centralMemoriesSource(centralId) : isClientScopedAgent(agentId) && clientId ? clientMemoriesSource(agentId, clientId) : agentMemoriesSource(agentId, !isClientScopedAgent(agentId))
    const channel = memoryChannelOf(agentId, { centralId, clientId })
    return (
        <Card data-testid={`memories-card-${agentId}`}>
            <CardHeader>
                <CardTitle className="text-base">{agent.title}</CardTitle>
                <CardDescription>
                    {agent.description} Use para alimentar e treinar o agente. Passe o mouse ou toque numa memória para ver o card com as ações.
                </CardDescription>
                {action}
            </CardHeader>
            <CardContent>
                {isClientScopedAgent(agentId) && !clientId ? (
                    <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Escolha um cliente para ver e editar as memórias dele.</p>
                ) : (
                    <MemoryNetworkView source={source} channel={channel ?? agentId} canEdit />
                )}
            </CardContent>
        </Card>
    )
}
