"use client"

import { useCallback } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FORM_GRID } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { createChannelInput, updateChannelInput } from "../../../operations"
import { CHANNEL_HELP } from "../../../help/identities"
import type { EngramindChannel } from "../../../types"
import { engramindSend, route, useEngramindMutation } from "../../../hooks/useEngramind"
import { InfoField } from "../../shared/InfoField"
import { emptyTo, useSchemaForm } from "../../shared/useSchemaForm"

type Values = { slug: string; name: string; description: string; priority: string }

/** Criar ou editar canal (o slug é imutável). */
export function ChannelDialog({ channel, open, onOpenChange }: { channel: EngramindChannel | null; open: boolean; onOpenChange: (open: boolean) => void }) {
    const editing = channel !== null
    const toPayload = useCallback(
        (values: Values) => {
            const priority = values.priority.trim() === "" ? undefined : Number(values.priority)
            return editing
                ? { channel: channel.slug, name: values.name.trim(), description: emptyTo(values.description, null), priority }
                : { slug: values.slug.trim(), name: values.name.trim(), description: emptyTo(values.description, undefined), priority }
        },
        [channel, editing],
    )
    const form = useSchemaForm<Values, unknown>(editing ? updateChannelInput : createChannelInput, { slug: channel?.slug ?? "", name: channel?.name ?? "", description: channel?.description ?? "", priority: channel ? String(channel.priority) : "" }, toPayload)
    const save = useEngramindMutation(({ channel: slug, ...body }: Record<string, unknown>) => (editing ? engramindSend("patch", route("channels", String(slug)), body) : engramindSend("post", "channels", body)), {
        invalidate: ["channels"],
        success: editing ? "Canal atualizado" : "Canal criado",
    })
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>{editing ? `Editar canal ${channel.slug}` : "Novo canal"}</DialogTitle>
                    <DialogDescription>Memórias pertencem a canais. Agentes alcançam um canal quando o assinam.</DialogDescription>
                </DialogHeader>
                <div className={FORM_GRID}>
                    <InfoField id="channel-slug" label="Slug" info={CHANNEL_HELP.slug} error={form.error("slug")}>
                        <Input id="channel-slug" value={form.values.slug} onChange={(event) => form.set("slug", event.target.value)} disabled={editing} placeholder="eng/global" />
                    </InfoField>
                    <InfoField id="channel-name" label="Nome" error={form.error("name")}>
                        <Input id="channel-name" value={form.values.name} onChange={(event) => form.set("name", event.target.value)} placeholder="Engenharia global" />
                    </InfoField>
                    <InfoField id="channel-priority" label="Prioridade" info={CHANNEL_HELP.priority} error={form.error("priority")}>
                        <Input id="channel-priority" type="number" value={form.values.priority} onChange={(event) => form.set("priority", event.target.value)} placeholder="0" />
                    </InfoField>
                    <InfoField id="channel-description" label="Descrição" error={form.error("description")}>
                        <Textarea id="channel-description" rows={2} value={form.values.description} onChange={(event) => form.set("description", event.target.value)} />
                    </InfoField>
                </div>
                <DialogFooter>
                    <Button type="button" disabled={!form.valid || save.isPending} onClick={() => form.payload && save.mutate(form.payload as Record<string, unknown>, { onSuccess: () => onOpenChange(false) })}>
                        {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} {editing ? "Salvar" : "Criar canal"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
