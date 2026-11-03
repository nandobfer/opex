"use client"

import Link from "next/link"
import { motion, useReducedMotion } from "framer-motion"
import { ArrowLeft, MessageSquare } from "lucide-react"
import { ErrorState } from "@/components/feedback/ErrorState"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { apiErrorMessage } from "@/lib/api"
import { OpexScopeProvider } from "@/features/opex-agent/components/OpexScopeProvider"
import { buildChatItems, OpexMessageList } from "@/features/opex-agent/components/chat/OpexMessageList"
import { agentDef } from "../catalog"
import { useAgentConversation } from "../hooks/useAgentMetrics"

const noop = () => undefined

/**
 * Conversa do Opex ou do Maddox **só para leitura** (Histórico da página do agente, OPE-122): o dono vê
 * também as conversas do portal. Nada é enviado, confirmado nem alterado por aqui.
 */
export function ConversationViewer({ agent, id }: { agent: "opex" | "maddox"; id: string }) {
    const reduceMotion = useReducedMotion()
    const def = agentDef(agent)
    const query = useAgentConversation(id)
    const back = `${def.href}?aba=historico`
    return (
        <motion.section initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">
            <header className="flex flex-wrap items-center gap-3">
                <Button asChild variant="outline" size="sm" className="h-9 gap-1.5">
                    <Link href={back}>
                        <ArrowLeft className="h-4 w-4" aria-hidden /> Histórico
                    </Link>
                </Button>
                <div className="flex min-w-0 items-center gap-2">
                    <MessageSquare className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                    <h1 className="truncate text-lg font-semibold">{query.data?.session.title || "Conversa"}</h1>
                    {query.data && <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{query.data.clientId ? "Portal" : "Dono"} · só leitura</span>}
                </div>
            </header>
            {query.isLoading ? (
                <Skeleton className="h-[60vh] w-full" />
            ) : query.isError || !query.data ? (
                <ErrorState title="Não foi possível abrir a conversa" description={apiErrorMessage(query.error, "Ela pode ter sido removida pela retenção.")} onRetry={() => void query.refetch()} />
            ) : (
                <Card>
                    <CardContent className="h-[70vh] p-0">
                        <OpexScopeProvider agent={agent}>
                            <OpexMessageList items={buildChatItems(query.data.messages, null, null)} onDecide={noop} deciding onRetry={noop} busy />
                        </OpexScopeProvider>
                    </CardContent>
                </Card>
            )}
        </motion.section>
    )
}
