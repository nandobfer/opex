"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Gravação de mensagem de voz com o `MediaRecorder` do navegador (OGG/Opus quando suportado, senão WebM/Opus): a
 * Evolution converte para o formato de voz do WhatsApp no envio (`sendWhatsAppAudio`). Adaptado do `useVoiceRecorder`
 * do Atendimento do Zaturno CRM, sem o encoder WebAssembly (desnecessário aqui). Exige HTTPS ou localhost.
 */

export type VoiceRecorderStatus = "idle" | "requesting" | "recording" | "error"

export interface VoiceRecording {
    file: File
    durationSeconds: number
}

const MIME_CANDIDATES = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/webm"] as const

export function useVoiceRecorder() {
    const [status, setStatus] = useState<VoiceRecorderStatus>("idle")
    const [error, setError] = useState<string | null>(null)
    const [elapsed, setElapsed] = useState(0)
    const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)
    const recorder = useRef<MediaRecorder | null>(null)
    const chunks = useRef<Blob[]>([])
    const stream = useRef<MediaStream | null>(null)
    const context = useRef<AudioContext | null>(null)
    const startedAt = useRef(0)
    const timer = useRef<ReturnType<typeof setInterval> | null>(null)

    const cleanup = useCallback(() => {
        if (timer.current) clearInterval(timer.current)
        timer.current = null
        stream.current?.getTracks().forEach((track) => track.stop())
        stream.current = null
        void context.current?.close().catch(() => undefined)
        context.current = null
        recorder.current = null
        setAnalyser(null)
    }, [])

    useEffect(() => cleanup, [cleanup])

    const start = useCallback(async () => {
        setError(null)
        if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
            setStatus("error")
            setError("Este navegador não permite gravar áudio aqui. Use HTTPS ou anexe um arquivo de áudio.")
            return
        }
        setStatus("requesting")
        try {
            const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
            const audioContext = new AudioContext()
            const node = audioContext.createAnalyser()
            node.fftSize = 256
            audioContext.createMediaStreamSource(media).connect(node)
            const mimeType = MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type))
            const instance = new MediaRecorder(media, mimeType ? { mimeType } : undefined)
            chunks.current = []
            instance.ondataavailable = (event) => {
                if (event.data.size) chunks.current.push(event.data)
            }
            instance.start()
            stream.current = media
            context.current = audioContext
            recorder.current = instance
            startedAt.current = Date.now()
            setElapsed(0)
            setAnalyser(node)
            setStatus("recording")
            timer.current = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 250)
        } catch (reason) {
            cleanup()
            setStatus("error")
            const denied = reason instanceof DOMException && (reason.name === "NotAllowedError" || reason.name === "SecurityError")
            setError(denied ? "Permita o uso do microfone no navegador para gravar." : "Não foi possível iniciar a gravação.")
        }
    }, [cleanup])

    /** Para e devolve o arquivo (ou `null` se nada foi gravado). */
    const stop = useCallback(async (): Promise<VoiceRecording | null> => {
        const instance = recorder.current
        if (!instance) return null
        const durationSeconds = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000))
        await new Promise<void>((resolve) => {
            instance.onstop = () => resolve()
            instance.stop()
            setTimeout(resolve, 5000)
        })
        const type = (instance.mimeType || "audio/webm").split(";")[0]!
        cleanup()
        setStatus("idle")
        const blob = new Blob(chunks.current, { type })
        if (!blob.size) return null
        const extension = type === "audio/ogg" ? "ogg" : "webm"
        return { file: new File([blob], `mensagem-de-voz-${Date.now()}.${extension}`, { type }), durationSeconds }
    }, [cleanup])

    const cancel = useCallback(() => {
        if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop()
        chunks.current = []
        cleanup()
        setStatus("idle")
    }, [cleanup])

    return { status, error, elapsed, analyser, start, stop, cancel }
}
