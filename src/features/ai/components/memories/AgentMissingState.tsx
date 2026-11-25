"use client"

import Link from "next/link"
import { UserX } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/feedback/EmptyState"
import type { MemoryIdentity } from "../../agents"
import { useProvisionAgent, type AgentMemoryStatusDto } from "../../hooks/useAgentProvision"

/**
 * Agente de memórias que não existe (ou está desativado) no Engramind, no lugar do universo. Quando não existe, o
 * dono cadastra ali mesmo ("Cadastrar agente no Engramind"); desativado é ação de gestão, na aba Identidades.
 */
export function AgentMissingState({ consumer, status }: { consumer: MemoryIdentity; status: AgentMemoryStatusDto }) {
    const provision = useProvisionAgent(consumer)
    if (status.disabled) {
        return <EmptyState icon={UserX} title="Agente desativado no Engramind" description="Os tokens deste agente não autenticam enquanto ele estiver desativado. Reative-o na aba Identidades do Engramind.">
            <Button asChild size="sm" variant="outline"><Link href="/integracoes/engramind?aba=identidades">Abrir Identidades</Link></Button>
        </EmptyState>
    }
    return <div data-testid="agent-universe-missing">
        <EmptyState icon={UserX} title="Agente não encontrado no Engramind" description="O agente ainda não foi cadastrado no Engramind (ou foi removido).">
            <Button size="sm" disabled={provision.isPending} onClick={() => provision.mutate()}>{provision.isPending ? "Cadastrando…" : provision.isError ? "Tentar novamente" : "Cadastrar agente no Engramind"}</Button>
            {provision.isError && <p role="alert" className="text-xs text-destructive">{provision.error.message}</p>}
        </EmptyState>
    </div>
}
