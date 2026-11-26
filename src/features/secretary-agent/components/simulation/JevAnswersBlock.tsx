"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Scale } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { JEV_BAND_LABELS, type JevBand } from "../../jev-subjects"
import type { SubjectTrace } from "../../server/decide-subject"
import { SimulationBlock } from "./SimulationBlock"

const BAND_VARIANT: Record<JevBand, "success" | "secondary" | "warning"> = { yes: "success", no: "secondary", unsure: "warning" }
const item = { initial: { opacity: 0, y: 4 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 }, transition: { duration: 0.18 } }

/** Decisão do assunto: quem decidiu (modelo ou JEV), o assunto e, com o JEV, cada pergunta com a probabilidade e a faixa. */
export function JevAnswersBlock({ subject }: { subject: SubjectTrace }) {
    return (
        <SimulationBlock icon={Scale} title="Decisão do assunto">
            <p className="text-sm">
                {subject.decider === "jev" ? "JEV" : "Modelo de texto"} · <span className="font-mono text-xs text-muted-foreground">{subject.model}</span>
            </p>
            {subject.decision.topic && <p className="text-sm">Assunto: <strong>{subject.decision.topic}</strong></p>}
            {subject.decision.reason && <p className="text-xs text-muted-foreground">{subject.decision.reason}</p>}
            {subject.answers.length > 0 && (
                <ul className="space-y-1 text-sm" aria-label="Perguntas ao JEV">
                    <AnimatePresence initial={false}>
                        {subject.answers.map((answer) => (
                            <motion.li key={`${answer.kind}-${answer.id}`} {...item} className="flex items-center justify-between gap-2">
                                <span className="min-w-0 truncate">{answer.kind === "blocked" ? "Bloqueado" : "Liberado"}: {answer.name}</span>
                                <span className="flex shrink-0 items-center gap-1.5">
                                    <span className="text-xs tabular-nums text-muted-foreground">{Math.round(answer.value * 100)}%</span>
                                    <Badge variant={BAND_VARIANT[answer.band]} data-band={answer.band}>{JEV_BAND_LABELS[answer.band]}</Badge>
                                </span>
                            </motion.li>
                        ))}
                    </AnimatePresence>
                </ul>
            )}
        </SimulationBlock>
    )
}
