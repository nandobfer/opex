"use client"

import { AnimatePresence, motion } from "framer-motion"
import { AlertTriangle, RefreshCw } from "lucide-react"
import { Controller, useWatch } from "react-hook-form"
import { Button } from "@/components/ui/button"
import { Combobox } from "@/components/ui/combobox"
import { Field } from "@/components/ui/field"
import { Skeleton } from "@/components/ui/skeleton"
import { apiErrorMessage } from "@/lib/api"
import { dockerBuilderOptions } from "../../docker-builders"
import { useDockerBuilders } from "../../hooks/useAgentic"
import type { CentralForm } from "./form"

const ID = "central-env-builder"

/** Campo "Builder do Docker": lista os builders reais da máquina do OpenCode; vazio = padrão do host. */
export function DockerBuilderField({ form, centralId }: { form: CentralForm; centralId: string }) {
    const query = useDockerBuilders(centralId)
    const selected = useWatch({ control: form.control, name: "environment.dockerBuilder" }) ?? ""
    const error = form.formState.errors.environment?.dockerBuilder?.message
    const builder = query.data?.builders.find((item) => item.name === selected)
    const warning = builder && !builder.loadsImages ? `O builder ${builder.name} não carrega as imagens no Docker local (driver ${builder.driver} sem default-load): o docker compose pode não encontrar a imagem construída.` : null

    return (
        <Field id={ID} label="Builder do Docker" error={error}>
            <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                    {query.isPending ? (
                        <Skeleton className="h-9 w-full" />
                    ) : (
                        <Controller
                            control={form.control}
                            name="environment.dockerBuilder"
                            render={({ field }) => (
                                <Combobox
                                    id={ID}
                                    className="font-mono"
                                    options={dockerBuilderOptions(query.data, field.value ?? "")}
                                    value={field.value ?? ""}
                                    onValueChange={(value) => field.onChange(value)}
                                    placeholder="Padrão do host"
                                    searchPlaceholder="Buscar builder..."
                                    emptyText="Nenhum builder encontrado."
                                />
                            )}
                        />
                    )}
                </div>
                <Button type="button" variant="outline" size="icon" aria-label="Atualizar builders" title="Atualizar a lista do host" onClick={() => void query.refetch()} disabled={query.isFetching}>
                    <RefreshCw className={query.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden />
                </Button>
            </div>
            <AnimatePresence initial={false}>
                {query.isError && (
                    <motion.p key="error" role="alert" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }} className="text-xs text-destructive">
                        {apiErrorMessage(query.error, "Não foi possível listar os builders do host")}{" "}
                        <button type="button" className="underline underline-offset-2" onClick={() => void query.refetch()}>
                            Tentar novamente
                        </button>
                    </motion.p>
                )}
                {warning && (
                    <motion.p key="warning" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.18 }} className="flex gap-1.5 text-xs text-muted-foreground">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                        {warning}
                    </motion.p>
                )}
            </AnimatePresence>
        </Field>
    )
}
