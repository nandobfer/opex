"use client"

import { FileDiff } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/feedback/EmptyState"
import { ErrorState } from "@/components/feedback/ErrorState"
import { cn } from "@/lib/utils"
import { usePluginDiff } from "../hooks/usePlugins"
import type { PluginFileDiff } from "../logic"

const STATUS_LABEL: Record<PluginFileDiff["status"], string> = { added: "novo", removed: "removido", modified: "alterado" }

/** Linha do diff unificado com a cor por tipo (tokens do tema). */
function lineClass(line: string): string {
    if (line.startsWith("+++") || line.startsWith("---")) return "text-muted-foreground"
    if (line.startsWith("+")) return "bg-success/10 text-success"
    if (line.startsWith("-")) return "bg-destructive/10 text-destructive"
    if (line.startsWith("@@")) return "text-primary"
    return "text-muted-foreground"
}

export function PluginFileDiffView({ diff }: { diff: PluginFileDiff }) {
    const lines = diff.patch.split("\n").filter((line, index) => index > 1 && !line.startsWith("====="))
    return (
        <details open className="rounded-md border">
            <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
                <span className="font-mono">{diff.path}</span>
                <span className="text-xs text-muted-foreground">{STATUS_LABEL[diff.status]}</span>
                <span className="ml-auto font-mono text-xs text-success">+{diff.additions}</span>
                <span className="font-mono text-xs text-destructive">-{diff.deletions}</span>
            </summary>
            <pre className="max-h-96 overflow-auto border-t text-xs leading-5">
                {lines.map((line, index) => (
                    <div key={index} className={cn("whitespace-pre px-3 font-mono", lineClass(line))}>
                        {line || " "}
                    </div>
                ))}
            </pre>
        </details>
    )
}

/** Diferença entre duas versões (sem `from`: contra a base da versão). */
export function PluginDiffCard({ pluginId, toVersionId, fromVersionId = null }: { pluginId: string; toVersionId: string; fromVersionId?: string | null }) {
    const query = usePluginDiff(pluginId, toVersionId, fromVersionId)
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">
                    {query.data ? `Diferença ${query.data.from ? `v${query.data.from.number}` : "(sem base)"} → v${query.data.to.number}` : "Diferença entre versões"}
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                {query.isPending ? (
                    <Skeleton className="h-40 w-full" />
                ) : query.isError ? (
                    <ErrorState title="Não foi possível calcular a diferença" onRetry={() => void query.refetch()} />
                ) : !query.data.files.length ? (
                    <EmptyState icon={FileDiff} title="Sem diferenças" description="As duas versões têm as mesmas fontes." />
                ) : (
                    query.data.files.map((diff) => <PluginFileDiffView key={diff.path} diff={diff} />)
                )}
            </CardContent>
        </Card>
    )
}
