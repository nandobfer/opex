"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { RefreshCcw, Star } from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { toast } from "sonner"
import { ActiveItemRow } from "@/components/list/ActiveItemRow"
import { InlineRenameField } from "@/components/list/InlineRenameField"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { renameAiApiKeySchema, type AiApiKeyDto, type AiApiKeyProviderId } from "../../api-keys"
import { useMakePrimaryAiApiKey, useToggleAiApiKey, useUpdateAiApiKey } from "../../hooks/useAiApiKeys"
import { RemoveApiKeyDialog } from "./RemoveApiKeyDialog"

interface ApiKeyItemProps {
    provider: AiApiKeyProviderId
    providerName: string
    apiKey: AiApiKeyDto
    /** Há outras chaves no provedor (a principal não pode ser removida sem eleger outra). */
    hasOthers: boolean
    onReplaceSecret: (apiKey: AiApiKeyDto) => void
}

export const PRIMARY_KEY_RULE_MESSAGE = "Esta é a chave principal: torne outra chave principal antes"

/**
 * Uma chave de API (OPE-179): o clique no card põe ou tira a chave do rodízio; a principal tem o selo
 * "Principal" e não sai de uso; as demais têm "Tornar principal". Substituir o segredo, renomear (inline)
 * e remover (com confirmação) seguem como antes.
 */
export function ApiKeyItem({ provider, providerName, apiKey, hasOthers, onReplaceSecret }: ApiKeyItemProps) {
    const toggle = useToggleAiApiKey(provider)
    const makePrimary = useMakePrimaryAiApiKey(provider)
    const rename = useUpdateAiApiKey(provider, "Chave renomeada")
    const [renaming, setRenaming] = useState(false)
    const [removing, setRemoving] = useState(false)
    const pending = toggle.isPending || makePrimary.isPending

    const requestRemove = () => {
        if (apiKey.primary && hasOthers) {
            toast.error(`${PRIMARY_KEY_RULE_MESSAGE} de removê-la`)
            return
        }
        setRemoving(true)
    }

    const deactivate = () => {
        if (apiKey.primary) {
            toast.error(`${PRIMARY_KEY_RULE_MESSAGE} de tirá-la de uso`)
            return
        }
        toggle.mutate({ id: apiKey.id, selected: false })
    }

    return (
        <ActiveItemRow
            label={apiKey.name}
            sublabel={`Segredo definido · criada em ${format(new Date(apiKey.createdAt), "dd/MM/yyyy", { locale: ptBR })}`}
            active={apiKey.active}
            activateLabel={`Usar a chave ${apiKey.name}`}
            deactivateLabel={`Tirar a chave ${apiKey.name} de uso`}
            activateDisabled={pending}
            onActivate={() => toggle.mutate({ id: apiKey.id, selected: true })}
            onDeactivate={deactivate}
            onRename={() => setRenaming(true)}
            onRemove={requestRemove}
            badges={
                apiKey.primary ? (
                    <motion.span key="primary" className="flex shrink-0" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.18 }}>
                        <Badge variant="outline" className="h-4 gap-0.5 border-primary/60 px-1.5 py-0 text-[10px] leading-none text-primary">
                            <Star className="h-2.5 w-2.5 fill-current" aria-hidden />
                            Principal
                        </Badge>
                    </motion.span>
                ) : null
            }
            actions={
                <>
                    {!apiKey.primary ? (
                        <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label={`Tornar ${apiKey.name} a chave principal`} title="Tornar principal" disabled={pending} onClick={() => makePrimary.mutate(apiKey.id)}>
                            <Star className="h-4 w-4" aria-hidden />
                        </Button>
                    ) : null}
                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label={`Substituir o segredo de ${apiKey.name}`} title="Substituir segredo" onClick={() => onReplaceSecret(apiKey)}>
                        <RefreshCcw className="h-4 w-4" aria-hidden />
                    </Button>
                </>
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
