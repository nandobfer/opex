"use client"

import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { cn } from "@/lib/utils"
import type { ChatReactionDto } from "@/features/evolution-api/chat-message"

/** Reações sob o balão (como no WhatsApp): emojis agrupados, contagem e quem reagiu no título. */
export function ReactionsBadge({ reactions, out, contactName }: { reactions: ChatReactionDto[]; out: boolean; contactName: string }) {
    const reduceMotion = useReducedMotion()
    const groups = new Map<string, string[]>()
    for (const reaction of reactions) groups.set(reaction.emoji, [...(groups.get(reaction.emoji) ?? []), reaction.fromMe ? "Você" : (reaction.author?.split("@")[0] ?? contactName)])
    const title = [...groups.entries()].map(([emoji, names]) => `${emoji} ${names.join(", ")}`).join(" · ")
    return (
        <AnimatePresence>
            {reactions.length > 0 && (
                <motion.span
                    key="reactions"
                    initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.5 }}
                    transition={{ duration: 0.18 }}
                    title={title}
                    aria-label={`Reações: ${title}`}
                    className={cn("absolute -bottom-3 flex items-center gap-0.5 rounded-full border border-border bg-card px-1.5 py-px text-[13px] leading-5 text-foreground shadow-sm", out ? "right-3" : "left-3")}
                >
                    {[...groups.keys()].slice(0, 3).map((emoji) => (
                        <span key={emoji}>{emoji}</span>
                    ))}
                    {reactions.length > 1 && <span className="pl-0.5 text-[11px] text-muted-foreground">{reactions.length}</span>}
                </motion.span>
            )}
        </AnimatePresence>
    )
}
