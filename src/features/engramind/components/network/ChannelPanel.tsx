"use client"

import { useState } from "react"
import Link from "next/link"
import { Archive, ExternalLink, Pencil, RotateCcw, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ENGRAMIND_PAGE_HREF } from "../../constants"
import type { EngramindChannel } from "../../types"
import { engramindSend, route, useEngramindMutation } from "../../hooks/useEngramind"
import { ChannelDialog } from "../page/channels/ChannelDialog"
import { ChannelSettingsCard } from "../page/channels/ChannelSettingsCard"
import { SubscribersCard } from "../page/channels/SubscribersCard"

type ChannelAction = "archive" | "restore" | "delete"

const CONFIRM: Record<"archive" | "delete", { title: (slug: string) => string; description: string; label: string }> = {
    archive: { title: (slug) => `Arquivar o canal ${slug}?`, description: "Sai do contexto, da busca e das dicas e deixa de receber escrita. Restaurar desfaz.", label: "Arquivar" },
    delete: { title: (slug) => `Excluir de vez o canal ${slug}?`, description: "Saem junto as memórias (com as revisões) e as assinaturas exatas. Não dá para desfazer.", label: "Excluir de vez" },
}

/**
 * Painel lateral do canal (menu "⋯" ou botão direito no node): Editar (slug imutável), Assinantes,
 * Configurações do canal e Arquivar / Restaurar / Excluir de vez (só arquivado), com confirmação.
 */
export function ChannelPanel({ channel, onOpenChange, onDeleted }: { channel: EngramindChannel | null; onOpenChange: (open: boolean) => void; onDeleted?: (slug: string) => void }) {
    const [editing, setEditing] = useState(false)
    const [confirm, setConfirm] = useState<"archive" | "delete" | null>(null)
    const act = useEngramindMutation(({ action, slug }: { action: ChannelAction; slug: string }) => (action === "delete" ? engramindSend("delete", route("channels", slug)) : engramindSend("post", route("channels", slug, action), {})), {
        invalidate: ["channels", "memories"],
        success: ({ action }) => (action === "archive" ? "Canal arquivado" : action === "restore" ? "Canal restaurado" : "Canal excluído"),
    })
    const archived = Boolean(channel?.archived_at)
    return (
        <>
            <Sheet open={channel !== null} onOpenChange={onOpenChange}>
                <SheetContent side="right" className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-2xl">
                    {channel && (
                        <>
                            <SheetHeader>
                                <SheetTitle>{channel.name}</SheetTitle>
                                <SheetDescription>
                                    Canal {channel.slug}
                                    {archived ? " (arquivado)" : ""}
                                </SheetDescription>
                            </SheetHeader>
                            <div className="flex flex-wrap gap-2">
                                <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)}>
                                    <Pencil className="mr-1.5 h-4 w-4" aria-hidden /> Editar
                                </Button>
                                {archived ? (
                                    <>
                                        <Button type="button" variant="outline" size="sm" disabled={act.isPending} onClick={() => act.mutate({ action: "restore", slug: channel.slug })}>
                                            <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden /> Restaurar
                                        </Button>
                                        <Button type="button" variant="destructive" size="sm" onClick={() => setConfirm("delete")}>
                                            <Trash2 className="mr-1.5 h-4 w-4" aria-hidden /> Excluir de vez
                                        </Button>
                                    </>
                                ) : (
                                    <Button type="button" variant="outline" size="sm" onClick={() => setConfirm("archive")}>
                                        <Archive className="mr-1.5 h-4 w-4" aria-hidden /> Arquivar
                                    </Button>
                                )}
                                <Button asChild variant="ghost" size="sm" className="ml-auto">
                                    <Link href={`${ENGRAMIND_PAGE_HREF}/canais/${encodeURIComponent(channel.slug)}`}>
                                        <ExternalLink className="mr-1.5 h-4 w-4" aria-hidden /> Abrir detalhe
                                    </Link>
                                </Button>
                            </div>
                            <SubscribersCard channel={channel.slug} />
                            <ChannelSettingsCard channel={channel.slug} />
                        </>
                    )}
                </SheetContent>
            </Sheet>
            {editing && channel && <ChannelDialog key={channel.id} channel={channel} open onOpenChange={(open) => !open && setEditing(false)} />}
            <ConfirmDialog
                open={confirm !== null && channel !== null}
                onOpenChange={(open) => !open && setConfirm(null)}
                title={confirm && channel ? CONFIRM[confirm].title(channel.slug) : ""}
                description={confirm ? CONFIRM[confirm].description : undefined}
                confirmLabel={confirm ? CONFIRM[confirm].label : ""}
                variant="destructive"
                pending={act.isPending}
                onConfirm={() => {
                    if (!confirm || !channel) return
                    const slug = channel.slug
                    act.mutate(
                        { action: confirm, slug },
                        {
                            onSuccess: () => {
                                if (confirm === "delete") {
                                    onOpenChange(false)
                                    onDeleted?.(slug)
                                }
                            },
                            onSettled: () => setConfirm(null),
                        },
                    )
                }}
            />
        </>
    )
}
