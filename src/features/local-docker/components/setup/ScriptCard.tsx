"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { ChevronDown, Copy, Download, FileCode2, ListOrdered, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { ToggleCard } from "@/components/ui/toggle-card"
import { cn } from "@/lib/utils"
import { useLocalDockerBootstrap, useLocalDockerManual } from "../../hooks/useLocalDocker"
import type { LocalDockerMode } from "../../schemas"

export const SCRIPT_FILE_NAME = "opex-pc.sh"

async function copy(text: string) {
    try {
        await navigator.clipboard.writeText(text)
        toast.success("Script copiado")
    } catch {
        toast.error("Não foi possível copiar; selecione o texto e copie à mão")
    }
}

function download(script: string) {
    const url = URL.createObjectURL(new Blob([script], { type: "text/x-shellscript" }))
    const link = document.createElement("a")
    link.href = url
    link.download = SCRIPT_FILE_NAME
    link.click()
    URL.revokeObjectURL(url)
}

/** Preparo único do WSL: passo a passo (recolhido) ou o script pronto para baixar/copiar. */
export function ScriptCard({ mode, hasKey, unsaved }: { mode: LocalDockerMode; hasKey: boolean; unsaved: boolean }) {
    const bootstrap = useLocalDockerBootstrap()
    const [mirrored, setMirrored] = useState(false)
    const [showSteps, setShowSteps] = useState(false)
    const [script, setScript] = useState<string | null>(null)
    const useMirrored = mode === "direct" && mirrored
    const manual = useLocalDockerManual(useMirrored, showSteps)
    const blocked = !hasKey ? "Gere ou insira a chave do servidor primeiro" : unsaved ? "Salve a configuração antes de gerar o script" : null

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <FileCode2 className="h-4 w-4" aria-hidden /> Preparo do WSL (uma vez)
                </CardTitle>
                <CardDescription>Instala o SSH{mode === "reverse" ? " e o túnel de controle" : ""}, autoriza a chave do servidor e ajusta o WSL. Faça pelo passo a passo ou rode o script no terminal do WSL.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {mode === "direct" && <ToggleCard id="local-docker-mirrored" checked={mirrored} onCheckedChange={setMirrored} label="Rede espelhada do WSL" description="Necessária na conexão direta pelo IP (networkingMode=mirrored no .wslconfig)" onLabel="Incluir" offLabel="Não incluir" />}
                <div className="flex flex-wrap gap-2">
                    <Button type="button" className="gap-1.5" disabled={Boolean(blocked) || bootstrap.isPending} title={blocked ?? undefined} onClick={() => bootstrap.mutate(useMirrored, { onSuccess: setScript })}>
                        {bootstrap.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileCode2 className="h-4 w-4" aria-hidden />} Gerar o script
                    </Button>
                    <Button type="button" variant="outline" className="gap-1.5" aria-expanded={showSteps} onClick={() => setShowSteps((value) => !value)}>
                        <ListOrdered className="h-4 w-4" aria-hidden /> Passo a passo <ChevronDown className={cn("h-4 w-4 transition-transform", showSteps && "rotate-180")} aria-hidden />
                    </Button>
                </div>
                {blocked && <p className="text-xs text-muted-foreground">{blocked}.</p>}
                <AnimatePresence initial={false}>
                    {showSteps && (
                        <motion.ol key="steps" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="space-y-3 overflow-hidden">
                            {manual.isLoading && <li className="text-sm text-muted-foreground">Carregando…</li>}
                            {(manual.data ?? []).map((step, index) => (
                                <li key={step.title} className="space-y-1 rounded-md border p-3">
                                    <p className="text-sm font-medium">
                                        {index + 1}. {step.title}
                                    </p>
                                    <p className="text-xs text-muted-foreground">{step.description}</p>
                                    {step.commands.map((command) => (
                                        <pre key={command} className="overflow-x-auto rounded bg-muted px-2 py-1 text-xs">
                                            {command}
                                        </pre>
                                    ))}
                                </li>
                            ))}
                        </motion.ol>
                    )}
                </AnimatePresence>
            </CardContent>
            <Dialog open={script !== null} onOpenChange={(open) => !open && setScript(null)}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Script de preparo do WSL</DialogTitle>
                        <DialogDescription>No WSL: salve como {SCRIPT_FILE_NAME} e rode `bash {SCRIPT_FILE_NAME}` (pede a senha do sudo). Pode rodar de novo quantas vezes precisar.</DialogDescription>
                    </DialogHeader>
                    <Textarea readOnly rows={16} value={script ?? ""} className="font-mono text-xs" aria-label="Script de preparo do WSL" />
                    <DialogFooter>
                        <Button type="button" variant="outline" className="gap-1.5" onClick={() => script && void copy(script)}>
                            <Copy className="h-4 w-4" aria-hidden /> Copiar
                        </Button>
                        <Button type="button" className="gap-1.5" onClick={() => script && download(script)}>
                            <Download className="h-4 w-4" aria-hidden /> Baixar {SCRIPT_FILE_NAME}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    )
}
