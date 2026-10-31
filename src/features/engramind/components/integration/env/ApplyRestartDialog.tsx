"use client"

import { useCallback, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { CheckCircle2, Loader2, Power, XCircle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { apiErrorMessage } from "@/lib/api"
import { IntegrationConsole, type IntegrationConsoleHandle } from "@/features/integrations/components/IntegrationConsole"
import { useApplyEngramindEnv, useApplyLog } from "../../../hooks/useEngramindEnv"

interface ApplyRestartDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    /** Já há uma execução (em andamento ou a última): abre direto no log. */
    running: boolean
    /** A porta ou o nome do container mudaram: o projeto antigo é derrubado. */
    recreatesProject: boolean
}

/** "Aplicar e reiniciar": confirmação, `docker compose up -d api` no host com o log ao vivo (xterm) e o `/health/ready`. */
export function ApplyRestartDialog({ open, onOpenChange, running, recreatesProject }: ApplyRestartDialogProps) {
    const apply = useApplyEngramindEnv()
    const [started, setStarted] = useState(running)
    const consoleRef = useRef<IntegrationConsoleHandle>(null)
    const onLog = useCallback((text: string, replace: boolean) => {
        if (replace) consoleRef.current?.clear()
        consoleRef.current?.write(text.replace(/\r?\n/g, "\r\n"))
    }, [])
    const { status } = useApplyLog(open && started, onLog)
    const start = async () => {
        try {
            await apply.mutateAsync(undefined)
            setStarted(true)
        } catch (error) {
            toast.error(apiErrorMessage(error, "Não foi possível aplicar"))
        }
    }
    const busy = started && !status
    return (
        <Dialog open={open} onOpenChange={(next) => !apply.isPending && onOpenChange(next)}>
            <DialogContent className="sm:max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Aplicar e reiniciar o Engramind</DialogTitle>
                    <DialogDescription>
                        Recria o serviço api com o .env gravado, usando a imagem que já está rodando (sem build nem pull). O serviço fica fora do ar por um instante.
                        {recreatesProject && " A porta ou o nome do container mudaram: o projeto atual é derrubado antes."}
                    </DialogDescription>
                </DialogHeader>
                <AnimatePresence mode="wait" initial={false}>
                    {started ? (
                        <motion.div key="log" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-2">
                            <IntegrationConsole ref={consoleRef} className="h-80" placeholder="Aguardando o log…" ariaLabel="Log do Aplicar e reiniciar" />
                            <AnimatePresence initial={false}>
                                {status && (
                                    <motion.p key={status.status} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className={status.status === "success" ? "flex items-center gap-1.5 text-sm text-success" : "flex items-center gap-1.5 text-sm text-destructive"}>
                                        {status.status === "success" ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <XCircle className="h-4 w-4" aria-hidden />}
                                        {status.status === "success" ? "Engramind recriado e pronto (/health/ready)." : (status.error ?? "Falhou")}
                                    </motion.p>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    ) : null}
                </AnimatePresence>
                <DialogFooter>
                    {started ? (
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} {busy ? "Fechar (continua no servidor)" : "Fechar"}
                        </Button>
                    ) : (
                        <Button type="button" variant="destructive" onClick={() => void start()} disabled={apply.isPending}>
                            {apply.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Power className="mr-2 h-4 w-4" aria-hidden />} Aplicar e reiniciar
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
