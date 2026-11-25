"use client"

import Link from "next/link"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useEvolution, useEvolutionAction } from "../hooks/useEvolution"
import type { EvolutionInstancesDto } from "../types"

/** Resultado do `POST /evolution/contacts` (sincronização de contatos, grupos e conversas). */
interface SyncResult { contacts: number; groups: number; chats: number }

/**
 * Sincronizar contatos, grupos e conversas da Evolution (fotos e nomes). Compartilhado pela aba Operações da integração,
 * pela aba Conversas do Agente Secretário e pelos seletores de conversa vazios. Sem instância escolhida, leva à aba
 * Instância da integração.
 */
export function EvolutionSyncAction({ instance, label = "Sincronizar contatos e conversas" }: { instance?: string | null; label?: string }) {
    const instances = useEvolution<EvolutionInstancesDto>("/evolution/instances", instance === undefined)
    const sync = useEvolutionAction<SyncResult>("/evolution/contacts", "post", "Contatos e conversas sincronizados")
    const current = instance === undefined ? instances.data?.defaultInstance : instance
    if (instance === undefined && instances.isPending) return null
    if (!current) {
        return <p className="text-sm text-muted-foreground">
            Escolha a instância do WhatsApp para sincronizar. <Link className="text-primary underline" href="/integracoes/evolution-api?aba=instancia">Abrir a integração Evolution API</Link>
        </p>
    }
    return <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" disabled={sync.isPending} onClick={() => sync.mutate(undefined)}>
            <RefreshCw className={sync.isPending ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} aria-hidden /> {sync.isPending ? "Sincronizando…" : label}
        </Button>
        {sync.data && <span className="text-sm text-muted-foreground" role="status">{sync.data.chats} conversas, {sync.data.contacts} contatos e {sync.data.groups} grupos</span>}
    </div>
}
