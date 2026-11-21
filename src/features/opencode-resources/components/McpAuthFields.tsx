"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Controller, useWatch, type UseFormReturn } from "react-hook-form"
import { Field } from "@/components/ui/field"
import { FORM_GRID } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { OptionTabs } from "@/components/ui/option-tabs"
import { Switch } from "@/components/ui/switch"
import type { McpFormValues } from "../form-schemas"
import type { McpAuthMode } from "../schemas"
import { SecretRowsField } from "./SecretRowsField"

const AUTH_OPTIONS: { value: McpAuthMode; label: string }[] = [
    { value: "none", label: "Nenhuma" },
    { value: "headers", label: "Cabeçalhos" },
    { value: "oauth", label: "OAuth" },
]
const swap = { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -6 }, transition: { duration: 0.18 } }

/** Autenticação do MCP remoto: nenhuma, cabeçalhos (segredos) ou a chave `oauth` do OpenCode. */
export function McpAuthFields({ form }: { form: UseFormReturn<McpFormValues> }) {
    const auth = useWatch({ control: form.control, name: "auth" })
    const clientId = useWatch({ control: form.control, name: "oauthClientId" })
    const secretSaved = useWatch({ control: form.control, name: "oauthClientSecretSaved" })
    const errors = form.formState.errors
    return (
        <div className="space-y-4">
            <div className="space-y-1.5">
                <Label>Autenticação</Label>
                <Controller
                    control={form.control}
                    name="auth"
                    render={({ field }) => <OptionTabs<McpAuthMode> options={AUTH_OPTIONS} value={field.value} onChange={(value) => form.setValue("auth", value, { shouldDirty: true, shouldValidate: true })} aria-label="Autenticação do MCP" />}
                />
            </div>
            <AnimatePresence mode="wait" initial={false}>
                <motion.div key={auth} {...swap} className="space-y-4">
                    {auth === "headers" && <SecretRowsField name="headers" label="Cabeçalhos HTTP" control={form.control} register={form.register} errors={errors} />}
                    {auth === "oauth" && (
                        <>
                            <p className="text-xs text-muted-foreground">
                                O OpenCode descobre o servidor de autorização, registra o cliente e guarda o token no host. Deixe em branco para o padrão do OpenCode. Depois de salvar, use Autorizar no menu do MCP.
                            </p>
                            <div className={FORM_GRID}>
                                <Field id="mcp-oauth-client-id" label="Client ID (opcional)" error={errors.oauthClientId?.message}>
                                    <Input id="mcp-oauth-client-id" className="font-mono" autoComplete="off" {...form.register("oauthClientId")} />
                                </Field>
                                <Field id="mcp-oauth-client-secret" label="Client secret (opcional)" error={errors.oauthClientSecret?.message}>
                                    <Input
                                        id="mcp-oauth-client-secret"
                                        type="password"
                                        className="font-mono"
                                        autoComplete="new-password"
                                        disabled={!clientId}
                                        placeholder={secretSaved ? "•••• (vazio mantém o salvo)" : ""}
                                        {...form.register("oauthClientSecret")}
                                    />
                                </Field>
                                <Field id="mcp-oauth-scope" label="Escopos (opcional)" error={errors.oauthScope?.message}>
                                    <Input id="mcp-oauth-scope" className="font-mono" autoComplete="off" placeholder="read write" {...form.register("oauthScope")} />
                                </Field>
                                <Field id="mcp-oauth-port" label="Porta de retorno no host (opcional)" error={errors.oauthCallbackPort?.message}>
                                    <Input id="mcp-oauth-port" inputMode="numeric" className="font-mono" autoComplete="off" placeholder="aleatória" {...form.register("oauthCallbackPort")} />
                                </Field>
                                <Field id="mcp-oauth-redirect" label="Redirect URI (opcional)" error={errors.oauthRedirectUri?.message}>
                                    <Input id="mcp-oauth-redirect" className="font-mono" autoComplete="off" placeholder="http://127.0.0.1:19876/callback" {...form.register("oauthRedirectUri")} />
                                </Field>
                                <Field id="mcp-oauth-metadata" label="URL dos metadados do servidor de autorização (opcional)" error={errors.oauthAuthServerMetadataUrl?.message}>
                                    <Input id="mcp-oauth-metadata" className="font-mono" autoComplete="off" placeholder="https://auth.exemplo.com/.well-known/oauth-authorization-server" {...form.register("oauthAuthServerMetadataUrl")} />
                                </Field>
                            </div>
                        </>
                    )}
                    {auth !== "oauth" && (
                        <div className="flex items-center gap-2">
                            <Controller control={form.control} name="disableAutoOauth" render={({ field }) => <Switch id="mcp-disable-auto-oauth" checked={field.value} onCheckedChange={(checked) => form.setValue("disableAutoOauth", checked, { shouldDirty: true })} />} />
                            <Label htmlFor="mcp-disable-auto-oauth" className="text-sm font-normal">
                                Não tentar OAuth automaticamente (o OpenCode tenta quando o servidor responde 401)
                            </Label>
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>
        </div>
    )
}
