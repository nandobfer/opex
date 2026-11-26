"use client"

import { useState } from "react"
import { ChevronDown, Download, Plus, Reply, SmilePlus } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { EmojiPickerPopover } from "../EmojiPickerPopover"

export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const

/** Seta do balão (WhatsApp Web): Responder e Baixar. */
export function MessageMenu({ out, canReply, downloadHref, onReply }: { out: boolean; canReply: boolean; downloadHref: string | null; onReply: () => void }) {
    if (!canReply && !downloadHref) return null
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    aria-label="Mais opções da mensagem"
                    className={cn("absolute right-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100", out ? "bg-primary" : "bg-muted")}
                >
                    <ChevronDown className="h-4 w-4" aria-hidden />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={out ? "end" : "start"} className="w-44">
                {canReply && (
                    <DropdownMenuItem onSelect={onReply}>
                        <Reply className="h-4 w-4" aria-hidden /> Responder
                    </DropdownMenuItem>
                )}
                {downloadHref && (
                    <DropdownMenuItem asChild>
                        <a href={downloadHref} download>
                            <Download className="h-4 w-4" aria-hidden /> Baixar
                        </a>
                    </DropdownMenuItem>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

/** Botão de reagir ao lado do balão: seis rápidas + seletor completo. Tocar na atual remove. */
export function ReactionButton({ current, onReact }: { current: string | null; onReact: (emoji: string) => void }) {
    const [open, setOpen] = useState(false)
    const choose = (emoji: string) => {
        setOpen(false)
        onReact(emoji === current ? "" : emoji)
    }
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label="Reagir à mensagem"
                    className="flex h-7 w-7 shrink-0 items-center justify-center self-center rounded-full bg-foreground/5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
                >
                    <SmilePlus className="h-4 w-4" aria-hidden />
                </button>
            </PopoverTrigger>
            <PopoverContent side="top" className="flex w-auto items-center gap-1 rounded-full p-1.5">
                {QUICK_REACTIONS.map((emoji) => (
                    <button
                        key={emoji}
                        type="button"
                        onClick={() => choose(emoji)}
                        aria-label={emoji === current ? `Remover reação ${emoji}` : `Reagir com ${emoji}`}
                        className={cn("flex h-9 w-9 items-center justify-center rounded-full text-xl transition-transform hover:scale-125", emoji === current && "bg-muted")}
                    >
                        {emoji}
                    </button>
                ))}
                <EmojiPickerPopover
                    closeOnSelect
                    onSelect={choose}
                    trigger={
                        <button type="button" aria-label="Mais emojis" className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground hover:text-foreground">
                            <Plus className="h-4 w-4" aria-hidden />
                        </button>
                    }
                />
            </PopoverContent>
        </Popover>
    )
}
