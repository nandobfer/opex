"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Cable, Loader2, RefreshCw, Server, Unplug } from "lucide-react"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useLocalDockerTunnel } from "../../hooks/useLocalDocker"
import type { LocalDockerStatusDto } from "../../types"

const swap = { initial: { opacity: 0, y: 4 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -4 }, transition: { duration: 0.18 } }
const gib = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} GiB`

function Summary({ status }: { status: LocalDockerStatusDto }) {
    const state = status.tunnelOpen ? "open" : status.reachable ? "ready" : "offline"
    return (
        <AnimatePresence mode="wait" initial={false}>
            <motion.div key={state} {...swap} className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={status.tunnelOpen ? "default" : "secondary"}>{status.tunnelOpen ? "Túnel aberto" : "Túnel fechado"}</Badge>
                    <Badge variant="outline">{status.reachable ? "PC acessível" : "PC fora do ar"}</Badge>
                    <span className="text-sm text-muted-foreground">{status.routesToLocal ? "Novas prévias: no PC" : "Novas prévias: no servidor"}</span>
                </div>
                {status.machine && (
                    <p className="text-xs text-muted-foreground">
                        {status.machine.name}: Docker {status.machine.version}, {status.machine.cpus} CPUs, {gib(status.machine.memoryBytes)}
                    </p>
                )}
                {status.error && <p className="text-xs text-warning">{status.error}</p>}
                {status.wantOpen && !status.tunnelOpen && <p className="text-xs text-muted-foreground">O túnel caiu: a rotina tenta reabrir a cada minuto.</p>}
            </motion.div>
        </AnimatePresence>
    )
}

/** Situação do PC e do túnel, com abrir/fechar (fechar com prévias no PC pede confirmação). */
export function TunnelStatusCard({ status, fetching, onRefresh, openBlockedReason }: { status: LocalDockerStatusDto; fetching: boolean; onRefresh: () => void; openBlockedReason: string | null }) {
    const tunnel = useLocalDockerTunnel()
    const [confirming, setConfirming] = useState(false)
    const live = status.previews.filter((item) => !item.pendingTeardown)
    const pending = status.previews.filter((item) => item.pendingTeardown)
    const close = () => (live.length > 0 ? setConfirming(true) : tunnel.mutate({ action: "close" }))

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <Server className="h-4 w-4" aria-hidden /> Túnel do Docker do PC
                </CardTitle>
                <CardDescription>Aberto: o build e o container das próximas prévias rodam no PC e a porta volta para o servidor. Fechado: tudo no servidor, como sempre.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <Summary status={status} />
                <div className="flex flex-wrap gap-2">
                    {status.tunnelOpen ? (
                        <Button type="button" variant="outline" className="gap-1.5" disabled={tunnel.isPending} onClick={close}>
                            {tunnel.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Unplug className="h-4 w-4" aria-hidden />} Fechar túnel
                        </Button>
                    ) : (
                        <Button type="button" className="gap-1.5" disabled={tunnel.isPending || Boolean(openBlockedReason)} title={openBlockedReason ?? undefined} onClick={() => tunnel.mutate({ action: "open" })}>
                            {tunnel.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Cable className="h-4 w-4" aria-hidden />} Abrir túnel
                        </Button>
                    )}
                    <Button type="button" variant="ghost" className="gap-1.5" disabled={fetching} onClick={onRefresh}>
                        <RefreshCw className={fetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden /> Conferir agora
                    </Button>
                </div>
                {openBlockedReason && !status.tunnelOpen && <p className="text-xs text-muted-foreground">{openBlockedReason}</p>}
                {pending.length > 0 && <p className="text-xs text-muted-foreground">{pending.length} prévia(s) aguardam o túnel para sair do PC.</p>}
            </CardContent>
            <AlertDialog open={confirming} onOpenChange={setConfirming}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Fechar o túnel com prévias no PC?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {live.length} prévia(s) ficam fora do ar até o túnel reabrir ({live.map((item) => item.composeProject).join(", ")}). A limpeza dessas mesas espera o túnel.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => tunnel.mutate({ action: "close", confirm: true })}>Fechar túnel</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    )
}
