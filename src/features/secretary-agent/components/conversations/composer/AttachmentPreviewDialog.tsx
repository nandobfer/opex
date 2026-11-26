"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { FileText, Headphones, Plus, SendHorizontal, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { CAPTION_MEDIA_TYPES, formatBytes, MAX_ATTACHMENTS, MAX_CAPTION } from "@/features/evolution-api/chat-media-rules"
import { documentLabel } from "../../../chat-timeline"
import type { AttachmentDraft } from "../../../hooks/useSendChatMessage"

interface AttachmentPreviewDialogProps {
    drafts: AttachmentDraft[]
    onChange: (drafts: AttachmentDraft[]) => void
    onAddFiles: (files: File[]) => void
    onSend: () => void
    onCancel: () => void
}

function useObjectUrls(drafts: AttachmentDraft[]) {
    const urls = useMemo(() => new Map(drafts.filter((draft) => draft.mediaType !== "document").map((draft) => [draft.id, typeof URL.createObjectURL === "function" ? URL.createObjectURL(draft.file) : ""])), [drafts])
    useEffect(() => () => urls.forEach((url) => url && URL.revokeObjectURL(url)), [urls])
    return urls
}

function Preview({ draft, url }: { draft: AttachmentDraft; url: string | undefined }) {
    // eslint-disable-next-line @next/next/no-img-element -- blob local
    if (draft.mediaType === "image") return <img src={url} alt={draft.file.name} className="max-h-[48vh] max-w-full rounded object-contain" />
    if (draft.mediaType === "video") return <video src={url} controls className="max-h-[48vh] max-w-full rounded" />
    return (
        <div className="flex flex-col items-center gap-3 text-center">
            <span className="flex h-24 w-20 items-end justify-center rounded-md bg-secondary pb-2 text-sm font-bold">
                {draft.mediaType === "audio" ? <Headphones className="mb-6 h-8 w-8" aria-hidden /> : documentLabel(draft.file.name, draft.mimeType)}
            </span>
            <p className="max-w-sm break-all text-sm font-medium">{draft.file.name}</p>
            <p className="text-xs text-muted-foreground">{formatBytes(draft.file.size)}</p>
        </div>
    )
}

/** Prévia antes de enviar (WhatsApp Web): miniaturas, legenda por arquivo, remover e adicionar. */
export function AttachmentPreviewDialog({ drafts, onChange, onAddFiles, onSend, onCancel }: AttachmentPreviewDialogProps) {
    const reduceMotion = useReducedMotion()
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const addInput = useRef<HTMLInputElement>(null)
    const urls = useObjectUrls(drafts)
    const selected = drafts.find((draft) => draft.id === selectedId) ?? drafts[0]
    const allowCaption = selected ? CAPTION_MEDIA_TYPES.includes(selected.mediaType) : false
    const update = (id: string, patch: Partial<AttachmentDraft>) => onChange(drafts.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)))
    const remove = (id: string) => onChange(drafts.filter((draft) => draft.id !== id))

    return (
        <Dialog open={drafts.length > 0} onOpenChange={(open) => !open && onCancel()}>
            <DialogContent className="flex max-h-[92vh] max-w-3xl flex-col gap-3 p-4" aria-describedby={undefined}>
                <DialogTitle className="text-base">{drafts.length === 1 ? "Enviar arquivo" : `Enviar ${drafts.length} arquivos`}</DialogTitle>
                <div className="flex min-h-[260px] flex-1 items-center justify-center rounded-lg bg-muted p-4">
                    <AnimatePresence mode="wait" initial={false}>
                        {selected && (
                            <motion.div key={selected.id} initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
                                <Preview draft={selected} url={urls.get(selected.id)} />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
                {selected && (
                    <input
                        value={selected.caption ?? ""}
                        maxLength={MAX_CAPTION}
                        disabled={!allowCaption}
                        onChange={(event) => update(selected.id, { caption: event.target.value })}
                        placeholder={allowCaption ? "Adicione uma legenda" : "Áudios não têm legenda"}
                        aria-label="Legenda"
                        className="h-10 w-full rounded-lg bg-muted px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60"
                    />
                )}
                <div className="flex items-center gap-2">
                    <ul className="flex flex-1 gap-2 overflow-x-auto py-1" aria-label="Arquivos selecionados">
                        <AnimatePresence initial={false}>
                            {drafts.map((draft) => (
                                <motion.li key={draft.id} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.15 }} className="relative shrink-0">
                                    <button type="button" onClick={() => setSelectedId(draft.id)} aria-label={`Ver ${draft.file.name}`} className={cn("flex h-14 w-14 items-center justify-center overflow-hidden rounded-md border-2 bg-muted", draft.id === selected?.id ? "border-primary" : "border-transparent")}>
                                        {draft.mediaType === "image" ? (
                                            // eslint-disable-next-line @next/next/no-img-element -- blob local
                                            <img src={urls.get(draft.id)} alt="" className="h-full w-full object-cover" />
                                        ) : draft.mediaType === "audio" ? (
                                            <Headphones className="h-6 w-6 text-muted-foreground" aria-hidden />
                                        ) : (
                                            <FileText className="h-6 w-6 text-muted-foreground" aria-hidden />
                                        )}
                                    </button>
                                    <button type="button" onClick={() => remove(draft.id)} aria-label={`Remover ${draft.file.name}`} className="absolute -right-1 -top-1 rounded-full bg-foreground/80 p-0.5 text-background">
                                        <X className="h-3 w-3" aria-hidden />
                                    </button>
                                </motion.li>
                            ))}
                        </AnimatePresence>
                        {drafts.length < MAX_ATTACHMENTS && (
                            <li className="shrink-0">
                                <button type="button" onClick={() => addInput.current?.click()} aria-label="Adicionar arquivo" className="flex h-14 w-14 items-center justify-center rounded-md border-2 border-dashed border-border text-muted-foreground hover:text-foreground">
                                    <Plus className="h-5 w-5" aria-hidden />
                                </button>
                                <input
                                    ref={addInput}
                                    type="file"
                                    multiple
                                    className="hidden"
                                    onChange={(event) => {
                                        const files = Array.from(event.target.files ?? [])
                                        event.target.value = ""
                                        if (files.length) onAddFiles(files)
                                    }}
                                />
                            </li>
                        )}
                    </ul>
                    <Button type="button" variant="ghost" onClick={onCancel}>
                        Cancelar
                    </Button>
                    <Button type="button" size="icon" className="h-12 w-12 rounded-full" onClick={onSend} aria-label="Enviar arquivos" disabled={drafts.length === 0}>
                        <SendHorizontal aria-hidden />
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
