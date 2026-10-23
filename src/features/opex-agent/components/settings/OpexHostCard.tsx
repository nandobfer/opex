"use client"

import { Controller, type UseFormReturn } from "react-hook-form"
import { AnimatePresence, motion } from "framer-motion"
import { ShieldAlert } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChipInput } from "@/components/ui/chip-input"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { OPEX_HOST_DIRECTORIES_MAX, OPEX_HOST_MAX_TIMEOUT_LIMIT_SECONDS } from "../../constants"
import type { OpexAgentSettings } from "../../schemas"

const toNumber = (value: string) => (value.trim() === "" ? Number.NaN : Number(value))
const noticeMotion = { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: "auto" }, exit: { opacity: 0, height: 0 }, transition: { duration: 0.2 } }

/** Terminal do host: diretórios permitidos (vazio = livre) e tempo máximo dos comandos. */
export function OpexHostCard({ form }: { form: UseFormReturn<OpexAgentSettings> }) {
    const errors = form.formState.errors.host
    const directoryError = errors?.allowedDirectories?.message ?? errors?.allowedDirectories?.find?.((item) => item?.message)?.message
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Terminal do host</CardTitle>
                <CardDescription>
                    O agente executa comandos na máquina do servidor OpenCode (fora do container do app), um por vez e sem interação, com o usuário do processo do OpenCode. A confirmação segue o
                    &quot;Pede confirmação&quot; da ferramenta <code className="text-xs">run_host_command</code>.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
                <Field id="opex-host-directories" label="Diretórios permitidos" error={directoryError}>
                    <Controller
                        control={form.control}
                        name="host.allowedDirectories"
                        render={({ field }) => (
                            <ChipInput
                                id="opex-host-directories"
                                value={field.value}
                                onChange={field.onChange}
                                max={OPEX_HOST_DIRECTORIES_MAX}
                                placeholder="/home/usuario/projetos"
                                aria-describedby="opex-host-directories-help"
                            />
                        )}
                    />
                    <p id="opex-host-directories-help" className="text-xs text-muted-foreground">
                        Caminhos absolutos; os subdiretórios também valem. O primeiro é o diretório padrão. Sem nenhum, o agente pode usar qualquer diretório (padrão: o das sessões do OpenCode).
                    </p>
                    <Controller
                        control={form.control}
                        name="host.allowedDirectories"
                        render={({ field }) => (
                            <AnimatePresence initial={false}>
                                {field.value.length === 0 && (
                                    <motion.p key="free" {...noticeMotion} role="note" className="flex items-start gap-2 overflow-hidden text-xs font-medium text-warning">
                                        <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> Sem restrição de diretório.
                                    </motion.p>
                                )}
                            </AnimatePresence>
                        )}
                    />
                </Field>
                <Field id="opex-host-timeout" label="Tempo máximo por comando (segundos)" error={errors?.maxTimeoutSeconds?.message}>
                    <Controller
                        control={form.control}
                        name="host.maxTimeoutSeconds"
                        render={({ field }) => (
                            <Input
                                id="opex-host-timeout"
                                type="number"
                                step={1}
                                min={5}
                                max={OPEX_HOST_MAX_TIMEOUT_LIMIT_SECONDS}
                                value={Number.isNaN(field.value) ? "" : field.value}
                                onChange={(event) => field.onChange(toNumber(event.target.value))}
                            />
                        )}
                    />
                    <p className="text-xs text-muted-foreground">O comando que passar disso é encerrado. Até {OPEX_HOST_MAX_TIMEOUT_LIMIT_SECONDS} s.</p>
                </Field>
            </CardContent>
        </Card>
    )
}
