"use client"

import { useEffect, useRef } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { SendHorizontal, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatDuration } from "../../../chat-timeline"

/** Ondas do microfone, na cor do texto secundário do tema. */
function Waveform({ analyser }: { analyser: AnalyserNode | null }) {
    const canvas = useRef<HTMLCanvasElement>(null)
    const reduceMotion = useReducedMotion()
    useEffect(() => {
        const node = canvas.current
        const ctx = node?.getContext?.("2d")
        if (!analyser || !node || !ctx || reduceMotion) return
        const color = getComputedStyle(node).color
        const data = new Uint8Array(analyser.frequencyBinCount)
        let frame = 0
        const draw = () => {
            frame = requestAnimationFrame(draw)
            analyser.getByteFrequencyData(data)
            ctx.clearRect(0, 0, node.width, node.height)
            const middle = node.height / 2
            for (let index = 0, x = 0; x < node.width; index += 1, x += 4) {
                const height = Math.max(2, ((data[index] ?? 0) / 255) * middle)
                ctx.fillStyle = color
                ctx.fillRect(x, middle - height, 2, height * 2)
            }
        }
        draw()
        return () => cancelAnimationFrame(frame)
    }, [analyser, reduceMotion])
    return <canvas ref={canvas} width={220} height={32} className="h-8 min-w-0 flex-1 text-muted-foreground" aria-hidden />
}

/** Barra de gravação da mensagem de voz: descartar, tempo, ondas e enviar. */
export function VoiceRecorderBar({ elapsed, analyser, onCancel, onSend }: { elapsed: number; analyser: AnalyserNode | null; onCancel: () => void; onSend: () => void }) {
    const reduceMotion = useReducedMotion()
    return (
        <motion.div initial={{ opacity: 0, x: reduceMotion ? 0 : 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="flex flex-1 items-center gap-3" role="status" aria-label="Gravando mensagem de voz">
            <button type="button" onClick={onCancel} className="rounded-full p-2 text-muted-foreground hover:bg-foreground/5 hover:text-destructive" aria-label="Descartar gravação">
                <Trash2 className="h-5 w-5" aria-hidden />
            </button>
            <span className="flex items-center gap-2 text-sm tabular-nums">
                <motion.span className="h-2.5 w-2.5 rounded-full bg-destructive" animate={reduceMotion ? undefined : { opacity: [1, 0.3, 1] }} transition={{ duration: 1.2, repeat: Infinity }} aria-hidden />
                {formatDuration(elapsed)}
            </span>
            <Waveform analyser={analyser} />
            <Button type="button" size="icon" className="h-10 w-10 rounded-full" onClick={onSend} aria-label="Enviar mensagem de voz">
                <SendHorizontal aria-hidden />
            </Button>
        </motion.div>
    )
}
