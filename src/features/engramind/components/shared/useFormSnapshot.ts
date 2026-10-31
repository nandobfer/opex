"use client"

import { useState } from "react"

/**
 * Base estável de um formulário alimentado por uma consulta que refaz sozinha (tempo real, foco,
 * reconexão). O formulário só remonta quando o CONTEÚDO muda e não há alterações pendentes; com
 * rascunho, a base antiga fica (as chaves mudadas por fora não viram "alterações") e `stale` avisa
 * para recarregar. `reload` adota os dados atuais (descarta o rascunho ou acompanha um salvamento).
 */
export function useFormSnapshot<T>(data: T | undefined, dirty: boolean) {
    const [snapshot, setSnapshot] = useState<T | undefined>(data)
    const current = snapshot === undefined ? data : snapshot
    const signature = JSON.stringify(data ?? null)
    const appliedSignature = JSON.stringify(current ?? null)
    const changed = data !== undefined && signature !== appliedSignature
    // Ajuste durante a renderização (padrão do React para estado derivado de props), sem efeito em cascata.
    if (data !== undefined && (snapshot === undefined || (changed && !dirty))) setSnapshot(data)
    return { data: current, key: appliedSignature, stale: changed && dirty, reload: () => setSnapshot(data) }
}
