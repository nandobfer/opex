"use client"

import type { Dispatch, SetStateAction } from "react"
import type { Draft } from "@nandobfer/integracoes/react"
import { ActivationCard } from "../ActivationCard"

/**
 * Aba "Geral": "Integração ativa" da Builder Machine (salva junto com a configuração do PC).
 * Desativada (como salva), é tudo o que a página mostra.
 */
export function GeneralTab({ draft, setDraft, savedActive }: { draft: Draft; setDraft: Dispatch<SetStateAction<Draft>>; savedActive: boolean }) {
    return <ActivationCard draft={draft} setDraft={setDraft} savedActive={savedActive} />
}
