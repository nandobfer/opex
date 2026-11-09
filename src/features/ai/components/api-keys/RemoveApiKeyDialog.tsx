"use client"

import { Loader2 } from "lucide-react"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import type { AiApiKeyDto, AiApiKeyProviderId } from "../../api-keys"
import { useRemoveAiApiKey } from "../../hooks/useAiApiKeys"

/** Texto da confirmação: a chave em uso e única deixa o provedor "Não configurado". */
export function removeApiKeyMessage(apiKey: AiApiKeyDto, providerName: string): string {
    if (apiKey.active) return `Esta é a única chave e está em uso: o ${providerName} fica "Não configurado" e as features que dependem dele ficam indisponíveis até você adicionar outra chave.`
    return "O segredo é apagado do Opex. O consumo já medido com esta chave continua no filtro \"Chaves removidas\"."
}

export function RemoveApiKeyDialog({ provider, providerName, apiKey, open, onOpenChange }: { provider: AiApiKeyProviderId; providerName: string; apiKey: AiApiKeyDto; open: boolean; onOpenChange: (open: boolean) => void }) {
    const remove = useRemoveAiApiKey(provider)

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Remover a chave &quot;{apiKey.name}&quot;?</AlertDialogTitle>
                    <AlertDialogDescription>{removeApiKeyMessage(apiKey, providerName)}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        disabled={remove.isPending}
                        onClick={(event) => {
                            event.preventDefault()
                            remove.mutate(apiKey.id, { onSuccess: () => onOpenChange(false) })
                        }}
                    >
                        {remove.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}
                        Remover
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}
