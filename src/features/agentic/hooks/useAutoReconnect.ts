"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createReconnectCycle, type ReconnectCycle, type ReconnectOutcome } from "../reconnect"

/** Aviso quando as tentativas automáticas se esgotaram sem sucesso. */
export const AUTO_RECONNECT_EXHAUSTED_NOTICE = "A reconexão automática não funcionou — use Reconectar para tentar de novo."
/** Aviso quando a resposta é definitiva: não há execução para acompanhar. */
export const AUTO_RECONNECT_NOTHING_NOTICE = "Não há execução para acompanhar nesta sessão do OpenCode."

export interface AutoReconnectOptions {
    /** A ação Reconectar está sendo oferecida agora (estado falho/interrompido, com sessão e sem Parar). */
    eligible: boolean
    /** Identifica o episódio de queda: um turno novo muda a chave e libera um novo ciclo. */
    episodeKey: string
    /** Executa uma tentativa e devolve o desfecho observado (`null` = transitório). */
    attempt: () => Promise<ReconnectOutcome | null>
}

export interface AutoReconnectState {
    /** Uma série de tentativas está em andamento (indicador "Reconectando…"). */
    reconnecting: boolean
    /** Aviso discreto do fim do ciclo sem sucesso (ou de que não há o que acompanhar). */
    notice: string | null
    /** Tenta agora (clique manual): tenta na hora e reinicia a contagem. */
    retryNow: () => void
}

/**
 * Ciclo automático de reconexão (mesa de trabalho e refinamento): dispara sozinho as tentativas na
 * agenda `1s → 2s → 4s → 8s → 16s` quando o estado passa a oferecer Reconectar, e também ao abrir
 * a tela já nesse estado. Para no sucesso, na resposta definitiva e ao esgotar; nunca reinicia por
 * uma oscilação de estado do mesmo episódio (um ciclo por queda).
 */
export function useAutoReconnect({ eligible, episodeKey, attempt }: AutoReconnectOptions): AutoReconnectState {
    const [reconnecting, setReconnecting] = useState(false)
    const [notice, setNotice] = useState<string | null>(null)
    const attemptRef = useRef(attempt)
    const episodeRef = useRef<string | null>(null)
    const cycleRef = useRef<ReconnectCycle | null>(null)

    // Mantém a tentativa mais recente sem recriar o ciclo a cada render.
    useEffect(() => {
        attemptRef.current = attempt
    })

    // Um ciclo por montagem (sobrevive aos re-renders; encerrado na desmontagem).
    useEffect(() => {
        const cycle = createReconnectCycle({
            attempt: () => attemptRef.current(),
            onUpdate: ({ reconnecting: active }) => setReconnecting(active),
            onResult: (result) => setNotice(result === "exhausted" ? AUTO_RECONNECT_EXHAUSTED_NOTICE : result === "nothing" ? AUTO_RECONNECT_NOTHING_NOTICE : null),
        })
        cycleRef.current = cycle
        return () => {
            cycle.stop()
            cycleRef.current = null
            episodeRef.current = null
        }
    }, [])

    useEffect(() => {
        const cycle = cycleRef.current
        if (!cycle) return
        if (!eligible) {
            // O agente voltou a ser acompanhado (ou o estado deixou de ser elegível): encerra o ciclo.
            cycle.stop()
            return
        }
        // Mesmo episódio (uma oscilação `running → falha` da recuperação): não reinicia a contagem.
        if (episodeRef.current === episodeKey) return
        episodeRef.current = episodeKey
        setNotice(null)
        cycle.start()
    }, [eligible, episodeKey])

    const retryNow = useCallback(() => {
        setNotice(null)
        cycleRef.current?.retryNow()
    }, [])

    return { reconnecting, notice, retryNow }
}
