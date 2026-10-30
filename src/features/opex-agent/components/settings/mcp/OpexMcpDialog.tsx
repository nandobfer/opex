"use client"

import { useEffect } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { FORM_GRID } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { FormToggleCard } from "@/components/ui/toggle-card"
import { EMPTY_OPEX_MCP_INPUT, mcpServerToInput, opexMcpServerInputSchema, slugifyMcpName, type OpexMcpServerDto, type OpexMcpServerInput } from "../../../mcp"
import { useSaveOpexMcpServer } from "../../../hooks/useOpexMcpServers"
import { OpexMcpConnectionFields } from "./OpexMcpConnectionFields"
import { OpexMcpToolsPanel } from "./OpexMcpToolsPanel"

interface OpexMcpDialogProps {
    open: boolean
    /** MCP em edição; `null` = novo. */
    server: OpexMcpServerDto | null
    onClose: () => void
}

/**
 * Cadastro/edição de um MCP: identificação, conexão (HTTP, SSE ou stdio), headers/variáveis secretos e
 * o "Testar conexão", que lista as ferramentas para escolher quais pedem confirmação.
 */
export function OpexMcpDialog({ open, server, onClose }: OpexMcpDialogProps) {
    const save = useSaveOpexMcpServer()
    const form = useForm<OpexMcpServerInput>({ resolver: zodResolver(opexMcpServerInputSchema), mode: "onChange", defaultValues: EMPTY_OPEX_MCP_INPUT })
    const errors = form.formState.errors
    const submitting = save.isPending
    const name = useWatch({ control: form.control, name: "name" })

    useEffect(() => {
        if (open) form.reset(server ? mcpServerToInput(server) : EMPTY_OPEX_MCP_INPUT)
    }, [open, server, form])

    // Novo MCP: o identificador acompanha o nome até ser editado à mão.
    useEffect(() => {
        if (server || form.getFieldState("slug").isDirty) return
        form.setValue("slug", slugifyMcpName(name ?? ""), { shouldValidate: Boolean(name) })
    }, [name, server, form])

    const submit = form.handleSubmit(async (values) => {
        // O retrato das ferramentas só vai quando o "Testar conexão" deste diálogo trouxe um novo:
        // sem teste, o servidor mantém o que já tem (inclusive o atualizado por um turno no meio-tempo).
        const { tools, ...rest } = values
        const input: OpexMcpServerInput = form.getFieldState("tools").isDirty && tools ? { ...rest, tools } : rest
        const saved = await save.mutateAsync({ id: server?.id ?? null, input }).catch(() => null)
        if (saved) onClose()
    })

    return (
        <Dialog open={open} onOpenChange={(next) => !next && !submitting && onClose()}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
                <form
                    className="space-y-5"
                    onSubmit={(event) => {
                        event.stopPropagation()
                        void submit(event)
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>{server ? `Editar MCP ${server.name}` : "Cadastrar MCP"}</DialogTitle>
                        <DialogDescription>As ferramentas do MCP entram para o Agente Opex a partir do próximo turno quando ele estiver habilitado.</DialogDescription>
                    </DialogHeader>

                    <div className={FORM_GRID}>
                        <Field id="mcp-name" label="Nome" error={errors.name?.message}>
                            <Input id="mcp-name" autoComplete="off" disabled={submitting} {...form.register("name")} />
                        </Field>
                        <Field id="mcp-slug" label="Identificador" error={errors.slug?.message}>
                            <Input id="mcp-slug" autoComplete="off" className="font-mono" disabled={submitting} {...form.register("slug")} />
                        </Field>
                        <Field id="mcp-description" label="Descrição (opcional)" error={errors.description?.message}>
                            <Textarea id="mcp-description" rows={2} disabled={submitting} {...form.register("description")} />
                        </Field>
                    </div>
                    <FormToggleCard<OpexMcpServerInput> control={form.control} name="enabled" id="mcp-enabled" label="Habilitado" description="Desabilitado, o MCP fica guardado e as ferramentas dele saem do agente e do portal." disabled={submitting} />

                    <OpexMcpConnectionFields form={form} savedServer={server} disabled={submitting} />
                    <OpexMcpToolsPanel form={form} serverId={server?.id ?? null} disabled={submitting} />

                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
                            Cancelar
                        </Button>
                        <Button type="submit" disabled={submitting}>
                            {submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
                            Salvar
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
