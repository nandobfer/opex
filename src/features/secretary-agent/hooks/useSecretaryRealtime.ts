"use client"

import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { acquireChannel, releaseChannel } from "@/lib/pusher/client"
import { appChannel } from "@/lib/pusher/channel-names"
import { EVOLUTION_QUERY_KEY } from "@/features/evolution-api/constants"
import { useEvolutionRealtime } from "@/features/evolution-api/hooks/useEvolution"
import { SECRETARY_ANALYSIS_EVENT, SECRETARY_CONVERSATION_EVENT, SECRETARY_DECISION_EVENT, SECRETARY_NOTICES_EVENT, SECRETARY_PERSONALITY_EVENT } from "../constants"

/** Configuração do Secretário (mesma chave do formulário de Integrações › IA e da aba Conversas da página do agente). */
export const SECRETARY_SETTINGS_ENDPOINT = "/ai/features/secretary-agent"
/** Contatos das conversas, compartilhados pelas duas telas. */
export const SECRETARY_CHAT_CONTACTS_PATH = "/evolution/contacts?kind=chats"

const EVENTS = [SECRETARY_ANALYSIS_EVENT, SECRETARY_CONVERSATION_EVENT, SECRETARY_DECISION_EVENT, SECRETARY_NOTICES_EVENT, SECRETARY_PERSONALITY_EVENT, "ai-feature-updated", "pusher:subscription_succeeded"]

/**
 * Tempo real do Secretário (`private-app`): os eventos do agente recarregam a configuração e todo `/secretary/*`; os da
 * Evolution, os contatos. Usado em Integrações › IA › Agente Secretário e na aba Conversas de `/agente-secretario`.
 */
export function useSecretaryRealtime() {
    const cache = useQueryClient()
    useEvolutionRealtime()
    useEffect(() => {
        const name = appChannel()
        const channel = acquireChannel(name)
        if (!channel) return
        const refresh = () => {
            void cache.invalidateQueries({ predicate: ({ queryKey }) => queryKey[0] === EVOLUTION_QUERY_KEY && (queryKey[1] === SECRETARY_SETTINGS_ENDPOINT || String(queryKey[1]).startsWith("/secretary/")) })
        }
        EVENTS.forEach((event) => channel.bind(event, refresh))
        return () => {
            EVENTS.forEach((event) => channel.unbind(event, refresh))
            releaseChannel(name)
        }
    }, [cache])
}
