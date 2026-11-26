"use client"

import { useOpexView } from "../../hooks/useOpexSettings"
import { useCreateOpexSession } from "../../hooks/useOpexSessions"
import { useOpexUploads } from "../../hooks/useOpexUploads"
import { useMoveComposerDraft } from "../../hooks/useComposerDraft"
import { OPEX_DRAFT_TAB } from "../../hooks/useOpexTabs"
import { DEFAULT_OPEX_AGENT_SETTINGS } from "../../schemas"
import { OpexComposer } from "./OpexComposer"
import { OpexDropZone } from "./OpexDropZone"
import { OpexEmptyChat } from "./OpexEmptyChat"
import { OpexUnavailable } from "./OpexChat"
import { useOpexScope } from "../OpexScopeProvider"

/**
 * Nova sessão ainda não criada: a primeira mensagem cria a sessão e abre a aba dela. Anexar um
 * arquivo também cria a sessão na hora (o envio precisa dela); o rascunho digitado vai junto para a aba
 * da sessão criada (OPE-195).
 */
export function OpexDraftChat({ onCreated, model, focusKey }: { onCreated: (sessionId: string) => void; model?: { model: string; variant: string | null } | null; focusKey?: number }) {
    const { agent } = useOpexScope()
    const view = useOpexView()
    const create = useCreateOpexSession()
    const uploads = useOpexUploads(null)
    const moveDraft = useMoveComposerDraft()
    const availability = view.data?.availability
    const disabledReason = availability && !availability.available ? (availability.reason ?? `O ${agent.label} não está disponível`) : null
    const limits = view.data?.files ?? DEFAULT_OPEX_AGENT_SETTINGS.files

    const start = (text: string) => create.mutate({ text, model }, { onSuccess: ({ session }) => onCreated(session.id) })
    const attach = (files: File[]) => {
        if (create.isPending) return
        create.mutate({ model }, {
            onSuccess: ({ session }) => {
                uploads.enqueue(session.id, files, limits)
                moveDraft(OPEX_DRAFT_TAB, session.id)
                onCreated(session.id)
            },
        })
    }

    return (
        <OpexDropZone onFiles={attach} disabled={Boolean(disabledReason) || !agent.attachments}>
            {disabledReason && <OpexUnavailable reason={disabledReason} />}
            <OpexEmptyChat onPick={start} disabled={Boolean(disabledReason) || create.isPending} />
            <OpexComposer
                onSend={start}
                attachments={{ items: [], onFiles: attach, onRetry: () => undefined, onRemove: () => undefined, enabled: agent.attachments }}
                onStop={() => undefined}
                running={false}
                sending={create.isPending}
                stopping={false}
                disabledReason={disabledReason}
                draftId={OPEX_DRAFT_TAB}
                focusKey={focusKey}
            />
        </OpexDropZone>
    )
}
