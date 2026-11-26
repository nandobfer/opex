"use client"

import { useRef, useState, type ComponentType, type RefObject } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { Camera, FileText, Headphones, Images, MapPin, Plus, UserRound } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ACCEPT, type AttachKind } from "../../../chat-attachments"

interface AttachMenuProps {
    disabled?: boolean
    onFiles: (files: File[], kind: AttachKind) => void
    onContact: () => void
    onLocation: () => void
}

type Key = "document" | "media" | "camera" | "audio" | "contact" | "location"
const ITEMS: { key: Key; label: string; icon: ComponentType<{ className?: string }> }[] = [
    { key: "document", label: "Documento", icon: FileText },
    { key: "media", label: "Fotos e vídeos", icon: Images },
    { key: "camera", label: "Câmera", icon: Camera },
    { key: "audio", label: "Áudio", icon: Headphones },
    { key: "contact", label: "Contato", icon: UserRound },
    { key: "location", label: "Localização", icon: MapPin },
]

type InputKind = AttachKind | "camera"

function HiddenFileInput({ kind, inputRef, onFiles }: { kind: InputKind; inputRef: RefObject<HTMLInputElement | null>; onFiles: AttachMenuProps["onFiles"] }) {
    return (
        <input
            ref={inputRef}
            type="file"
            className="hidden"
            multiple={kind === "media" || kind === "document"}
            accept={kind === "camera" ? "image/jpeg,image/png" : ACCEPT[kind]}
            {...(kind === "camera" ? { capture: "environment" as const } : {})}
            data-testid={`attach-input-${kind}`}
            onChange={(event) => {
                const files = Array.from(event.target.files ?? [])
                event.target.value = ""
                if (files.length) onFiles(files, kind === "camera" ? "media" : kind)
            }}
        />
    )
}

/** Menu "+" do compositor (WhatsApp Web), sem os itens de CRM do Atendimento: arquivos, contato e localização. */
export function AttachMenu({ disabled, onFiles, onContact, onLocation }: AttachMenuProps) {
    const reduceMotion = useReducedMotion()
    const [open, setOpen] = useState(false)
    const inputs = { document: useRef<HTMLInputElement>(null), media: useRef<HTMLInputElement>(null), camera: useRef<HTMLInputElement>(null), audio: useRef<HTMLInputElement>(null) }
    const choose = (key: Key) => {
        setOpen(false)
        if (key === "contact") return onContact()
        if (key === "location") return onLocation()
        inputs[key].current?.click()
    }
    return (
        <>
            {(["document", "media", "camera", "audio"] as const).map((kind) => <HiddenFileInput key={kind} kind={kind} inputRef={inputs[kind]} onFiles={onFiles} />)}
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <button type="button" disabled={disabled} aria-label="Anexar" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50">
                        <motion.span animate={{ rotate: open && !reduceMotion ? 45 : 0 }} transition={{ duration: 0.18 }} className="inline-flex">
                            <Plus className="h-6 w-6" aria-hidden />
                        </motion.span>
                    </button>
                </PopoverTrigger>
                <PopoverContent side="top" align="start" className="w-56 rounded-2xl p-1.5">
                    <motion.ul initial="hidden" animate="visible" variants={{ visible: { transition: { staggerChildren: 0.025 } } }} className="grid gap-0.5" role="menu" aria-label="Anexar">
                        {ITEMS.map((item) => {
                            const Icon = item.icon
                            return (
                                <motion.li key={item.key} variants={{ hidden: { opacity: 0, y: reduceMotion ? 0 : 6 }, visible: { opacity: 1, y: 0 } }} role="none">
                                    <button type="button" role="menuitem" onClick={() => choose(item.key)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-muted">
                                        <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden />
                                        <span className="flex-1">{item.label}</span>
                                    </button>
                                </motion.li>
                            )
                        })}
                    </motion.ul>
                </PopoverContent>
            </Popover>
        </>
    )
}
