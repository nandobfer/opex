"use client"

import { useRef, type ReactNode } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { AnimatePresence, motion } from "framer-motion"
import { Mic, SendHorizontal, Smile } from "lucide-react"
import { Button } from "@/components/ui/button"
import { chatTextSchema } from "@/features/evolution-api/schemas"
import type { AttachKind } from "../../../chat-attachments"
import type { useVoiceRecorder } from "../../../hooks/useVoiceRecorder"
import { EmojiPickerPopover } from "../EmojiPickerPopover"
import { AttachMenu } from "./AttachMenu"
import { VoiceRecorderBar } from "./VoiceRecorderBar"

/** Mesmo limite e mensagens do texto da rota (`chatTextSchema`). */
const composerSchema = z.object({ text: chatTextSchema.shape.text })
type ComposerValues = z.input<typeof composerSchema>

interface ComposerProps {
    disabled: boolean
    disabledReason?: ReactNode
    onSend: (text: string) => void
    onFiles: (files: File[], kind: AttachKind) => void
    onContact: () => void
    onLocation: () => void
    recorder: ReturnType<typeof useVoiceRecorder>
    onVoiceSend: () => void
    replyBar?: ReactNode
}

const ICON_BUTTON = "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"

/**
 * Compositor no padrão do WhatsApp Web (cópia do Atendimento, sem templates nem interativas): "+" (anexos, contato,
 * localização), emoji, texto (Enter envia; Shift+Enter quebra a linha), microfone ou enviar. Sem `<form>`: as abas de
 * Integrações › IA ficam dentro do formulário do editor, e um `<form>` aninhado enviaria o de fora.
 */
export function Composer({ disabled, disabledReason, onSend, onFiles, onContact, onLocation, recorder, onVoiceSend, replyBar }: ComposerProps) {
    const textarea = useRef<HTMLTextAreaElement | null>(null)
    const form = useForm<ComposerValues>({ resolver: zodResolver(composerSchema), defaultValues: { text: "" }, mode: "onChange" })
    const text = form.watch("text")
    const tooLong = text.length > 0 ? form.formState.errors.text?.message : undefined
    const recording = recorder.status === "recording"

    const submit = form.handleSubmit((values) => {
        onSend(values.text.trim())
        form.reset({ text: "" })
    })

    const insertEmoji = (emoji: string) => {
        const node = textarea.current
        const start = node?.selectionStart ?? text.length
        const end = node?.selectionEnd ?? text.length
        form.setValue("text", `${text.slice(0, start)}${emoji}${text.slice(end)}`, { shouldValidate: true, shouldDirty: true })
        requestAnimationFrame(() => {
            node?.focus()
            node?.setSelectionRange(start + emoji.length, start + emoji.length)
        })
    }
    const { ref: registerRef, ...textField } = form.register("text")

    return (
        <div className="shrink-0 border-t border-border bg-card px-3 py-2">
            {disabled && disabledReason && <p role="status" className="mb-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">{disabledReason}</p>}
            {!disabled && replyBar}
            {recorder.error && (
                <p role="alert" className="mb-2 rounded-md bg-destructive/15 px-3 py-2 text-xs text-destructive">
                    {recorder.error}
                </p>
            )}
            <div className="flex items-end gap-1">
                <AnimatePresence mode="wait" initial={false}>
                    {recording ? (
                        <VoiceRecorderBar key="recording" elapsed={recorder.elapsed} analyser={recorder.analyser} onCancel={recorder.cancel} onSend={onVoiceSend} />
                    ) : (
                        <motion.div key="text" className="flex flex-1 items-end gap-1" initial={false} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <AttachMenu disabled={disabled} onFiles={onFiles} onContact={onContact} onLocation={onLocation} />
                            <EmojiPickerPopover
                                onSelect={insertEmoji}
                                trigger={
                                    <button type="button" className={ICON_BUTTON} disabled={disabled} aria-label="Emojis">
                                        <Smile className="h-6 w-6" aria-hidden />
                                    </button>
                                }
                            />
                            <textarea
                                {...textField}
                                ref={(node) => {
                                    registerRef(node)
                                    textarea.current = node
                                }}
                                rows={1}
                                disabled={disabled}
                                aria-label="Mensagem"
                                placeholder={disabled ? "Envio indisponível" : "Digite uma mensagem"}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                                        event.preventDefault()
                                        void submit()
                                    }
                                }}
                                onPaste={(event) => {
                                    const files = Array.from(event.clipboardData?.files ?? [])
                                    if (files.length && !disabled) {
                                        event.preventDefault()
                                        onFiles(files, "media")
                                    }
                                }}
                                className="max-h-32 min-h-10 flex-1 resize-none rounded-lg border-0 bg-muted px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
                            />
                            {!text.trim() ? (
                                <button type="button" className={ICON_BUTTON} disabled={disabled || recorder.status === "requesting"} onClick={() => void recorder.start()} aria-label="Gravar mensagem de voz">
                                    <Mic className="h-6 w-6" aria-hidden />
                                </button>
                            ) : (
                                <Button type="button" size="icon" className="h-10 w-10 rounded-full" disabled={disabled || Boolean(tooLong)} onClick={() => void submit()} aria-label="Enviar mensagem">
                                    <SendHorizontal aria-hidden />
                                </Button>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
            {tooLong && <p className="mt-1 text-xs text-destructive">{tooLong}</p>}
        </div>
    )
}
