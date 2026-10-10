"use client"

import { useState } from "react"
import Link from "next/link"
import { AnimatePresence, motion } from "framer-motion"
import { ChevronRight, FolderGit2, Plus, Workflow } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { cn } from "@/lib/utils"
import { centralSettingsPath } from "../../constants"
import { useCentrals } from "../../hooks/useAgentic"
import type { CentralDto } from "../../types"
import { CreateCentralDialog } from "./CreateCentralDialog"

/** Lista das centrais de desenvolvimento (uma por produto) com o atalho para criar. */
export function CentralsCard() {
    const query = useCentrals()
    const [creating, setCreating] = useState(false)
    const centrals = query.data ?? []

    return (
        <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <div className="space-y-1.5">
                    <CardTitle className="text-base">Centrais de desenvolvimento</CardTitle>
                    <CardDescription>Cada central liga um projeto (repositório vinculado) ao diretório (repositório) em que as sessões do OpenCode trabalham.</CardDescription>
                </div>
                <Button type="button" size="sm" className="shrink-0 gap-1.5" onClick={() => setCreating(true)}>
                    <Plus className="h-4 w-4" aria-hidden /> Nova central
                </Button>
            </CardHeader>
            <CardContent>
                {query.isLoading ? (
                    <div className="space-y-2" aria-label="Carregando centrais">
                        <Skeleton className="h-14 w-full" />
                        <Skeleton className="h-14 w-full" />
                    </div>
                ) : query.isError ? (
                    <ErrorState title="Não foi possível carregar as centrais" description={apiErrorMessage(query.error, "Tente novamente.")} onRetry={() => void query.refetch()} />
                ) : centrals.length === 0 ? (
                    <EmptyState icon={Workflow} title="Nenhuma central ainda" description="Crie uma central para um produto e aponte o diretório do repositório dele." actionLabel="Nova central" onAction={() => setCreating(true)} />
                ) : (
                    <ul className="divide-y rounded-lg border">
                        <AnimatePresence initial={false}>
                            {centrals.map((central) => (
                                <motion.li key={central.id} layout="position" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }}>
                                    <CentralRow central={central} />
                                </motion.li>
                            ))}
                        </AnimatePresence>
                    </ul>
                )}
            </CardContent>
            <CreateCentralDialog open={creating} onOpenChange={setCreating} existing={centrals} />
        </Card>
    )
}

function CentralRow({ central }: { central: CentralDto }) {
    const test = central.lastTest
    return (
        <Link href={centralSettingsPath(central.id)} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none">
            <FolderGit2 className="h-5 w-5 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                    <span className="truncate font-medium">{central.projectName}</span>
                    {!central.config.enabled && <span className="rounded bg-muted px-1.5 text-[11px] text-muted-foreground">desativada</span>}
                </span>
                <span className="block truncate font-mono text-xs text-muted-foreground">{central.config.sessionDirectory}</span>
            </span>
            <span className="hidden text-xs text-muted-foreground sm:block">{central.repo ?? "sem repositório vinculado"}</span>
            <span className="hidden text-xs text-muted-foreground md:block">{central.activeWorkbenches === 1 ? "1 mesa" : `${central.activeWorkbenches} mesas`}</span>
            <span
                className={cn("h-2.5 w-2.5 shrink-0 rounded-full", !test ? "bg-muted-foreground/40" : test.ok ? "bg-emerald-500" : "bg-destructive")}
                title={test ? test.message : "Ainda não testada"}
                aria-label={test ? `Último teste: ${test.message}` : "Ainda não testada"}
            />
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </Link>
    )
}
