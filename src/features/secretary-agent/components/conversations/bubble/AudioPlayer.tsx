"use client"

import { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import { Mic, Pause, Play } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatDuration } from "../../../chat-timeline"

interface AudioPlayerProps {
    src: string
    /** Mensagem de voz (microfone) ou arquivo de áudio. */
    voice: boolean
    out: boolean
    fallbackDuration?: number | null
    onError?: () => void
}

const SPEEDS = [1, 1.5, 2] as const

/** Player de áudio no padrão do WhatsApp (cópia do Atendimento do Zaturno CRM, tema do Opex). */
export function AudioPlayer({ src, voice, out, fallbackDuration, onError }: AudioPlayerProps) {
    const audio = useRef<HTMLAudioElement | null>(null)
    const [playing, setPlaying] = useState(false)
    const [current, setCurrent] = useState(0)
    const [duration, setDuration] = useState(fallbackDuration ?? 0)
    const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1)

    useEffect(() => {
        const element = audio.current
        if (!element) return
        const sync = () => {
            if (Number.isFinite(element.duration) && element.duration > 0) setDuration(element.duration)
            setCurrent(element.currentTime)
        }
        const ended = () => {
            setPlaying(false)
            setCurrent(0)
        }
        const pause = () => setPlaying(false)
        const play = () => setPlaying(true)
        element.addEventListener("loadedmetadata", sync)
        element.addEventListener("timeupdate", sync)
        element.addEventListener("ended", ended)
        element.addEventListener("pause", pause)
        element.addEventListener("play", play)
        return () => {
            element.removeEventListener("loadedmetadata", sync)
            element.removeEventListener("timeupdate", sync)
            element.removeEventListener("ended", ended)
            element.removeEventListener("pause", pause)
            element.removeEventListener("play", play)
        }
    }, [])

    const toggle = () => {
        const element = audio.current
        if (!element) return
        if (element.paused) void element.play().catch(() => onError?.())
        else element.pause()
    }
    const progress = duration > 0 ? Math.min(100, (current / duration) * 100) : 0
    const muted = out ? "text-primary-foreground/75" : "text-muted-foreground"

    return (
        <div className="flex w-[260px] max-w-full items-center gap-2 py-1" data-testid="audio-player">
            {voice && (
                <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full", out ? "bg-primary-foreground/20" : "bg-secondary")}>
                    <Mic className="h-5 w-5" aria-hidden />
                </span>
            )}
            <button type="button" onClick={toggle} aria-label={playing ? "Pausar áudio" : "Tocar áudio"} className="flex h-8 w-8 shrink-0 items-center justify-center opacity-80 hover:opacity-100">
                {playing ? <Pause className="h-6 w-6 fill-current" aria-hidden /> : <Play className="h-6 w-6 fill-current" aria-hidden />}
            </button>
            <div className="min-w-0 flex-1">
                <div
                    className={cn("relative h-1 cursor-pointer rounded-full", out ? "bg-primary-foreground/30" : "bg-muted-foreground/30")}
                    role="slider"
                    aria-label="Posição do áudio"
                    aria-valuemin={0}
                    aria-valuemax={Math.round(duration)}
                    aria-valuenow={Math.round(current)}
                    tabIndex={0}
                    onClick={(event) => {
                        const element = audio.current
                        if (!element || !duration) return
                        const rect = event.currentTarget.getBoundingClientRect()
                        element.currentTime = ((event.clientX - rect.left) / rect.width) * duration
                    }}
                >
                    <motion.span className={cn("absolute inset-y-0 left-0 rounded-full", out ? "bg-primary-foreground" : "bg-primary")} initial={false} animate={{ width: `${progress}%` }} transition={{ duration: 0.15 }} />
                    <motion.span className={cn("absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full", out ? "bg-primary-foreground" : "bg-primary")} initial={false} animate={{ left: `${progress}%` }} transition={{ duration: 0.15 }} />
                </div>
                <div className={cn("mt-1.5 flex items-center justify-between text-[11px]", muted)}>
                    <span className="tabular-nums">{formatDuration(playing || current > 0 ? current : duration)}</span>
                    <button
                        type="button"
                        className="rounded-full bg-foreground/10 px-1.5 font-semibold hover:bg-foreground/20"
                        aria-label="Velocidade de reprodução"
                        onClick={() => {
                            const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]!
                            setSpeed(next)
                            if (audio.current) audio.current.playbackRate = next
                        }}
                    >
                        {speed}×
                    </button>
                </div>
            </div>
            <audio ref={audio} src={src} preload="metadata" className="hidden" onError={onError} />
        </div>
    )
}
