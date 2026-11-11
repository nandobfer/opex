"use client"

import { useState } from "react"
import { AnimatePresence } from "framer-motion"
import { KeyRound, Plus } from "lucide-react"
import { ACTIVE_ITEM_ROW_SKELETON_CLASS } from "@/components/list/ActiveItemRow"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import type { AiApiKeyDto, AiApiKeyProviderId } from "../../api-keys"
import { useAiApiKeys, useAiApiKeysRealtime } from "../../hooks/useAiApiKeys"
import { ApiKeyFormDialog } from "./ApiKeyFormDialog"
import { ApiKeyItem } from "./ApiKeyItem"

/**
 * Chaves de API nomeadas do provedor (aba Configuração, OPE-155): várias chaves, **uma em uso**. Só a
 * chave em uso é usada pelas features, catálogo de modelos, testes e agentes; sem chave em uso o
 * provedor fica "Não configurado". O segredo nunca é exibido.
 */
export function ApiKeysCard({ provider, providerName }: { provider: AiApiKeyProviderId; providerName: string }) {
    const keys = useAiApiKeys(provider)
    useAiApiKeysRealtime(provider)
    const [dialog, setDialog] = useState<{ open: boolean; target: AiApiKeyDto | null }>({ open: false, target: null })
    const rows = keys.data ?? []

    return (
        <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <div className="space-y-1.5">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <KeyRound className="h-4 w-4 text-primary" aria-hidden />
                        Chaves de API
                    </CardTitle>
                    <CardDescription>Cadastre várias chaves com nome e escolha qual está em uso. Só a chave em uso é usada pelo Opex; o segredo nunca é exibido.</CardDescription>
                </div>
                <Button type="button" size="sm" className="gap-1.5" onClick={() => setDialog({ open: true, target: null })}>
                    <Plus className="h-4 w-4" aria-hidden />
                    Adicionar chave
                </Button>
            </CardHeader>
            <CardContent>
                {keys.isLoading ? (
                    <div className="space-y-2" role="status" aria-label="Carregando chaves de API">
                        <Skeleton className={ACTIVE_ITEM_ROW_SKELETON_CLASS} />
                        <Skeleton className={ACTIVE_ITEM_ROW_SKELETON_CLASS} />
                    </div>
                ) : keys.isError ? (
                    <ErrorState title="Não foi possível carregar as chaves" description={apiErrorMessage(keys.error, "Tente novamente.")} onRetry={() => void keys.refetch()} />
                ) : rows.length === 0 ? (
                    <EmptyState icon={KeyRound} title="Nenhuma chave de API" description={`Sem chave em uso o ${providerName} fica "Não configurado".`} actionLabel="Adicionar chave" onAction={() => setDialog({ open: true, target: null })} />
                ) : (
                    <ul className="space-y-2" aria-label={`Chaves de API do ${providerName}`}>
                        <AnimatePresence initial={false}>
                            {rows.map((apiKey) => (
                                <ApiKeyItem key={apiKey.id} provider={provider} providerName={providerName} apiKey={apiKey} hasOthers={rows.length > 1} onReplaceSecret={(target) => setDialog({ open: true, target })} />
                            ))}
                        </AnimatePresence>
                    </ul>
                )}
            </CardContent>
            <ApiKeyFormDialog
                key={dialog.target?.id ?? "new"}
                provider={provider}
                providerName={providerName}
                target={dialog.target}
                open={dialog.open}
                onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
            />
        </Card>
    )
}
