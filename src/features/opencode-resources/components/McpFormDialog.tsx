"use client"

import { Controller, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { AnimatePresence, motion } from "framer-motion"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field } from "@/components/ui/field"
import { FORM_GRID } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { ErrorState } from "@/components/feedback/ErrorState"
import { apiErrorMessage } from "@/lib/api"
import { mcpContentFromForm, mcpFormFromDetail, mcpFormSchema, type McpFormValues } from "../form-schemas"
import { useCreateOpencodeResource, useOpencodeResource, useUpdateOpencodeResource } from "../hooks/useOpencodeResources"
import type { OpencodeResourceDto } from "../types"
import { SecretRowsField } from "./SecretRowsField"

const TYPE_OPTIONS = [
    { value: "local" as const, label: "Local (comando)" },
    { value: "remote" as const, label: "Remoto (URL)" },
]

function McpForm({ initial, creating, pending, onSubmit, onCancel }: { initial: McpFormValues; creating: boolean; pending: boolean; onSubmit: (values: McpFormValues) => void; onCancel: () => void }) {
    const form = useForm<McpFormValues>({ resolver: zodResolver(mcpFormSchema), mode: "onChange", defaultValues: initial })
    const type = useWatch({ control: form.control, name: "type" })
    const errors = form.formState.errors
    return (
        <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
            <div className={FORM_GRID}>
                <Field id="mcp-name" label="Nome" error={errors.name?.message}>
                    <Input id="mcp-name" className="font-mono" disabled={!creating} placeholder="meu-mcp" {...form.register("name")} />
                </Field>
                <div className="space-y-1.5">
                    <Label>Tipo</Label>
                    <Controller control={form.control} name="type" render={({ field }) => <OptionTabs options={TYPE_OPTIONS} value={field.value} onChange={field.onChange} aria-label="Tipo do MCP" />} />
                </div>
            </div>
            <AnimatePresence mode="wait" initial={false}>
                <motion.div key={type} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }} className="space-y-4">
                    {type === "local" ? (
                        <div className={FORM_GRID}>
                            <Field id="mcp-command" label="Comando" error={errors.command?.message}>
                                <Input id="mcp-command" className="font-mono" placeholder="npx -y @escopo/servidor-mcp" {...form.register("command")} />
                            </Field>
                            <Field id="mcp-cwd" label="Diretório (opcional)" error={errors.cwd?.message}>
                                <Input id="mcp-cwd" className="font-mono" placeholder="/caminho/no/host" {...form.register("cwd")} />
                            </Field>
                        </div>
                    ) : (
                        <Field id="mcp-url" label="URL" error={errors.url?.message}>
                            <Input id="mcp-url" className="font-mono" placeholder="https://mcp.exemplo.com/mcp" {...form.register("url")} />
                        </Field>
                    )}
                    <SecretRowsField name={type === "local" ? "environment" : "headers"} label={type === "local" ? "Variáveis de ambiente" : "Cabeçalhos HTTP"} control={form.control} register={form.register} errors={errors} />
                </motion.div>
            </AnimatePresence>
            <div className="flex items-center gap-2">
                <Controller control={form.control} name="disabled" render={({ field }) => <Switch id="mcp-disabled" checked={!field.value} onCheckedChange={(checked) => field.onChange(!checked)} />} />
                <Label htmlFor="mcp-disabled">Ligado</Label>
            </div>
            <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
                    Cancelar
                </Button>
                <Button type="submit" disabled={pending || !form.formState.isValid}>
                    {pending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}
                    {creating ? "Adicionar" : "Salvar"}
                </Button>
            </div>
        </form>
    )
}

/** Adicionar (`target: "new"`) ou editar um MCP. Os valores dos segredos nunca vêm do servidor. */
export function McpFormDialog({ scope, target, onClose }: { scope: string; target: OpencodeResourceDto | "new" | null; onClose: () => void }) {
    const editing = target && target !== "new" ? target : null
    const detail = useOpencodeResource("mcp", editing?.id ?? null)
    const create = useCreateOpencodeResource("mcp")
    const update = useUpdateOpencodeResource("mcp")
    const pending = create.isPending || update.isPending

    const submit = (values: McpFormValues) => {
        const content = mcpContentFromForm(values)
        if (editing) update.mutate({ id: editing.id, content }, { onSuccess: onClose })
        else create.mutate({ kind: "mcp", scope, name: values.name, ...content }, { onSuccess: onClose })
    }

    return (
        <Dialog open={target !== null} onOpenChange={(open) => !open && !pending && onClose()}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{editing ? `Editar MCP ${editing.name}` : "Adicionar MCP"}</DialogTitle>
                    <DialogDescription>Validado antes de salvar; um backup da configuração é feito antes de cada alteração.</DialogDescription>
                </DialogHeader>
                {editing && (detail.isLoading || (detail.isFetching && !detail.isFetchedAfterMount)) ? (
                    <Skeleton className="h-64 w-full" />
                ) : editing && (detail.isError || !detail.data?.mcp) ? (
                    // Sem o detalhe não há formulário: abrir vazio sobrescreveria o MCP salvo.
                    <ErrorState title="Não foi possível abrir o MCP" description={apiErrorMessage(detail.error, "Confira se o OpenCode está no ar e tente de novo.")} onRetry={() => void detail.refetch()} />
                ) : (
                    <McpForm key={editing?.id ?? "new"} initial={mcpFormFromDetail(editing?.name ?? "", detail.data?.mcp ?? null)} creating={!editing} pending={pending} onSubmit={submit} onCancel={onClose} />
                )}
            </DialogContent>
        </Dialog>
    )
}
