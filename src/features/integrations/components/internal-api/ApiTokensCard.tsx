"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { KeyRound, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import type { ApiTokenDto } from "../../api-tokens/types"
import { useApiTokenScopes, useApiTokens, useApiTokensRealtime, useRevokeApiToken } from "../../hooks/useApiTokens"
import { cardMotion } from "../detail/draft"
import { ApiTokenDialog } from "./ApiTokenDialog"
import { ApiTokenListSkeleton } from "./ApiTokenListSkeleton"
import { ApiTokenRow } from "./ApiTokenRow"

/** Tokens de sistema da API interna: gerar (com escopos), editar escopos e revogar (com confirmação). */
export function ApiTokensCard() {
    const query = useApiTokens()
    const catalog = useApiTokenScopes()
    const revoke = useRevokeApiToken()
    useApiTokensRealtime()
    const [creating, setCreating] = useState(false)
    const [editing, setEditing] = useState<ApiTokenDto | null>(null)
    const [revoking, setRevoking] = useState<ApiTokenDto | null>(null)
    const tokens = query.data ?? []

    return (
        <motion.div {...cardMotion} transition={{ ...cardMotion.transition, delay: 0.05 }}>
            <Card>
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
                    <div className="space-y-1.5">
                        <CardTitle className="text-base">Tokens de sistema</CardTitle>
                        <CardDescription>Para scripts, agentes e outros sistemas chamarem os endpoints públicos e o MCP do dono, com escopos por token.</CardDescription>
                    </div>
                    <Button type="button" size="sm" onClick={() => setCreating(true)}>
                        <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Gerar token
                    </Button>
                </CardHeader>
                <CardContent>
                    <AnimatePresence mode="wait" initial={false}>
                        {query.isLoading ? (
                            <motion.div key="loading">
                                <ApiTokenListSkeleton />
                            </motion.div>
                        ) : query.isError ? (
                            <motion.div key="error">
                                <ErrorState title="Não foi possível carregar os tokens" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
                            </motion.div>
                        ) : tokens.length === 0 ? (
                            <motion.p key="empty" className="flex items-center gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                                <KeyRound className="h-4 w-4" aria-hidden /> Nenhum token de sistema. Gere um para chamar os endpoints públicos ou o MCP do dono.
                            </motion.p>
                        ) : (
                            <motion.ul key="list" className="divide-y">
                                <AnimatePresence initial={false}>
                                    {tokens.map((token) => (
                                        <ApiTokenRow key={token.id} token={token} catalog={catalog.data} onEdit={setEditing} onRevoke={setRevoking} />
                                    ))}
                                </AnimatePresence>
                            </motion.ul>
                        )}
                    </AnimatePresence>
                </CardContent>
            </Card>

            <ApiTokenDialog open={creating} onOpenChange={setCreating} />
            <ApiTokenDialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)} token={editing} />
            <AlertDialog open={revoking !== null} onOpenChange={(open) => !open && setRevoking(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Revogar o token “{revoking?.nome}”?</AlertDialogTitle>
                        <AlertDialogDescription>Quem usa este token deixa de acessar a API na hora. Não dá para desfazer: para voltar, gere um token novo.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (revoking) revoke.mutate(revoking.id)
                                setRevoking(null)
                            }}
                        >
                            Revogar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </motion.div>
    )
}
