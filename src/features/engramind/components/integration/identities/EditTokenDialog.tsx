"use client"

import { useCallback } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FORM_GRID } from "@/components/ui/form-grid"
import { Input } from "@/components/ui/input"
import { combinationOf, scopesOfCombination, SCOPE_COMBINATIONS, type ScopeCombination } from "../../../constants"
import { updateTokenInput } from "../../../operations"
import { IDENTITY_HELP } from "../../../help/identities"
import type { EngramindToken } from "../../../types"
import { engramindSend, route, useEngramindMutation } from "../../../hooks/useEngramind"
import { InfoField } from "../../shared/InfoField"
import { ScopePicker } from "../../shared/ScopePicker"
import { useSchemaForm } from "../../shared/useSchemaForm"

const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : "")

/** Editar rótulo, escopos (sem escalada) e expiração. O token do Opex não pode ser rebaixado. */
export function EditTokenDialog({ token, own, open, onOpenChange }: { token: EngramindToken; own: boolean; open: boolean; onOpenChange: (open: boolean) => void }) {
    const toPayload = useCallback(
        (values: { label: string; scopes: ScopeCombination; expiresAt: string }) => ({
            token: token.id,
            label: values.label.trim() || null,
            scopes: scopesOfCombination(values.scopes),
            expires_at: values.expiresAt ? new Date(values.expiresAt).toISOString() : null,
        }),
        [token.id],
    )
    const form = useSchemaForm(updateTokenInput, { label: token.label ?? "", scopes: combinationOf(token.scopes) ?? "read", expiresAt: toLocal(token.expires_at) }, toPayload)
    const save = useEngramindMutation(({ token: id, ...body }: Record<string, unknown>) => engramindSend("patch", route("tokens", String(id)), body), { invalidate: ["tokens"], success: "Token atualizado" })
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>Editar token {token.prefix}</DialogTitle>
                    <DialogDescription>{own ? IDENTITY_HELP.ownToken : "Os escopos só podem ser reduzidos (sem escalada)."}</DialogDescription>
                </DialogHeader>
                <div className={FORM_GRID}>
                    <InfoField id="edit-token-label" label="Rótulo" info={IDENTITY_HELP.label} error={form.error("label")}>
                        <Input id="edit-token-label" value={form.values.label} onChange={(event) => form.set("label", event.target.value)} />
                    </InfoField>
                    <InfoField id="edit-token-expires" label="Expira em" info={`${IDENTITY_HELP.expiresAt} Vazio remove a expiração.`} error={form.error("expires_at")}>
                        <Input id="edit-token-expires" type="datetime-local" value={form.values.expiresAt} onChange={(event) => form.set("expiresAt", event.target.value)} />
                    </InfoField>
                    <InfoField id="edit-token-scopes" label="Escopos" info={own ? IDENTITY_HELP.ownToken : "write e delete exigem read."} error={form.error("scopes")} className="space-y-1.5 sm:col-span-2">
                        <ScopePicker id="edit-token-scopes" value={form.values.scopes} onChange={(scopes) => form.set("scopes", scopes)} allowed={own ? ["read+write+delete"] : SCOPE_COMBINATIONS} />
                    </InfoField>
                </div>
                <DialogFooter>
                    <Button type="button" disabled={!form.valid || save.isPending} onClick={() => form.payload && save.mutate(form.payload as Record<string, unknown>, { onSuccess: () => onOpenChange(false) })}>
                        {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Salvar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
