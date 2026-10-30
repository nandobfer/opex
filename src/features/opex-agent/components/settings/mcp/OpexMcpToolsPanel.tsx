"use client"

import { AnimatePresence, motion } from "framer-motion"
import { useWatch, type UseFormReturn } from "react-hook-form"
import { AlertTriangle, CheckCircle2, Loader2, PlugZap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { defaultMcpToolConfirms, mcpToolConfirms, mcpToolName, mcpToolRisk, nextMcpConfirmations, type OpexMcpServerInput } from "../../../mcp"
import { useTestOpexMcpServer } from "../../../hooks/useOpexMcpServers"
import { ToolConfirmMeta } from "../ToolConfirmMeta"

interface OpexMcpToolsPanelProps {
    form: UseFormReturn<OpexMcpServerInput>
    /** MCP salvo (o teste usa os segredos já gravados quando o campo está vazio). */
    serverId: string | null
    disabled: boolean
}

const fade = { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: "auto" }, exit: { opacity: 0, height: 0 }, transition: { duration: 0.2 } }

/**
 * "Testar conexão" e as ferramentas do MCP: cada uma com o selo de risco (pela anotação do servidor) e
 * o switch "Pede confirmação" (padrão: só as de leitura não pedem).
 */
export function OpexMcpToolsPanel({ form, serverId, disabled }: OpexMcpToolsPanelProps) {
    const test = useTestOpexMcpServer()
    const tools = useWatch({ control: form.control, name: "tools" }) ?? []
    const confirmations = useWatch({ control: form.control, name: "confirmations" }) ?? {}
    const slug = useWatch({ control: form.control, name: "slug" })
    const result = test.data

    const runTest = async () => {
        if (!(await form.trigger(["transport", "url", "command", "args", "headers", "env"]))) return
        const values = form.getValues()
        const outcome = await test
            .mutateAsync({ ...(serverId ? { id: serverId } : {}), transport: values.transport, url: values.url, command: values.command, args: values.args, headers: values.headers, env: values.env })
            .catch(() => null)
        if (outcome?.ok) form.setValue("tools", outcome.tools, { shouldDirty: true })
    }

    return (
        <div className="space-y-3 rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <Label>Ferramentas</Label>
                    <p className="text-xs text-muted-foreground">Teste a conexão para listar as ferramentas e escolher quais pedem Confirmar/Cancelar no chat.</p>
                </div>
                <Button type="button" variant="outline" className="gap-1.5" disabled={disabled || test.isPending} onClick={() => void runTest()}>
                    {test.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <PlugZap className="h-4 w-4" aria-hidden />}
                    Testar conexão
                </Button>
            </div>
            <AnimatePresence initial={false} mode="wait">
                {result && (
                    <motion.p key={result.ok ? "ok" : "error"} {...fade} role="status" className={result.ok ? "flex items-center gap-1.5 text-xs text-success" : "flex items-start gap-1.5 text-xs text-destructive"}>
                        {result.ok ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />}
                        {result.ok
                            ? `Conectado${result.serverInfo ? ` a ${result.serverInfo}` : ""} em ${(result.durationMs / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s · ${result.tools.length} ${result.tools.length === 1 ? "ferramenta" : "ferramentas"}`
                            : `Falha ao conectar: ${result.error}`}
                    </motion.p>
                )}
            </AnimatePresence>
            {tools.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma ferramenta listada ainda.</p>
            ) : (
                <ul className="max-h-80 space-y-2 overflow-y-auto pr-1" aria-label="Ferramentas do MCP">
                    {tools.map((tool) => {
                        const confirms = mcpToolConfirms(tool, confirmations)
                        return (
                            <li key={tool.name} className="space-y-1 rounded-md border bg-muted/20 p-2">
                                <div className="text-sm font-medium">{tool.title ?? tool.name}</div>
                                <ToolConfirmMeta
                                    id={`mcp-confirm-${tool.name}`}
                                    name={slug ? mcpToolName(slug, tool.name) : tool.name}
                                    label={tool.title ?? tool.name}
                                    risk={mcpToolRisk(tool.annotations)}
                                    confirms={confirms}
                                    custom={confirms !== defaultMcpToolConfirms(tool.annotations)}
                                    onChange={(value) => form.setValue("confirmations", nextMcpConfirmations(confirmations, tool, value), { shouldDirty: true })}
                                />
                                {tool.description && <p className="line-clamp-2 text-xs text-muted-foreground">{tool.description}</p>}
                            </li>
                        )
                    })}
                </ul>
            )}
        </div>
    )
}
