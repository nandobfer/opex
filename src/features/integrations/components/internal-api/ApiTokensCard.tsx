"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { KeyRound, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
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
import { listItem } from "@/components/motion/presets"
import { apiErrorMessage } from "@/lib/api"
import type { ApiTokenDto } from "../../api-tokens/types"
import { useApiTokens, useRevokeApiToken } from "../../hooks/useApiTokens"
import { cardMotion } from "../detail/draft"
import { ApiTokenDialog } from "./ApiTokenDialog"

const day = (iso: string) => format(new Date(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })

/** Tokens de sistema da API interna: gerar e revogar (com confirmação). */
export function ApiTokensCard() {
    const query = useApiTokens()
    const revoke = useRevokeApiToken()
    const [creating, setCreating] = useState(false)
    const [revoking, setRevoking] = useState<ApiTokenDto | null>(null)
    const tokens = query.data ?? []

    return (
        <motion.div {...cardMotion} transition={{ ...cardMotion.transition, delay: 0.05 }}>
            <Card>
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
                    <div className="space-y-1.5">
                        <CardTitle className="text-base">Tokens de sistema</CardTitle>
                        <CardDescription>Para scripts, agentes e outros sistemas chamarem os endpoints públicos do app.</CardDescription>
                    </div>
                    <Button type="button" size="sm" onClick={() => setCreating(true)}>
                        <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Gerar token
                    </Button>
                </CardHeader>
                <CardContent>
                    <AnimatePresence mode="wait" initial={false}>
                        {query.isLoading ? (
                            <motion.div key="loading">
                                <Skeleton className="h-12 w-full" />
                            </motion.div>
                        ) : query.isError ? (
                            <motion.div key="error">
                                <ErrorState title="Não foi possível carregar os tokens" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
                            </motion.div>
                        ) : tokens.length === 0 ? (
                            <motion.p key="empty" className="flex items-center gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                                <KeyRound className="h-4 w-4" aria-hidden /> Nenhum token de sistema. Gere um para chamar os endpoints públicos.
                            </motion.p>
                        ) : (
                            <motion.ul key="list" className="divide-y">
                                <AnimatePresence initial={false}>
                                    {tokens.map((token) => (
                                        <motion.li key={token.id} variants={listItem} initial="hidden" animate="visible" exit="exit" className="flex flex-wrap items-start gap-3 py-2.5">
                                            <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                                            <div className="min-w-0 flex-1 space-y-0.5">
                                                <p className="text-sm font-medium">
                                                    {token.nome} <span className="font-mono text-xs text-muted-foreground">{token.prefixo}…</span>
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {token.ultimoUsoEm ? `usado em ${day(token.ultimoUsoEm)}` : "ainda não usado"} · criado em {day(token.criadoEm)}
                                                </p>
                                            </div>
                                            <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => setRevoking(token)}>
                                                Revogar
                                            </Button>
                                        </motion.li>
                                    ))}
                                </AnimatePresence>
                            </motion.ul>
                        )}
                    </AnimatePresence>
                </CardContent>
            </Card>

            <ApiTokenDialog open={creating} onOpenChange={setCreating} />
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
