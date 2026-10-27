"use client"

import { useFieldArray, useWatch, type UseFormReturn } from "react-hook-form"
import { AnimatePresence, motion } from "framer-motion"
import { Plus, Trash2, Waypoints } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import type { LocalDockerSettings } from "../../schemas"
import { NumberField } from "../NumberField"

const rowMotion = { initial: { opacity: 0, y: -4 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, height: 0 }, transition: { duration: 0.18 } }

/** Apelidos de rede: prefixo dos containers e a lista nome → servidor:porta. */
export function AliasesCard({ form }: { form: UseFormReturn<LocalDockerSettings> }) {
    const errors = form.formState.errors
    const aliases = useFieldArray({ control: form.control, name: "aliases" })
    const [prefix, serverAddress, values] = useWatch({ control: form.control, name: ["aliasPrefix", "serverAddress", "aliases"] })
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                    <Waypoints className="h-4 w-4" aria-hidden /> Apelidos de rede
                </CardTitle>
                <CardDescription>
                    Fazem os nomes do <code className="text-xs">.env</code> das prévias (ex.: devteam-mongo) chegarem ao servidor a partir do PC. Com o túnel aberto, salvar já levanta só o apelido novo ou alterado.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <Field id="local-docker-alias-prefix" label="Prefixo do nome dos containers" error={errors.aliasPrefix?.message}>
                    <Input id="local-docker-alias-prefix" className="font-mono" {...form.register("aliasPrefix")} />
                    <p className="text-xs text-muted-foreground">{`Ex.: ${prefix || "…"}${values?.[0]?.name || "devteam-mongo"}`}</p>
                </Field>
                <ul className="space-y-2">
                    <AnimatePresence initial={false}>
                        {aliases.fields.map((item, index) => (
                            <motion.li key={item.id} {...rowMotion} className="flex items-start gap-2 rounded-md border p-3">
                                <div className="grid flex-1 gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                                    <Field id={`local-docker-alias-name-${index}`} label="Nome na rede" error={errors.aliases?.[index]?.name?.message}>
                                        <Input id={`local-docker-alias-name-${index}`} className="font-mono" {...form.register(`aliases.${index}.name`)} />
                                    </Field>
                                    <Field id={`local-docker-alias-port-${index}`} label="Porta" error={errors.aliases?.[index]?.port?.message}>
                                        <NumberField control={form.control} name={`aliases.${index}.port`} id={`local-docker-alias-port-${index}`} />
                                    </Field>
                                    <p className="font-mono text-xs text-muted-foreground sm:col-span-2">
                                        {prefix}
                                        {values?.[index]?.name || "…"} → {serverAddress || "servidor"}:{Number.isFinite(values?.[index]?.port) ? values?.[index]?.port : "…"}
                                    </p>
                                </div>
                                <Button type="button" variant="ghost" size="icon" className="mt-7 shrink-0" aria-label={`Remover o apelido ${index + 1}`} onClick={() => aliases.remove(index)}>
                                    <Trash2 className="h-4 w-4" aria-hidden />
                                </Button>
                            </motion.li>
                        ))}
                    </AnimatePresence>
                </ul>
                {aliases.fields.length === 0 && <p className="text-xs text-muted-foreground">Nenhum apelido: as prévias no PC não alcançam serviços do servidor pelo nome.</p>}
                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => aliases.append({ name: "", port: Number.NaN })}>
                    <Plus className="h-4 w-4" aria-hidden /> Adicionar apelido
                </Button>
                {errors.aliases?.message && <p className="text-xs text-destructive">{errors.aliases.message}</p>}
            </CardContent>
        </Card>
    )
}
