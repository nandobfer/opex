"use client"

import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { X } from "lucide-react"
import type { QuotedRef } from "../../../hooks/useSendChatMessage"
import { QuotedPreview } from "../bubble/QuotedPreview"

/** Barra "respondendo a..." acima do compositor, como no WhatsApp Web. */
export function ReplyBar({ replyTo, authorLabel, onCancel }: { replyTo: QuotedRef | null; authorLabel: string; onCancel: () => void }) {
    const reduceMotion = useReducedMotion()
    return (
        <AnimatePresence initial={false}>
            {replyTo && (
                <motion.div key={replyTo.id} initial={{ opacity: 0, height: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, height: "auto", y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden" data-testid="reply-bar">
                    <div className="mb-2 flex items-center gap-2">
                        <QuotedPreview author={authorLabel} text={replyTo.text} className="bg-muted" />
                        <button type="button" onClick={onCancel} className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-foreground/5 hover:text-foreground" aria-label="Cancelar resposta">
                            <X className="h-5 w-5" aria-hidden />
                        </button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
