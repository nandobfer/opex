"use client"

import { AnimatePresence, motion } from "framer-motion"
import { useWatch, type UseFormReturn } from "react-hook-form"
import { Info } from "lucide-react"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Textarea } from "@/components/ui/textarea"
import { OPEX_MCP_ARGS_MAX, OPEX_MCP_TRANSPORTS, OPEX_MCP_TRANSPORT_LABELS, type OpexMcpServerDto, type OpexMcpServerInput, type OpexMcpTransport } from "../../../mcp"
import { OpexMcpSecretsField } from "./OpexMcpSecretsField"

const TRANSPORT_OPTIONS = OPEX_MCP_TRANSPORTS.map((value) => ({ value, label: OPEX_MCP_TRANSPORT_LABELS[value] }))
const swap = { initial: { opacity: 0, y: -4 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 4 }, transition: { duration: 0.18 } }

interface OpexMcpConnectionFieldsProps {
    form: UseFormReturn<OpexMcpServerInput>
    savedServer: OpexMcpServerDto | null
    disabled: boolean
}

/** Transporte e conexão: URL + headers (HTTP/SSE) ou comando, argumentos e variáveis (stdio). */
export function OpexMcpConnectionFields({ form, savedServer, disabled }: OpexMcpConnectionFieldsProps) {
    const transport = useWatch({ control: form.control, name: "transport" })
    const args = useWatch({ control: form.control, name: "args" }) ?? []
    const errors = form.formState.errors

    return (
        <div className="space-y-4">
            <div className="space-y-1.5">
                <Label htmlFor="mcp-transport">Transporte</Label>
                <OptionTabs<OpexMcpTransport>
                    id="mcp-transport"
                    aria-label="Transporte"
                    options={TRANSPORT_OPTIONS}
                    value={transport}
                    disabled={disabled}
                    onChange={(value) => form.setValue("transport", value, { shouldDirty: true, shouldValidate: true })}
                />
            </div>
            <AnimatePresence mode="wait" initial={false}>
                {transport === "stdio" ? (
                    <motion.div key="stdio" {...swap} className="space-y-4">
                        <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning" role="note">
                            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />O processo roda dentro do servidor do Opex (container), não na máquina do host: só node/npx estão disponíveis
                            e os arquivos do host não são acessíveis. Ele recebe apenas as variáveis abaixo (além de PATH e HOME).
                        </p>
                        <Field id="mcp-command" label="Comando" error={errors.command?.message}>
                            <Input id="mcp-command" placeholder="npx" className="font-mono" autoComplete="off" disabled={disabled} {...form.register("command")} />
                        </Field>
                        <Field id="mcp-args" label="Argumentos (um por linha)" error={errors.args?.message}>
                            <Textarea
                                id="mcp-args"
                                rows={3}
                                className="font-mono text-xs"
                                placeholder={"-y\n@modelcontextprotocol/server-everything"}
                                disabled={disabled}
                                value={args.join("\n")}
                                onChange={(event) => form.setValue("args", event.target.value ? event.target.value.split("\n").slice(0, OPEX_MCP_ARGS_MAX) : [], { shouldDirty: true, shouldValidate: true })}
                            />
                        </Field>
                        <OpexMcpSecretsField form={form} name="env" saved={savedServer?.env ?? []} disabled={disabled} />
                    </motion.div>
                ) : (
                    <motion.div key="remote" {...swap} className="space-y-4">
                        <Field id="mcp-url" label="URL" error={errors.url?.message}>
                            <Input id="mcp-url" placeholder={transport === "sse" ? "https://exemplo.com/sse" : "https://exemplo.com/mcp"} className="font-mono" autoComplete="off" disabled={disabled} {...form.register("url")} />
                        </Field>
                        <OpexMcpSecretsField form={form} name="headers" saved={savedServer?.headers ?? []} disabled={disabled} />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
