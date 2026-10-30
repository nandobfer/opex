"use client"

import { useEffect } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Loader2, Wrench } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { useTestMcp } from "../hooks/useOpencodeResources"
import type { OpencodeResourceDto } from "../types"

const STATUS_LABEL: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "secondary" | "outline" }> = {
    connected: { label: "Conectado", variant: "success" },
    pending: { label: "Conectando", variant: "warning" },
    disabled: { label: "Desligado", variant: "secondary" },
    failed: { label: "Falhou", variant: "destructive" },
    needs_auth: { label: "Precisa de login", variant: "warning" },
    unknown: { label: "Sem situação", variant: "outline" },
}

/** Teste de conexão do MCP: reconecta, mostra a situação e as ferramentas expostas. */
export function McpTestDialog({ target, onClose }: { target: OpencodeResourceDto | null; onClose: () => void }) {
    const test = useTestMcp()
    const { mutate, reset } = test
    useEffect(() => {
        if (target) mutate(target.id)
        else reset()
    }, [target, mutate, reset])
    const result = test.data
    const status = result ? (STATUS_LABEL[result.status] ?? STATUS_LABEL.unknown!) : null
    return (
        <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>Testar MCP {target?.name}</DialogTitle>
                    <DialogDescription>Reconecta o servidor e lista as ferramentas expostas (a primeira vez pode levar até 2 minutos).</DialogDescription>
                </DialogHeader>
                <AnimatePresence mode="wait" initial={false}>
                    {test.isPending ? (
                        <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Testando…
                        </motion.div>
                    ) : test.isError ? (
                        <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <ErrorState title="O teste falhou" description={apiErrorMessage(test.error, "Tente de novo.")} onRetry={() => target && mutate(target.id)} />
                        </motion.div>
                    ) : result && status ? (
                        <motion.div key="result" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                                <Badge variant={status.variant}>{status.label}</Badge>
                                <span className="text-muted-foreground">{(result.durationMs / 1000).toFixed(1)} s</span>
                            </div>
                            {result.error ? <p className="text-sm text-destructive">{result.error}</p> : null}
                            {result.toolsError ? <p className="text-sm text-warning">Não foi possível listar as ferramentas: {result.toolsError}</p> : null}
                            {result.tools.length > 0 ? (
                                <ul className="max-h-72 space-y-1.5 overflow-y-auto rounded-md border p-3" aria-label="Ferramentas expostas">
                                    {result.tools.map((tool) => (
                                        <li key={tool.name} className="text-sm">
                                            <span className="flex items-center gap-1.5 font-mono text-foreground">
                                                <Wrench className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                                                {tool.name}
                                            </span>
                                            {tool.description ? <span className="line-clamp-2 pl-5 text-xs text-muted-foreground">{tool.description}</span> : null}
                                        </li>
                                    ))}
                                </ul>
                            ) : !result.toolsError ? (
                                <p className="text-sm text-muted-foreground">Nenhuma ferramenta exposta.</p>
                            ) : null}
                        </motion.div>
                    ) : null}
                </AnimatePresence>
                <div className="flex justify-end gap-2">
                    <Button type="button" variant="ghost" onClick={() => target && mutate(target.id)} disabled={test.isPending || !target}>
                        Testar de novo
                    </Button>
                    <Button type="button" onClick={onClose}>
                        Fechar
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
