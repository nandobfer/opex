"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Controller, useWatch, type UseFormReturn } from "react-hook-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { useCentrals } from "@/features/agentic/hooks/useAgentic"
import type { AdversarialSettings } from "../../schemas"

/** Centrais em que as mesas passam pelo adversário: todas ou as escolhidas. */
export function ScopeCard({ form }: { form: UseFormReturn<AdversarialSettings> }) {
    const all = useWatch({ control: form.control, name: "scope.all" })
    const centrals = useCentrals()
    const error = form.formState.errors.scope?.centralIds?.message
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Centrais</CardTitle>
                <CardDescription>Ao fim de cada implementação nas centrais escolhidas, o adversário revisa antes da prévia (ou do Pull Request, no fluxo PR automático).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <Controller
                    control={form.control}
                    name="scope.all"
                    render={({ field }) => (
                        <OptionTabs<"all" | "selected">
                            id="adversarial-scope"
                            options={[
                                { value: "all", label: "Todas as centrais" },
                                { value: "selected", label: "Centrais escolhidas" },
                            ]}
                            value={field.value ? "all" : "selected"}
                            onChange={(next) => field.onChange(next === "all")}
                            className="w-full"
                        />
                    )}
                />
                <AnimatePresence initial={false}>
                    {!all && (
                        <motion.div key="centrals" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                            {centrals.isLoading ? (
                                <Skeleton className="h-20 w-full" />
                            ) : (centrals.data ?? []).length === 0 ? (
                                <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Nenhuma central criada: crie uma na aba Desenvolvimento agêntico.</p>
                            ) : (
                                <Controller
                                    control={form.control}
                                    name="scope.centralIds"
                                    render={({ field }) => (
                                        <ul className="grid gap-2 sm:grid-cols-2" aria-label="Centrais com o agente adversário">
                                            {(centrals.data ?? []).map((central) => {
                                                const checked = field.value.includes(central.id)
                                                const id = `adversarial-central-${central.id}`
                                                return (
                                                    <li key={central.id} className="flex items-center gap-2 rounded-md border px-3 py-2">
                                                        <Checkbox id={id} checked={checked} onCheckedChange={(next) => field.onChange(next ? [...field.value, central.id] : field.value.filter((item) => item !== central.id))} />
                                                        <label htmlFor={id} className="min-w-0 flex-1 truncate text-sm">
                                                            {central.projectName}
                                                            {central.repo && <span className="ml-1.5 font-mono text-xs text-muted-foreground">{central.repo}</span>}
                                                        </label>
                                                    </li>
                                                )
                                            })}
                                        </ul>
                                    )}
                                />
                            )}
                            {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
                        </motion.div>
                    )}
                </AnimatePresence>
            </CardContent>
        </Card>
    )
}
