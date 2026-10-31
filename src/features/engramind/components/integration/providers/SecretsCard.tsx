"use client"

import { useState } from "react"
import { Loader2, Save, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { SecretValueInput, type SecretValueAction } from "@/components/ui/secret-value-input"
import { SECRET_KEYS, type EngramindSecretKey } from "../../../constants"
import { settingHelp } from "../../../help/settings"
import type { SettingMeta } from "../../../types"
import { engramindSend, route, useEngramindMutation } from "../../../hooks/useEngramind"
import { formatDateTime } from "../../shared/format"
import { InfoField } from "../../shared/InfoField"
import { Section } from "../../shared/Section"

/** Chaves de API do Redator e do embedding: Gravar e Apagar; a tela só mostra "Configurada em …". */
export function SecretsCard({ metas }: { metas: SettingMeta[] }) {
    return (
        <Section title="Chaves de API" info="Gravadas cifradas no Engramind (AES-256-GCM com SECRETS_KEY). O valor nunca volta: nem nesta tela, nem nos logs, nem na auditoria." description="Prefira a IA do Opex acima: ela copia e mantém a chave do Opex. Gravar uma chave à mão faz a seção passar a &quot;Configurado no Engramind&quot;.">
            <div className="grid gap-4 sm:grid-cols-2">
                {SECRET_KEYS.map((key) => (
                    <SecretRow key={key} secretKey={key} meta={metas.find((meta) => meta.key === key)} />
                ))}
            </div>
        </Section>
    )
}

function SecretRow({ secretKey, meta }: { secretKey: EngramindSecretKey; meta?: SettingMeta }) {
    const help = settingHelp(secretKey, meta?.description)
    const [action, setAction] = useState<SecretValueAction | undefined>(undefined)
    const [confirmClear, setConfirmClear] = useState(false)
    const configured = meta?.configured === true
    const save = useEngramindMutation((value: string | null) => engramindSend("put", route("secrets", secretKey), { value }), {
        invalidate: ["settings", "status"],
        success: (value) => (value ? `${help.label} gravada` : `${help.label} apagada`),
    })
    const id = `secret-${secretKey.replace(/\W/g, "-")}`
    return (
        <InfoField id={id} label={help.label} info={help.help} hint={configured ? `Configurada em ${formatDateTime(meta?.updated_at)}` : "Não configurada"}>
            <SecretValueInput id={id} label={help.label.toLowerCase()} configured={configured} statusLabel={configured ? "Configurada" : "Não configurada"} action={action?.action === "set" ? action : undefined} onChange={setAction} allowClear={false} />
            <div className="flex gap-2">
                <Button
                    type="button"
                    size="sm"
                    disabled={action?.action !== "set" || !action.value || save.isPending}
                    onClick={() => action?.action === "set" && save.mutate(action.value, { onSuccess: () => setAction(undefined) })}
                >
                    {save.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden /> : <Save className="mr-1.5 h-3.5 w-3.5" aria-hidden />} Gravar
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={!configured || save.isPending} onClick={() => setConfirmClear(true)}>
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Apagar
                </Button>
            </div>
            <ConfirmDialog
                open={confirmClear}
                onOpenChange={setConfirmClear}
                title={`Apagar ${help.label.toLowerCase()}?`}
                description="Sem a chave, o provedor que a exige deixa de funcionar até você gravar outra."
                confirmLabel="Apagar"
                variant="destructive"
                pending={save.isPending}
                onConfirm={() => save.mutate(null, { onSettled: () => setConfirmClear(false) })}
            />
        </InfoField>
    )
}
