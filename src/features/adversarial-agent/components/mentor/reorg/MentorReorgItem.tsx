"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { ArrowRightLeft, Check, FilePenLine, Info, Merge, ShieldAlert, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { MEMORY_TEXT_MAX } from "@/features/ai/memory-text"
import { MENTOR_REORG_ACTION_LABELS, MENTOR_REORG_ITEM_STATUS_LABELS, MENTOR_TARGET_LABELS, type MentorReorgAction } from "../../../mentor/constants"
import type { MentorReorgItemDto } from "../../../mentor/types"

const ACTION_ICON: Record<MentorReorgAction, typeof Check> = { keep: Check, rewrite: FilePenLine, move: ArrowRightLeft, merge: Merge }
const ACTION_TONE: Record<MentorReorgAction, string> = {
    keep: "border-transparent bg-muted text-muted-foreground",
    rewrite: "border-transparent bg-sky-500/15 text-sky-300",
    move: "border-transparent bg-primary/15 text-primary",
    merge: "border-transparent bg-amber-500/15 text-amber-300",
}

export interface MentorReorgItemProps {
    item: MentorReorgItemDto
    busy: boolean
    onApprove: (override: { text?: string; confirmOwner?: boolean }) => void
    onDiscard: () => void
}

/** Uma memória do Plano de reorganização: origem, ação, destino, texto proposto, motivo e decisão. */
export function MentorReorgItem({ item, busy, onApprove, onDiscard }: MentorReorgItemProps) {
    const [draft, setDraft] = useState<string | null>(null)
    const [confirmOwner, setConfirmOwner] = useState(false)
    const Icon = ACTION_ICON[item.action]
    const pending = item.status === "pending"
    const text = draft ?? item.text ?? ""
    const tooLong = text.length > MEMORY_TEXT_MAX
    return (
        <motion.article layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }} className="space-y-2 rounded-lg border bg-card/40 p-3">
            <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Badge className={ACTION_TONE[item.action]}>
                    <Icon className="mr-1 h-3 w-3" aria-hidden /> {MENTOR_REORG_ACTION_LABELS[item.action]}
                </Badge>
                <span className="min-w-0 flex-1 truncate text-sm font-medium" title={item.origin.resumo}>
                    {item.origin.resumo}
                </span>
                <span className="text-[11px] text-muted-foreground">{MENTOR_TARGET_LABELS[item.origin.target].short}</span>
                {!pending && <Badge variant="outline">{MENTOR_REORG_ITEM_STATUS_LABELS[item.status]}</Badge>}
            </header>
            <p className="text-xs text-muted-foreground">
                Destino: <span className="text-foreground">{item.targetLabel}</span>
                {item.action === "merge" && item.mergeIntoResumo ? ` · funde em “${item.mergeIntoResumo}”` : ""}
            </p>
            {item.text && (
                <blockquote aria-label="Texto proposto" className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-md border bg-background/40 px-3 py-2 text-sm leading-relaxed">
                    {item.text}
                </blockquote>
            )}
            {pending && item.text && (
                <div className="space-y-1">
                    <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={() => setDraft(draft === null ? item.text ?? "" : null)}>
                        <FilePenLine className="h-3.5 w-3.5" aria-hidden /> {draft === null ? "Editar texto" : "Fechar edição"}
                    </Button>
                    {draft !== null && (
                        <Textarea aria-label="Texto proposto editado" rows={5} className="leading-relaxed" value={draft} onChange={(event) => setDraft(event.target.value)} />
                    )}
                    {tooLong && <p className="text-xs text-destructive">{`Até ${MEMORY_TEXT_MAX.toLocaleString("pt-BR")} caracteres`}</p>}
                </div>
            )}
            {item.reason && <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground">Motivo: {item.reason}</p>}
            {item.note && <p className="text-xs text-amber-300">{item.note}</p>}
            {item.sanitizerReason && <p className="text-xs text-muted-foreground">Sanitizador: {item.sanitizerReason}</p>}
            {item.moveBlocked && (
                <p className="flex items-start gap-1.5 text-xs text-destructive">
                    <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> O token do Agente Mentor não alcança esta lista: ajuste as assinaturas do agente opex/mentor no Engramind.
                </p>
            )}
            {pending && item.action !== "keep" && (
                <div className="flex flex-wrap items-center gap-2 border-t pt-2">
                    {item.ownerMemory && item.action === "merge" && (
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Checkbox id={`reorg-owner-${item.id}`} checked={confirmOwner} onCheckedChange={(value) => setConfirmOwner(value)} />
                            <label htmlFor={`reorg-owner-${item.id}`}>Confirmo arquivar a memória do dono</label>
                        </span>
                    )}
                    {item.ownerMemory && item.action === "merge" && <p className="flex w-full items-start gap-1.5 text-xs text-muted-foreground"><Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden /> Ela não é excluída: fica arquivada no Engramind e pode ser restaurada.</p>}
                    <Button type="button" size="sm" className="ml-auto gap-1" disabled={busy || tooLong || (item.action === "merge" && item.ownerMemory && !confirmOwner)} onClick={() => onApprove({ ...(draft !== null ? { text: draft } : {}), ...(item.ownerMemory && item.action === "merge" ? { confirmOwner } : {}) })}>
                        <Check className="h-3.5 w-3.5" aria-hidden /> Aprovar
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="gap-1" disabled={busy} onClick={onDiscard}>
                        <X className="h-3.5 w-3.5" aria-hidden /> Descartar
                    </Button>
                </div>
            )}
            {pending && item.action === "keep" && <p className="text-xs text-muted-foreground">Sem alterações: a memória fica como está.</p>}
            {item.error && <p role="alert" className="text-xs text-destructive">{item.error}</p>}
        </motion.article>
    )
}
