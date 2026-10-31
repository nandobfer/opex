"use client"

import { AnimatePresence, motion } from "framer-motion"
import { CheckCircle2, XCircle } from "lucide-react"

export type TestOutcome = { ok: true; result: Record<string, unknown> } | { ok: false; message: string } | null

const LABELS: Record<string, string> = { title: "Título", text: "Texto", model: "Modelo", provider: "Provedor", model_id: "model_id", dimensions: "Dimensão", latency_ms: "Latência (ms)" }

/** Resultado do "Testar com esta chave" (só os campos simples da resposta do Engramind). */
export function TestResult({ outcome }: { outcome: TestOutcome }) {
    return (
        <AnimatePresence initial={false} mode="wait">
            {outcome && (
                <motion.div key={outcome.ok ? "ok" : "fail"} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.2 }} role="status" className="space-y-1 rounded-md border p-3 text-xs">
                    {outcome.ok ? (
                        <>
                            <p className="flex items-center gap-1.5 font-medium text-success">
                                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Teste concluído
                            </p>
                            {Object.entries(outcome.result)
                                .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
                                .map(([key, value]) => (
                                    <p key={key} className="break-words text-muted-foreground">
                                        <span className="font-medium text-foreground">{LABELS[key] ?? key}:</span> {String(value)}
                                    </p>
                                ))}
                        </>
                    ) : (
                        <p className="flex items-center gap-1.5 text-destructive">
                            <XCircle className="h-3.5 w-3.5" aria-hidden /> {outcome.message}
                        </p>
                    )}
                </motion.div>
            )}
        </AnimatePresence>
    )
}
