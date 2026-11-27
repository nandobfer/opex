"use client"

import { AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { useEvolution } from "@/features/evolution-api/hooks/useEvolution"
import type { EvolutionContactDto } from "@/features/evolution-api/types"
import { DEFAULT_SECRETARY_SETTINGS, type SecretarySettings } from "../../schemas"
import { SECRETARY_CHAT_CONTACTS_PATH, SECRETARY_SETTINGS_ENDPOINT, useSecretaryRealtime } from "../../hooks/useSecretaryRealtime"
import { INBOX_HEIGHT, LIST_COLUMN } from "./chat-layout"
import { ConversationsInbox } from "./ConversationsInbox"

/**
 * Aba Conversas da página `/agente-secretario` (OPE-207): o mesmo `ConversationsInbox` de Integrações › IA › Agente
 * Secretário › Conversas, com o tempo real do Secretário e a pausa (`pauseMinutes`) da configuração salva.
 */
export function SecretaryConversationsTab() {
    useSecretaryRealtime()
    const config = useEvolution<{ settings: SecretarySettings }>(SECRETARY_SETTINGS_ENDPOINT)
    const contacts = useEvolution<EvolutionContactDto[]>(SECRETARY_CHAT_CONTACTS_PATH)
    if (config.isPending) return <SecretaryConversationsSkeleton />
    if (config.isError) {
        return (
            <div className={cn("flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-card px-6 text-center", INBOX_HEIGHT)} role="alert">
                <AlertCircle className="h-10 w-10 text-destructive" aria-hidden />
                <p className="text-sm text-muted-foreground">Não foi possível carregar a configuração do Secretário.</p>
                <Button variant="outline" onClick={() => void config.refetch()}>Tentar novamente</Button>
            </div>
        )
    }
    const minutes = config.data?.settings.pauseMinutes ?? DEFAULT_SECRETARY_SETTINGS.pauseMinutes
    return <ConversationsInbox minutes={minutes} contacts={contacts.data ?? []} />
}

/** Mesma estrutura do inbox: lista à esquerda e conversa à direita, na altura do card. */
export function SecretaryConversationsSkeleton() {
    return (
        <div className={cn("flex overflow-hidden rounded-lg border border-border bg-card", INBOX_HEIGHT)} data-testid="secretary-inbox-skeleton">
            <div className={cn("flex flex-1 flex-col gap-3 border-r border-border p-3 md:flex-none md:shrink-0", LIST_COLUMN)}>
                <Skeleton className="h-9" />
                {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-14" />)}
            </div>
            <div className="hidden flex-1 md:block">
                <Skeleton className="h-full w-full rounded-none" />
            </div>
        </div>
    )
}
