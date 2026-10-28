"use client"

import type { Dispatch, SetStateAction } from "react"
import { GeneralCard } from "@/features/integrations/components/detail/GeneralCard"
import type { Draft } from "@/features/integrations/components/detail/draft"
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
