"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Controller, type UseFormReturn } from "react-hook-form"
import { BookmarkCheck, BookmarkX } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { AI_PROVIDER_IDS, type AiProviderStatusDto } from "@/lib/ai/providers"
import { MENTOR_LEVEL_DEFS, MENTOR_LEVELS } from "../../mentor/constants"
import type { MentorSettings } from "../../mentor/schemas"
import { MentorModelFields } from "./MentorModelFields"

const MARKS = MENTOR_LEVELS.map((level, index) => ({ value: index, label: MENTOR_LEVEL_DEFS[level].label }))
const percent = (value: number) => `${Math.round(value * 100)}%`

/** Decisor (JEV ou provedor de texto) e o rigor da curadoria: a nota mínima para virar memória. */
export function MentorDeciderCard({ form, providers }: { form: UseFormReturn<MentorSettings>; providers: AiProviderStatusDto[] }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Decisor e rigor da curadoria</CardTitle>
                <CardDescription>O decisor dá uma nota de 0 a 100% para &ldquo;este caso deve virar regra permanente do revisor ou do desenvolvedor?&rdquo;. Com o JEV, é a probabilidade da resposta estruturada; com um provedor de texto, a nota que ele devolve. Só segue para o Triador e o redator a partir do limiar do nível.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <MentorModelFields form={form} part="decider" providerIds={AI_PROVIDER_IDS} providers={providers} />
                <Controller
                    control={form.control}
                    name="level"
                    render={({ field }) => {
                        const index = Math.max(0, MENTOR_LEVELS.indexOf(field.value))
                        const def = MENTOR_LEVEL_DEFS[field.value]
                        return (
                            <div className="space-y-5">
                                <div className="px-7 pb-2">
                                    <Slider
                                        id="mentor-level"
                                        aria-label="Rigor da curadoria do Agente Mentor"
                                        min={0}
                                        max={MENTOR_LEVELS.length - 1}
                                        step={1}
                                        value={index}
                                        onChange={(next) => field.onChange(MENTOR_LEVELS[next] ?? field.value)}
                                        onBlur={field.onBlur}
                                        formatValue={(value) => MENTOR_LEVEL_DEFS[MENTOR_LEVELS[value] ?? "balanced"].label}
                                        marks={MARKS}
                                    />
                                </div>
                                <AnimatePresence mode="wait" initial={false}>
                                    <motion.div key={field.value} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} className="grid gap-3 sm:grid-cols-2">
                                        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                                            <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-emerald-400">
                                                <BookmarkCheck className="h-4 w-4" aria-hidden /> Grava (nota a partir de {percent(def.threshold)})
                                            </p>
                                            <ul className="space-y-1 text-xs text-muted-foreground">
                                                {def.records.map((item) => (
                                                    <li key={item}>• {item}</li>
                                                ))}
                                            </ul>
                                        </div>
                                        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                                            <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-destructive">
                                                <BookmarkX className="h-4 w-4" aria-hidden /> Não grava
                                            </p>
                                            <ul className="space-y-1 text-xs text-muted-foreground">
                                                {def.skips.map((item) => (
                                                    <li key={item}>• {item}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    </motion.div>
                                </AnimatePresence>
                                <p className="text-xs text-muted-foreground">Não há limite de quantidade de memórias: o rigor e a fusão com memórias parecidas (pelo redator) evitam o acúmulo.</p>
                            </div>
                        )
                    }}
                />
            </CardContent>
        </Card>
    )
}
