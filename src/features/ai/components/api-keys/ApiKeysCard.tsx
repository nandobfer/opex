"use client"

import { useState } from "react"
import { AnimatePresence } from "framer-motion"
import { Info, KeyRound, Plus } from "lucide-react"
import { ACTIVE_ITEM_ROW_SKELETON_CLASS } from "@/components/list/ActiveItemRow"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { feedsEngramind, hasKeyBilling, type AiApiKeyDto, type AiApiKeyProviderId } from "../../api-keys"
import { useAiApiKeys, useAiApiKeysRealtime } from "../../hooks/useAiApiKeys"
import { ApiKeyBillingDialog } from "./ApiKeyBillingDialog"
import { ApiKeyFormDialog } from "./ApiKeyFormDialog"
import { ApiKeyItem } from "./ApiKeyItem"

/**
 * Chaves de API nomeadas do provedor (aba Configuração, OPE-155/OPE-179): várias chaves, **várias em uso**
 * (rodízio por geração, com troca para a próxima quando uma falha) e **uma principal** (Engramind e
 * teste do provedor). Sem chave em uso o provedor fica "Não configurado". O segredo nunca é exibido.
 */
export function ApiKeysCard({ provider, providerName }: { provider: AiApiKeyProviderId; providerName: string }) {
    const keys = useAiApiKeys(provider)
    useAiApiKeysRealtime(provider)
    const [dialog, setDialog] = useState<{ open: boolean; target: AiApiKeyDto | null }>({ open: false, target: null })
    const [billing, setBilling] = useState<{ open: boolean; target: AiApiKeyDto | null }>({ open: false, target: null })
    const rows = keys.data ?? []

    return (
        <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <div className="space-y-1.5">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <KeyRound className="h-4 w-4 text-primary" aria-hidden />
                        Chaves de API
                    </CardTitle>
                    <CardDescription>
                        Cadastre várias chaves com nome e clique para pôr ou tirar cada uma de uso. Com mais de uma em uso, o Opex reveza as chaves a cada geração e, se uma falhar (recusada, sem saldo ou no limite), tenta a próxima. O segredo nunca é exibido.
                    </CardDescription>
                    {feedsEngramind(provider) ? (
                        <p className="flex items-start gap-1.5 text-xs text-muted-foreground" data-slot="engramind-note">
                            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />O Engramind aceita uma só chave: ele recebe a chave principal.
                        </p>
                    ) : null}
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
                                <ApiKeyItem key={apiKey.id} provider={provider} providerName={providerName} apiKey={apiKey} hasOthers={rows.length > 1} onReplaceSecret={(target) => setDialog({ open: true, target })} onEditBilling={hasKeyBilling(provider) ? (target) => setBilling({ open: true, target }) : undefined} />
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
            {hasKeyBilling(provider) ? <ApiKeyBillingDialog provider={provider} target={billing.target} open={billing.open} onOpenChange={(open) => setBilling((current) => ({ ...current, open }))} /> : null}
        </Card>
    )
}
