"use client"

import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { AnimatePresence, motion } from "framer-motion"
import { ChevronRight, LayoutDashboard } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { workbenchPath } from "../../constants"
import { useCentralWorkbenches } from "../../hooks/useAgentic"
import { WorkbenchStageBadge } from "../WorkbenchStageBadge"

/** Aba Mesas: todas as mesas da central, mais recentes primeiro, com atalho para cada uma. */
export function CentralWorkbenchesSection({ centralId }: { centralId: string }) {
    const query = useCentralWorkbenches(centralId)
    const items = query.data ?? []
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Mesas de trabalho</CardTitle>
                <CardDescription>Uma mesa por tarefa. Concluídas podem ser reabertas na Central de desenvolvimento.</CardDescription>
            </CardHeader>
            <CardContent>
                {query.isLoading ? (
                    <Skeleton className="h-32 w-full" />
                ) : query.isError ? (
                    <ErrorState title="Não foi possível carregar as mesas" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
                ) : items.length === 0 ? (
                    <EmptyState icon={LayoutDashboard} title="Nenhuma mesa ainda" description="Abra uma tarefa na Central de desenvolvimento para começar." />
                ) : (
                    <ul className="divide-y rounded-lg border">
                        <AnimatePresence initial={false}>
                            {items.map((item) => (
                                <motion.li key={item.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                                    <Link href={workbenchPath(item.taskId)} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50">
                                        <span className="font-mono text-xs font-semibold text-primary">{item.taskCode}</span>
                                        <span className="min-w-0 flex-1 truncate text-sm">{item.taskTitle}</span>
                                        <WorkbenchStageBadge stage={item.stage} runState={item.runState} />
                                        <span className="hidden text-xs text-muted-foreground sm:block">{formatDistanceToNow(new Date(item.updatedAt), { addSuffix: true, locale: ptBR })}</span>
                                        <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
                                    </Link>
                                </motion.li>
                            ))}
                        </AnimatePresence>
                    </ul>
                )}
            </CardContent>
        </Card>
    )
}
