"use client"

import type { Dispatch, SetStateAction } from "react"
import { GeneralCard } from "@nandobfer/integracoes/react"
import type { Draft } from "@nandobfer/integracoes/react"
import { ActivationCard } from "../ActivationCard"

/**
 * Aba "Geral": ambiente, modo debug e "Integração ativa" da Builder Machine (salvos junto com a
 * configuração do PC). Desativada (como salva), é tudo o que a página mostra.
 */
export function GeneralTab({ draft, setDraft, savedActive }: { draft: Draft; setDraft: Dispatch<SetStateAction<Draft>>; savedActive: boolean }) {
    return (
        <>
            <GeneralCard draft={draft} setDraft={setDraft} />
            <ActivationCard draft={draft} setDraft={setDraft} savedActive={savedActive} />
        </>
    )
}
