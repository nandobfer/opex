"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Controller, type UseFormReturn } from "react-hook-form"
import { ShieldAlert, ShieldCheck } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LeveledSlider } from "@/components/ui/leveled-slider"
import { ADVERSARIAL_LEVEL_DEFS, ADVERSARIAL_LEVELS, FINDING_SEVERITY_LABELS } from "../../constants"
import type { AdversarialSettings } from "../../schemas"

/**
 * Criticidade em steps com rótulos (do mais liberal ao mais crítico). Abaixo do slider, o que o nível
 * escolhido bloqueia e o que só vira sugestão.
 */
export function CriticalityCard({ form }: { form: UseFormReturn<AdversarialSettings> }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Criticidade</CardTitle>
                <CardDescription>O agente classifica cada achado; o nível decide a partir de que severidade ele bloqueia. Abaixo do limiar, o achado vira sugestão e não volta ao implementador.</CardDescription>
            </CardHeader>
            <CardContent>
                <Controller
                    control={form.control}
                    name="level"
                    render={({ field }) => {
                        const def = ADVERSARIAL_LEVEL_DEFS[field.value]
                        return (
                            <div className="space-y-5">
                                <LeveledSlider
                                    id="adversarial-level"
                                    label="Criticidade do agente adversário"
                                    levels={ADVERSARIAL_LEVELS}
                                    value={field.value}
                                    onChange={field.onChange}
                                    onBlur={field.onBlur}
                                    labelOf={(level) => ADVERSARIAL_LEVEL_DEFS[level].label}
                                />
                                <AnimatePresence mode="wait" initial={false}>
                                    <motion.div key={field.value} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} className="grid gap-3 sm:grid-cols-2">
                                        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                                            <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-destructive">
                                                <ShieldAlert className="h-4 w-4" aria-hidden /> Bloqueia (a partir de {FINDING_SEVERITY_LABELS[def.blocksFrom]})
                                            </p>
                                            <ul className="space-y-1 text-xs text-muted-foreground">
                                                {def.blocks.map((item) => (
                                                    <li key={item}>• {item}</li>
                                                ))}
                                            </ul>
                                        </div>
                                        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                                            <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-emerald-400">
                                                <ShieldCheck className="h-4 w-4" aria-hidden /> Não bloqueia (vira sugestão)
                                            </p>
                                            <ul className="space-y-1 text-xs text-muted-foreground">
                                                {def.allows.map((item) => (
                                                    <li key={item}>• {item}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    </motion.div>
                                </AnimatePresence>
                                <p className="text-xs text-muted-foreground">
                                    Em todos os níveis, um achado só bloqueia com arquivo, evidência e cenário concretos, dentro do código alterado. Estilo só bloqueia no Implacável. Nas rodadas de correção, achado novo só bloqueia se for crítico ou criado pela correção.
                                </p>
                            </div>
                        )
                    }}
                />
            </CardContent>
        </Card>
    )
}
