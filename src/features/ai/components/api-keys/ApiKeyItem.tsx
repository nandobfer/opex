"use client"

import { useState } from "react"
import { RefreshCcw } from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { toast } from "sonner"
import { ActiveItemRow } from "@/components/list/ActiveItemRow"
import { InlineRenameField } from "@/components/list/InlineRenameField"
import { Button } from "@/components/ui/button"
import { renameAiApiKeySchema, type AiApiKeyDto, type AiApiKeyProviderId } from "../../api-keys"
import { useActivateAiApiKey, useUpdateAiApiKey } from "../../hooks/useAiApiKeys"
import { RemoveApiKeyDialog } from "./RemoveApiKeyDialog"

interface ApiKeyItemProps {
    provider: AiApiKeyProviderId
    providerName: string
    apiKey: AiApiKeyDto
    /** Há outras chaves no provedor (a em uso não pode ser removida sem eleger outra). */
    hasOthers: boolean
    onReplaceSecret: (apiKey: AiApiKeyDto) => void
}

/** Uma chave de API: em uso, usar, substituir o segredo, renomear (inline) e remover (com confirmação). */
export function ApiKeyItem({ provider, providerName, apiKey, hasOthers, onReplaceSecret }: ApiKeyItemProps) {
    const activate = useActivateAiApiKey(provider)
    const rename = useUpdateAiApiKey(provider, "Chave renomeada")
    const [renaming, setRenaming] = useState(false)
    const [removing, setRemoving] = useState(false)

    const requestRemove = () => {
        if (apiKey.active && hasOthers) {
            toast.error("Esta é a chave em uso: ative outra chave antes de removê-la")
            return
        }
        setRemoving(true)
    }

    return (
        <ActiveItemRow
            label={apiKey.name}
            sublabel={`Segredo definido · criada em ${format(new Date(apiKey.createdAt), "dd/MM/yyyy", { locale: ptBR })}`}
            active={apiKey.active}
            activateLabel="Usar esta chave"
            activateDisabled={activate.isPending}
            onActivate={() => activate.mutate(apiKey.id)}
            onRename={() => setRenaming(true)}
            onRemove={requestRemove}
            actions={
                <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label={`Substituir o segredo de ${apiKey.name}`} title="Substituir segredo" onClick={() => onReplaceSecret(apiKey)}>
                    <RefreshCcw className="h-4 w-4" aria-hidden />
                </Button>
            }
            editing={
                renaming ? (
                    <InlineRenameField
                        defaultValue={apiKey.name}
                        label="Nome da chave"
                        schema={renameAiApiKeySchema.shape.name}
                        pending={rename.isPending}
                        onSave={(name) => rename.mutateAsync({ id: apiKey.id, input: { name } }).then(() => true, () => false)}
                        onCancel={() => setRenaming(false)}
                    />
                ) : null
            }
        >
            <RemoveApiKeyDialog provider={provider} providerName={providerName} apiKey={apiKey} open={removing} onOpenChange={setRemoving} />
        </ActiveItemRow>
    )
}
