"use client"

import { useState } from "react"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useOrcamentoClients } from "@/features/orcamentos/hooks/useOrcamentos"
import type { AiAgentId } from "../../agents"
import { AgentMemoriesCard } from "./AgentMemoriesCard"

/**
 * Memórias de um cliente específico (Agente Opex ou Agente Maddox): o dono escolhe o cliente e vê as
 * memórias que valem só no portal dele — inclusive as que o agente do portal gravou sozinho.
 */
export function ClientMemoriesCard({ agentId }: { agentId: Extract<AiAgentId, "opex-client-specific" | "maddox-client-specific"> }) {
    const clients = useOrcamentoClients()
    const [clientId, setClientId] = useState<string | null>(null)
    const id = `${agentId}-client`
    const picker = (
        <div className="space-y-1 pt-2">
            <Label htmlFor={id} className="text-xs font-semibold">
                Cliente
            </Label>
            <Select value={clientId ?? undefined} onValueChange={setClientId} disabled={clients.isLoading || !clients.data?.length}>
                <SelectTrigger id={id} className="w-full bg-transparent">
                    <SelectValue placeholder={clients.isLoading ? "Carregando clientes…" : clients.data?.length ? "Escolha o cliente" : "Nenhum cliente cadastrado"} />
                </SelectTrigger>
                <SelectContent>
                    {(clients.data ?? []).map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                            {client.name}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    )
    return <AgentMemoriesCard agentId={agentId} clientId={clientId ?? undefined} action={picker} />
}
