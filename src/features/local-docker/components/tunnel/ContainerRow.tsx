"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { Play, RotateCcw, Square, Trash2 } from "lucide-react"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { IconAction } from "@/components/ui/icon-action"
import type { LocalDockerContainerAction } from "../../schemas"
import type { LocalDockerContainerDto } from "../../types"

const KIND_LABELS: Record<LocalDockerContainerDto["kind"], string> = { preview: "Prévia", alias: "Apelido", builder: "Builder" }

/** O que "apagar com o ambiente" leva junto, por tipo (texto da confirmação). */
export function deleteDescription(item: LocalDockerContainerDto): string {
    if (item.kind === "preview") return `Apaga a prévia ${item.composeProject} inteira no PC: containers, volumes, rede e imagens. O repasse da porta ${item.port ?? ""} é cancelado e a mesa fica com a prévia fora do ar até o próximo build da prévia.`
    if (item.kind === "builder") return "Apaga o builder dedicado e todo o cache de build dele. O próximo preparo cria outro (o primeiro build volta a ser sem cache)."
    return `Apaga o container do apelido ${item.alias ?? item.name} (e a imagem do repasse, se nenhum outro a usa). As prévias no PC deixam de alcançar esse serviço até o próximo preparo.`
}

const running = (item: LocalDockerContainerDto) => item.state === "running"

/** Um container do PC: estado, CPU/memória e as ações (apagar pede confirmação). */
export function ContainerRow({ item, busyAction, onAction }: { item: LocalDockerContainerDto; busyAction: LocalDockerContainerAction | null; onAction: (action: LocalDockerContainerAction, confirm?: boolean) => void }) {
    const [confirming, setConfirming] = useState(false)
    const busy = busyAction !== null
    const title = item.kind === "preview" ? `${item.taskCode ?? item.composeProject}${item.service ? ` · ${item.service}` : ""}` : (item.alias ?? item.name)
    return (
        <motion.li initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2">
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">{title}</span>
                    <Badge variant="outline" className="text-[10px]">{KIND_LABELS[item.kind]}</Badge>
                    <Badge variant={running(item) ? "default" : "secondary"} className="text-[10px]">{running(item) ? "Rodando" : item.state === "exited" ? "Parado" : item.state}</Badge>
                </div>
                <p className="truncate font-mono text-xs text-muted-foreground">
                    {item.name}
                    {item.kind === "preview" && item.port ? ` · porta ${item.port}` : ""}
                    {item.target ? ` · → ${item.target}` : ""}
                </p>
            </div>
            <div className="flex w-40 shrink-0 flex-col text-xs text-muted-foreground" aria-label={`Uso de ${item.name}`}>
                <span>CPU {item.stats ? `${item.stats.cpuPercent.toFixed(1)}%` : "—"}</span>
                <span className="truncate">RAM {item.stats ? `${item.stats.memoryUsage} (${item.stats.memoryPercent.toFixed(1)}%)` : "—"}</span>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
                <IconAction icon={Play} label={`Levantar ${item.name}`} disabledReason={running(item) ? "Já está rodando" : null} busy={busyAction === "start"} onClick={() => onAction("start")} />
                <IconAction icon={Square} label={`Derrubar ${item.name}`} disabledReason={!running(item) ? "Já está parado" : null} busy={busyAction === "stop"} onClick={() => onAction("stop")} />
                <IconAction icon={RotateCcw} label={`Recriar ${item.name}`} disabledReason={busy && busyAction !== "recreate" ? "Outra ação em andamento" : null} busy={busyAction === "recreate"} onClick={() => onAction("recreate")} />
                <IconAction icon={Trash2} tone="danger" label={`Apagar ${item.name} e o ambiente`} disabledReason={busy && busyAction !== "delete" ? "Outra ação em andamento" : null} busy={busyAction === "delete"} onClick={() => setConfirming(true)} />
            </div>
            <AlertDialog open={confirming} onOpenChange={setConfirming}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Apagar {title} e o ambiente?</AlertDialogTitle>
                        <AlertDialogDescription>{deleteDescription(item)}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => onAction("delete", true)}>
                            Apagar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </motion.li>
    )
}
