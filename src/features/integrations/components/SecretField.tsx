"use client"

import { AlertTriangle, KeyRound } from "lucide-react"
import { Label } from "@/components/ui/label"
import { SecretValueInput } from "@/components/ui/secret-value-input"
import type { SecretFieldDef } from "@/lib/integrations/catalog"
import type { SecretAction } from "../schemas/integration.schema"
import type { IntegrationSecretStateDto } from "../types"

interface SecretFieldProps {
    field: SecretFieldDef
    state: IntegrationSecretStateDto
    action: SecretAction | undefined
    onChange: (action: SecretAction | undefined) => void
    disabled?: boolean
    encryptionAvailable: boolean
}

const SOURCE_LABEL: Record<IntegrationSecretStateDto["source"], string> = {
    db: "Configurado",
    env: "Configurado no .env",
    none: "Não configurado",
}

/**
 * Campo privado somente-escrita: o valor salvo nunca volta ao navegador. O administrador
 * pode apenas substituir (novo valor) ou limpar; "Desfazer" volta a manter o atual.
 */
export function SecretField({ field, state, action, onChange, disabled, encryptionAvailable }: SecretFieldProps) {
    const inputId = `secret-${field.key}`

    return (
        <div className="space-y-1.5">
            <Label htmlFor={inputId} className="flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                {field.label}
                {field.required && <span className="text-destructive">*</span>}
            </Label>
            <SecretValueInput
                id={inputId}
                label={field.label}
                configured={state.configured}
                statusLabel={SOURCE_LABEL[state.source]}
                action={action}
                onChange={onChange}
                disabled={disabled}
                editBlockedReason={encryptionAvailable ? null : "Chave de criptografia ausente no servidor"}
                multiline={field.multiline}
            />
            {state.unreadable && (
                <p className="flex items-center gap-1 text-xs text-amber-600">
                    <AlertTriangle className="h-3.5 w-3.5" /> O valor salvo não pôde ser lido com a chave atual; defina-o novamente.
                </p>
            )}
            {field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}
        </div>
    )
}
