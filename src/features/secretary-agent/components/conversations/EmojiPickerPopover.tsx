"use client"

import { useState, type ReactNode } from "react"
import dynamic from "next/dynamic"
import { EmojiStyle, Theme } from "emoji-picker-react"
import ptEmojiData from "emoji-picker-react/dist/data/emojis-pt.js"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"

/** Seletor de emojis (a mesma biblioteca do Atendimento do Zaturno CRM), carregado sob demanda, em pt-BR e no tema escuro. */
const Picker = dynamic(() => import("emoji-picker-react").then((module) => ({ default: module.default })), {
    ssr: false,
    loading: () => <Skeleton className="h-[340px] w-[300px]" />,
})

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
                        theme={Theme.DARK}
                        emojiStyle={EmojiStyle.NATIVE}
                        emojiData={ptEmojiData}
                        lazyLoadEmojis
                        searchPlaceholder="Pesquisar emoji"
                        width={300}
                        height={340}
                        previewConfig={{ showPreview: false }}
                        onEmojiClick={(data) => {
                            if (!data.emoji) return
                            onSelect(data.emoji)
                            if (closeOnSelect) setOpen(false)
                        }}
                    />
                )}
            </PopoverContent>
        </Popover>
    )
}
