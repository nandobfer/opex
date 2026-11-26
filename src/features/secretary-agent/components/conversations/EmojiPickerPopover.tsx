"use client"

import { useState, type ReactNode } from "react"
import dynamic from "next/dynamic"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"

type PickerProps = { onEmoji: (emoji: string) => void }

/**
 * Seletor de emojis (a mesma biblioteca do Atendimento do Zaturno CRM), em pt-BR e no tema escuro. A biblioteca e o
 * dicionário pt entram juntos só quando o seletor abre (nada dela no carregamento da aba).
 */
const Picker = dynamic<PickerProps>(
    () =>
        Promise.all([import("emoji-picker-react"), import("emoji-picker-react/dist/data/emojis-pt.js")]).then(([library, data]) => {
            const EmojiPicker = library.default
            function LoadedPicker({ onEmoji }: PickerProps) {
                return (
                    <EmojiPicker
                        theme={library.Theme.DARK}
                        emojiStyle={library.EmojiStyle.NATIVE}
                        emojiData={data.default}
                        lazyLoadEmojis
                        searchPlaceholder="Pesquisar emoji"
                        width={300}
                        height={340}
                        previewConfig={{ showPreview: false }}
                        onEmojiClick={(emoji) => emoji.emoji && onEmoji(emoji.emoji)}
                    />
                )
            }
            return LoadedPicker
        }),
    { ssr: false, loading: () => <Skeleton className="h-[340px] w-[300px]" /> },
)

interface EmojiPickerPopoverProps {
    trigger: ReactNode
    onSelect: (emoji: string) => void
    /** Fecha ao escolher (reações) ou mantém aberto (compositor). */
    closeOnSelect?: boolean
    side?: "top" | "bottom"
    align?: "start" | "end" | "center"
}

export function EmojiPickerPopover({ trigger, onSelect, closeOnSelect = false, side = "top", align = "start" }: EmojiPickerPopoverProps) {
    const [open, setOpen] = useState(false)
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>{trigger}</PopoverTrigger>
            <PopoverContent side={side} align={align} className="w-auto border-0 p-0 shadow-lg">
                {open && (
                    <Picker
                        onEmoji={(emoji) => {
                            onSelect(emoji)
                            if (closeOnSelect) setOpen(false)
                        }}
                    />
                )}
            </PopoverContent>
        </Popover>
    )
}
