"use client"

import { AnimatePresence, motion } from "framer-motion"
import { CircleAlert, CircleCheck, Loader2, PlugZap, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { useMaddoxMcpStatus, useReconnectMaddoxMcp } from "../../hooks/useMaddoxSettings"

const STATE_LABELS: Record<string, string> = {
    connected: "Conectado",
    pending: "Conectando",
    disabled: "Desligado",
    failed: "Falhou",
    needs_auth: "Pede autenticação",
    missing: "Não registrado",
}

/**
 * Ferramentas do Opex no OpenCode: o endereço do Opex gravado ao salvar (a origem do navegador) e a
 * situação dos dois servidores MCP (`opex_app` para o dono e `opex_portal` para o portal).
 */
export function MaddoxMcpCard() {
    const status = useMaddoxMcpStatus()
    const reconnect = useReconnectMaddoxMcp()
    const data = status.data
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <PlugZap className="h-4 w-4 text-primary" aria-hidden /> Ferramentas do Opex no OpenCode
                </CardTitle>
                <CardDescription>
                    O OpenCode chama as ferramentas do Opex pelo endereço que você usa no navegador, gravado ao salvar esta configuração. Abra o Opex por um endereço que a máquina do OpenCode alcance e salve de novo se ele mudar.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
                {status.isLoading ? (
                    <Skeleton className="h-16 w-full" />
                ) : (
                    <>
                        <p className="text-xs text-muted-foreground">
                            Endereço do Opex: <span className="font-mono text-foreground">{data?.baseUrl ?? "ainda não gravado (salve a configuração)"}</span>
                        </p>
                        <AnimatePresence initial={false}>
                            {data?.error && (
                                <motion.p key="error" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="flex items-start gap-2 overflow-hidden text-xs text-warning">
                                    <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {data.error}
                                </motion.p>
                            )}
                        </AnimatePresence>
                        <ul className="space-y-1.5">
                            {(data?.servers ?? []).map((server) => (
                                <li key={server.name} className="flex items-center gap-2 text-xs" data-testid={`maddox-mcp-${server.scope}`}>
                                    {server.state === "connected" ? <CircleCheck className="h-3.5 w-3.5 text-success" aria-hidden /> : <CircleAlert className={cn("h-3.5 w-3.5", server.state === "failed" ? "text-destructive" : "text-warning")} aria-hidden />}
                                    <span className="font-mono">{server.name}</span>
                                    <span className="text-muted-foreground">{server.scope === "owner" ? "dono" : "portal"}</span>
                                    <span className="ml-auto">{STATE_LABELS[server.state] ?? server.state}</span>
                                    {server.error && <span className="sr-only">{server.error}</span>}
                                </li>
                            ))}
                        </ul>
                    </>
                )}
                <div className="flex justify-end">
                    <Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={reconnect.isPending} onClick={() => reconnect.mutate()}>
                        {reconnect.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
                        Registrar de novo
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
