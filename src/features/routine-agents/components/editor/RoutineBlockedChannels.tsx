"use client"

import { useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Ban, Link2, Unlock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Combobox } from "@/components/ui/combobox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useEngramindList } from "@/features/engramind/hooks/useEngramind"
import type { EngramindChannel } from "@/features/engramind/types"
import { formatDateTime } from "../../format"
import { isEligibleExtraChannel } from "../../provision-plan"
import { useRoutineChannelAction } from "../../hooks/useRoutineAgents"
import type { RoutineAgentDto } from "../../types"

type Pending = { kind: "block" | "resubscribe"; channel: string }

/**
 * Canais bloqueados deste agente (OPE-143): o provisionamento nunca os assina nem cria. Cada um pode ser
 * **assinado de novo** (assina, volta aos extras e sai do bloqueio) ou só **desbloqueado**. O campo
 * "Bloquear canal" bloqueia um canal elegível que não está nos extras (cancelando a assinatura, se houver).
 */
export function RoutineBlockedChannels({ agent, disabled }: { agent: RoutineAgentDto; disabled: boolean }) {
    const { blocked, extras, channels: base } = agent.provisioning
    const action = useRoutineChannelAction()
    const channels = useEngramindList<EngramindChannel>("channels", "channels", undefined, { all: true })
    const [picked, setPicked] = useState("")
    const [pending, setPending] = useState<Pending | null>(null)
    const options = useMemo(() => {
        const taken = new Set([...base, "opex", "agentes/rotineiros/global", agent.channel, ...extras.map((item) => item.channel), ...blocked.map((item) => item.channel)])
        return channels.items
            .filter((channel) => !channel.archived_at && isEligibleExtraChannel(channel.slug) && !taken.has(channel.slug))
            .map((channel) => ({ value: channel.slug, label: channel.slug, description: channel.name !== channel.slug ? channel.name : undefined }))
    }, [channels.items, base, agent.channel, extras, blocked])
    const busy = disabled || action.isPending
    const run = (input: { action: "block" | "unblock" | "resubscribe"; channel: string }, after?: () => void) => action.mutate({ id: agent.id, ...input }, { onSuccess: after, onSettled: () => setPending(null) })
    return (
        <div className="space-y-2">
            <p className="text-xs font-semibold">Canais bloqueados</p>
            {blocked.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum. O provisionamento pode propor qualquer canal elegível.</p>
            ) : (
                <ul className="space-y-1.5">
                    <AnimatePresence initial={false}>
                        {blocked.map((item) => (
                            <motion.li key={item.channel} layout="position" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed p-2 text-xs">
                                <div className="min-w-0">
                                    <code>{item.channel}</code>
                                    <p className="text-muted-foreground">Bloqueado em {formatDateTime(item.at)}</p>
                                </div>
                                <div className="flex shrink-0 gap-1">
                                    <Button type="button" variant="outline" size="sm" className="h-7 gap-1 px-2" disabled={busy} onClick={() => setPending({ kind: "resubscribe", channel: item.channel })}>
                                        <Link2 className="h-3.5 w-3.5" aria-hidden /> Assinar de novo
                                    </Button>
                                    <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2" disabled={busy} onClick={() => run({ action: "unblock", channel: item.channel })}>
                                        <Unlock className="h-3.5 w-3.5" aria-hidden /> Desbloquear
                                    </Button>
                                </div>
                            </motion.li>
                        ))}
                    </AnimatePresence>
                </ul>
            )}
            <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                    <Combobox id="routine-block-channel" options={options} value={picked} onValueChange={setPicked} placeholder={channels.isLoading ? "Carregando canais…" : "Bloquear canal…"} emptyText="Nenhum canal disponível para bloquear" searchPlaceholder="Buscar canal…" />
                </div>
                <Button type="button" variant="outline" className="shrink-0 gap-1.5" disabled={busy || !picked} onClick={() => setPending({ kind: "block", channel: picked })}>
                    <Ban className="h-4 w-4" aria-hidden /> Bloquear
                </Button>
            </div>
            {channels.isError && <p className="text-xs text-destructive">Não foi possível listar os canais do Engramind. <button type="button" className="underline" onClick={() => void channels.refetch()}>Tentar novamente</button></p>}
            <ConfirmDialog
                open={pending !== null}
                onOpenChange={(open) => !open && setPending(null)}
                title={pending?.kind === "block" ? `Bloquear o canal ${pending.channel}?` : `Assinar de novo o canal ${pending?.channel ?? ""}?`}
                description={pending?.kind === "block" ? "Se o agente assina este canal, a assinatura é cancelada no Engramind (o canal e as memórias continuam). O provisionamento não volta a assinar nem criar este canal para este agente." : "O agente volta a ler e gravar neste canal (assinatura no Engramind), o canal volta aos extras e sai do bloqueio."}
                confirmLabel={pending?.kind === "block" ? "Bloquear canal" : "Assinar de novo"}
                variant={pending?.kind === "block" ? "destructive" : "default"}
                pending={action.isPending}
                onConfirm={() => pending && run({ action: pending.kind, channel: pending.channel }, () => pending.kind === "block" && setPicked(""))}
            />
        </div>
    )
}
