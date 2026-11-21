"use client"

import { AnimatePresence, motion } from "framer-motion"
import { useWatch, type UseFormReturn } from "react-hook-form"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { OptionTabs } from "@/components/ui/option-tabs"
import { FORM_GRID } from "@/components/ui/form-grid"
import { OPEX_MCP_AUTH_LABELS, OPEX_MCP_AUTH_MODES, type OpexMcpAuthMode, type OpexMcpServerDto, type OpexMcpServerInput } from "../../../mcp"
import { OpexMcpOauthPanel } from "./OpexMcpOauthPanel"

const AUTH_OPTIONS = OPEX_MCP_AUTH_MODES.map((value) => ({ value, label: OPEX_MCP_AUTH_LABELS[value] }))
const reveal = { initial: { opacity: 0, height: 0 }, animate: { opacity: 1, height: "auto" }, exit: { opacity: 0, height: 0 }, transition: { duration: 0.2 } }

interface OpexMcpAuthFieldsProps {
    form: UseFormReturn<OpexMcpServerInput>
    savedServer: OpexMcpServerDto | null
    disabled: boolean
}

/** Autenticação do HTTP/SSE: cabeçalhos ou OAuth (campos opcionais + situação e Autorizar). */
export function OpexMcpAuthFields({ form, savedServer, disabled }: OpexMcpAuthFieldsProps) {
    const auth = useWatch({ control: form.control, name: "auth" })
    const clientId = useWatch({ control: form.control, name: "oauth.clientId" })
    const errors = form.formState.errors.oauth
    const savedOauth = savedServer?.auth === "oauth" ? savedServer.oauth : null

    return (
        <div className="space-y-3">
            <div className="space-y-1.5">
                <Label htmlFor="mcp-auth">Autenticação</Label>
                <OptionTabs<OpexMcpAuthMode>
                    id="mcp-auth"
                    aria-label="Autenticação"
                    options={AUTH_OPTIONS}
                    value={auth}
                    disabled={disabled}
                    onChange={(value) => form.setValue("auth", value, { shouldDirty: true, shouldValidate: true })}
                />
            </div>
            <AnimatePresence initial={false}>
                {auth === "oauth" && (
                    <motion.div key="oauth" {...reveal} className="space-y-3 overflow-hidden">
                        <p className="text-xs text-muted-foreground">
                            O Opex descobre o servidor de autorização, registra o cliente quando o provedor oferece e usa PKCE. Deixe em branco para o padrão; informe o client ID se o provedor exigir um cliente pré-cadastrado
                            (endereço de retorno: <code className="font-mono">{"<endereço do Opex>"}/api/opex/mcp-servers/oauth/callback</code>).
                        </p>
                        <div className={FORM_GRID}>
                            <Field id="mcp-oauth-client-id" label="Client ID (opcional)" error={errors?.clientId?.message}>
                                <Input id="mcp-oauth-client-id" autoComplete="off" className="font-mono" disabled={disabled} {...form.register("oauth.clientId")} />
                            </Field>
                            <Field id="mcp-oauth-client-secret" label="Client secret (opcional)" error={errors?.clientSecret?.message}>
                                <Input
                                    id="mcp-oauth-client-secret"
                                    type="password"
                                    autoComplete="new-password"
                                    className="font-mono"
                                    placeholder={savedOauth?.hasClientSecret && clientId === savedOauth.clientId ? "•••• (vazio mantém o salvo)" : ""}
                                    disabled={disabled || !clientId}
                                    {...form.register("oauth.clientSecret")}
                                />
                            </Field>
                            <Field id="mcp-oauth-scope" label="Escopos (opcional, separados por espaço)" error={errors?.scope?.message}>
                                <Input id="mcp-oauth-scope" autoComplete="off" className="font-mono" placeholder="read write" disabled={disabled} {...form.register("oauth.scope")} />
                            </Field>
                        </div>
                        {savedServer && savedOauth ? (
                            <OpexMcpOauthPanel server={savedServer} dirty={form.formState.isDirty} disabled={disabled} />
                        ) : (
                            <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground" role="note">
                                Salve o MCP para autorizar: o botão Autorizar aparece aqui depois de salvar.
                            </p>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
