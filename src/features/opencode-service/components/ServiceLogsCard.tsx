"use client"

import { useState } from "react"
import { Copy, ScrollText } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { OptionTabs } from "@/components/ui/option-tabs"
import { RefreshButton } from "@/components/ui/refresh-button"
import { Skeleton } from "@/components/ui/skeleton"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { useOpencodeLogs } from "../hooks/useOpencodeService"

const LINE_OPTIONS = [
    { value: "50", label: "50 linhas" },
    { value: "200", label: "200 linhas" },
    { value: "300", label: "300 linhas" },
] as const

async function copyLogs(text: string): Promise<void> {
    try {
        await navigator.clipboard.writeText(text)
        toast.success("Logs copiados")
    } catch {
        toast.error("Não foi possível copiar; selecione o texto e copie à mão")
    }
}

/** Logs recentes do OpenCode (sem cores e sem linhas que pareçam segredo). */
export function ServiceLogsCard() {
    const [lines, setLines] = useState<"50" | "200" | "300">("200")
    const logs = useOpencodeLogs(Number(lines))
    return (
        <Card>
            <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1.5">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <ScrollText className="h-4 w-4 text-primary" aria-hidden /> Logs recentes
                    </CardTitle>
                    <CardDescription>{logs.data ? `Lidos ${logs.data.source === "ssh" ? "por SSH" : "pelo shell do OpenCode"}.` : "Fim do arquivo de log do OpenCode."}</CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <OptionTabs options={LINE_OPTIONS} value={lines} onChange={setLines} size="xs" aria-label="Quantidade de linhas" />
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="gap-1.5"
                        disabled={!logs.data?.lines}
                        onClick={() => void copyLogs(logs.data?.lines ?? "")}
                    >
                        <Copy className="h-4 w-4" aria-hidden /> Copiar
                    </Button>
                    <RefreshButton onClick={() => void logs.refetch()} fetching={logs.isFetching} />
                </div>
            </CardHeader>
            <CardContent>
                {logs.isLoading ? (
                    <Skeleton className="h-64 w-full" />
                ) : logs.isError ? (
                    <ErrorState title="Não foi possível ler os logs" description={apiErrorMessage(logs.error, "Tente de novo.")} onRetry={() => void logs.refetch()} />
                ) : (
                    <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-foreground">{logs.data?.lines || "Log vazio."}</pre>
                )}
            </CardContent>
        </Card>
    )
}
