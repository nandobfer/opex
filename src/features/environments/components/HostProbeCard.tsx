"use client"

import { AnimatePresence, motion } from "framer-motion"
import { useMutation } from "@tanstack/react-query"
import { CheckCircle2, Loader2, PlugZap, XCircle } from "lucide-react"
import { toast } from "sonner"
import { api, apiErrorMessage, unwrapApi } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { EnvironmentStatusBadge } from "./EnvironmentStatusBadge"

export interface HostProbeResult {
    ok: boolean
    checks: { name: string; ok: boolean; detail: string }[]
}

/**
 * "Testar acesso ao host": pelo shell do OpenCode (sem modelo) grava/lê/remove um acesso de teste e
 * confere Docker e Docker Compose. Cada verificação aparece com o resultado e o detalhe.
 */
export function HostProbeCard({ dirty }: { dirty: boolean }) {
    const probe = useMutation({
        mutationFn: async () => unwrapApi<HostProbeResult>((await api.post("/environments/access-probe")).data),
        onSuccess: (data) =>
            data.ok ? toast.success("Host pronto para os Ambientes") : toast.error("O host não passou em todas as verificações"),
        onError: (error) => toast.error(apiErrorMessage(error, "Falha ao testar o acesso ao host")),
    })
    const result = probe.data
    return (
        <Card>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
                <div className="min-w-0 space-y-1.5">
                    <CardTitle className="flex items-center gap-2 text-base">
                        Testar acesso ao host
                        {result && (
                            <EnvironmentStatusBadge
                                label={result.ok ? "Pronto" : "Com pendências"}
                                tone={result.ok ? "emerald" : "destructive"}
                            />
                        )}
                    </CardTitle>
                    <CardDescription>
                        Grava e remove um acesso de teste no diretório de acesso e confere o Docker do host, sem usar o
                        modelo.{dirty ? " Salve as alterações antes de testar." : ""}
                    </CardDescription>
                </div>
                <Button size="sm" className="gap-1.5" disabled={probe.isPending || dirty} onClick={() => probe.mutate()}>
                    {probe.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                        <PlugZap className="h-4 w-4" aria-hidden />
                    )}
                    {probe.isPending ? "Testando…" : "Testar acesso"}
                </Button>
            </CardHeader>
            <AnimatePresence initial={false}>
                {result && (
                    <motion.div
                        key="checks"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        <CardContent>
                            <ul className="divide-y rounded-md border" aria-label="Verificações do host">
                                {result.checks.map((check, index) => (
                                    <motion.li
                                        key={check.name}
                                        initial={{ opacity: 0, y: 4 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.18, delay: index * 0.05 }}
                                        className="flex items-start gap-3 px-3 py-2.5"
                                    >
                                        {check.ok ? (
                                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden />
                                        ) : (
                                            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
                                        )}
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium">{check.name}</p>
                                            <p
                                                className={cn(
                                                    "break-words text-xs",
                                                    check.ok ? "text-muted-foreground" : "text-destructive",
                                                )}
                                            >
                                                {check.detail}
                                            </p>
                                        </div>
                                    </motion.li>
                                ))}
                            </ul>
                        </CardContent>
                    </motion.div>
                )}
            </AnimatePresence>
        </Card>
    )
}
