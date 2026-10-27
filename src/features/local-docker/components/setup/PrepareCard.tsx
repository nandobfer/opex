"use client"

import { AnimatePresence, motion } from "framer-motion"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Loader2, PlugZap, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useLocalDockerMachine, useLocalDockerStatus } from "../../hooks/useLocalDocker"
import type { LocalDockerPrepareDto } from "../../types"
import { StepsList } from "./StepsList"

const reveal = { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: "auto" }, exit: { opacity: 0, height: 0 }, transition: { duration: 0.2 } }

/** Testar a conexão e preparar o Docker do PC (só os containers de ambiente; as prévias não são tocadas). */
export function PrepareCard({ lastPrepare, blocked }: { lastPrepare: LocalDockerPrepareDto | null; blocked: string | null }) {
    const machine = useLocalDockerMachine()
    const status = useLocalDockerStatus()
    const tunnelOpen = Boolean(status.data?.tunnelOpen)
    const prepareBlocked = blocked ?? (tunnelOpen ? null : "Abra o túnel (aba Túnel do Docker do PC) antes de preparar o PC")
    const result = machine.data
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <Sparkles className="h-4 w-4" aria-hidden /> Docker do PC
                </CardTitle>
                <CardDescription>Cria ou ajusta a rede, os apelidos e o builder dedicado. Só mexe no que mudou e nunca nos containers de prévia.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" className="gap-1.5" disabled={Boolean(blocked) || machine.isPending} title={blocked ?? undefined} onClick={() => machine.mutate("test")}>
                        {machine.isPending && machine.variables === "test" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <PlugZap className="h-4 w-4" aria-hidden />} Testar conexão
                    </Button>
                    <Button type="button" className="gap-1.5" disabled={Boolean(prepareBlocked) || machine.isPending} title={prepareBlocked ?? undefined} onClick={() => machine.mutate("prepare")}>
                        {machine.isPending && machine.variables === "prepare" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Sparkles className="h-4 w-4" aria-hidden />} Preparar o Docker do PC
                    </Button>
                </div>
                {prepareBlocked && <p className="text-xs text-muted-foreground">{prepareBlocked}.</p>}
                <AnimatePresence initial={false} mode="wait">
                    {result ? (
                        <motion.div key={`result-${machine.submittedAt}`} {...reveal} className="overflow-hidden">
                            <StepsList steps={result.steps} />
                        </motion.div>
                    ) : lastPrepare ? (
                        <motion.div key={`last-${lastPrepare.at}`} {...reveal} className="space-y-1 overflow-hidden">
                            <p className="text-xs text-muted-foreground">
                                Último preparo {lastPrepare.trigger === "save" ? "(automático, ao salvar)" : ""} {formatDistanceToNow(new Date(lastPrepare.at), { addSuffix: true, locale: ptBR })}: {lastPrepare.ok ? "concluído" : "falhou"}
                            </p>
                            <StepsList steps={lastPrepare.steps} />
                        </motion.div>
                    ) : null}
                </AnimatePresence>
            </CardContent>
        </Card>
    )
}
