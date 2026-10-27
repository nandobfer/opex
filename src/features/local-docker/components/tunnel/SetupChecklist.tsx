"use client"

import { AnimatePresence, motion } from "framer-motion"
import { ArrowRight, CheckCircle2, Circle, Loader2, PartyPopper } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { BuilderMachineTab } from "../../constants"
import { useLocalDockerMachine, useLocalDockerTunnel } from "../../hooks/useLocalDocker"
import type { LocalDockerSettingsDto, LocalDockerStatusDto } from "../../types"

export interface ChecklistItem {
    id: "config" | "key" | "reachable" | "tunnel" | "prepared"
    label: string
    done: boolean
    hint: string
}

/** Passos da configuração na ordem em que precisam acontecer (puro, para os testes). */
export function setupChecklist(saved: LocalDockerSettingsDto, status: LocalDockerStatusDto | undefined, unsaved: boolean): ChecklistItem[] {
    return [
        { id: "config", label: "Configuração da conexão salva", done: !unsaved, hint: "Preencha e salve a aba Conexão com o PC" },
        { id: "key", label: "Chave do servidor", done: saved.key.configured, hint: "Gere ou insira a chave na aba Preparo do PC" },
        { id: "reachable", label: "PC acessível (script rodado no WSL)", done: Boolean(status?.reachable), hint: "Rode o script do WSL (aba Preparo do PC) e teste a conexão" },
        { id: "tunnel", label: "Túnel do Docker aberto", done: Boolean(status?.tunnelOpen), hint: "Abra o túnel para as prévias irem para o PC" },
        { id: "prepared", label: "Docker do PC preparado", done: Boolean(saved.lastPrepare?.ok), hint: "Crie a rede, os apelidos e o builder dedicado" },
    ]
}

const rowMotion = { initial: { opacity: 0, x: -4 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, height: 0 }, transition: { duration: 0.18 } }

/** Status da configuração com atalho para cada passo que falta. */
export function SetupChecklist({ saved, status, unsaved, goTo }: { saved: LocalDockerSettingsDto; status: LocalDockerStatusDto | undefined; unsaved: boolean; goTo: (tab: BuilderMachineTab) => void }) {
    const machine = useLocalDockerMachine()
    const tunnel = useLocalDockerTunnel()
    const items = setupChecklist(saved, status, unsaved)
    const pending = items.filter((item) => !item.done)

    const shortcut = (item: ChecklistItem) => {
        const busy = (item.id === "reachable" && machine.isPending && machine.variables === "test") || (item.id === "prepared" && machine.isPending && machine.variables === "prepare") || (item.id === "tunnel" && tunnel.isPending)
        const blocked = items.slice(0, items.indexOf(item)).some((previous) => !previous.done)
        const props = { type: "button" as const, size: "sm" as const, variant: "outline" as const, className: "h-8 gap-1.5", disabled: busy || (blocked && item.id !== "config" && item.id !== "key") }
        const icon = busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        if (item.id === "config") return <Button {...props} onClick={() => goTo("conexao")}>{icon} Abrir Conexão</Button>
        if (item.id === "key") return <Button {...props} onClick={() => goTo("preparo")}>{icon} Abrir Preparo</Button>
        if (item.id === "reachable") return <Button {...props} onClick={() => machine.mutate("test")}>{icon} Testar conexão</Button>
        if (item.id === "tunnel") return <Button {...props} onClick={() => tunnel.mutate({ action: "open" })}>{icon} Abrir túnel</Button>
        return <Button {...props} onClick={() => machine.mutate("prepare")}>{icon} Preparar o PC</Button>
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Configuração</CardTitle>
                <CardDescription>{pending.length === 0 ? "Tudo pronto: com o túnel aberto as prévias vão para o PC." : `${pending.length} passo(s) pendente(s), na ordem em que precisam acontecer.`}</CardDescription>
            </CardHeader>
            <CardContent>
                <ul className="space-y-2">
                    <AnimatePresence initial={false}>
                        {items.map((item) => (
                            <motion.li key={item.id} {...rowMotion} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
                                <span className="flex min-w-0 items-start gap-2">
                                    {item.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-label="Concluído" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-label="Pendente" />}
                                    <span className="min-w-0">
                                        <span className="block text-sm font-medium">{item.label}</span>
                                        {!item.done && <span className="block text-xs text-muted-foreground">{item.hint}</span>}
                                    </span>
                                </span>
                                {!item.done && shortcut(item)}
                            </motion.li>
                        ))}
                    </AnimatePresence>
                </ul>
                <AnimatePresence initial={false}>
                    {pending.length === 0 && (
                        <motion.p key="ready" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-3 flex items-center gap-1.5 text-xs text-success">
                            <PartyPopper className="h-3.5 w-3.5" aria-hidden /> Builder Machine pronta
                        </motion.p>
                    )}
                </AnimatePresence>
            </CardContent>
        </Card>
    )
}
