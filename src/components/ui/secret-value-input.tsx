"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { Eraser, Pencil, Undo2 } from "lucide-react"
import { IconAction } from "@/components/ui/icon-action"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

/** Ação sobre um valor secreto: gravar um valor novo ou limpar (ausente = manter o salvo). */
export type SecretValueAction = { action: "set"; value: string } | { action: "clear" }

interface SecretValueInputProps {
    id: string
    /** Nome do campo, usado no placeholder ("Novo valor para senha"). */
    label: string
    /** Já existe um valor salvo (que nunca volta ao navegador). */
    configured: boolean
    /** Situação exibida sem edição (ex.: "Configurado", "Não configurado"). */
    statusLabel: string
    action: SecretValueAction | undefined
    onChange: (action: SecretValueAction | undefined) => void
    disabled?: boolean
    /** Motivo que bloqueia definir/substituir (ex.: chave de criptografia ausente). */
    editBlockedReason?: string | null
    /** Oferece "Limpar" quando há valor salvo (padrão: sim). */
    allowClear?: boolean
    /** Começa já no campo de digitação (ex.: linha nova). */
    initiallyEditing?: boolean
}

const swap = { initial: { opacity: 0, y: -4 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 4 }, transition: { duration: 0.18 } }

/**
 * Campo secreto somente-escrita: o valor salvo nunca é exibido. Só dá para substituir (valor novo)
 * ou limpar; "Desfazer" volta a manter o atual. Usado nos campos privados das integrações e nos
 * headers/variáveis dos MCPs do Agente Opex.
 */
export function SecretValueInput({ id, label, configured, statusLabel, action, onChange, disabled, editBlockedReason, allowClear = true, initiallyEditing = false }: SecretValueInputProps) {
    const [editing, setEditing] = useState(initiallyEditing)
    const mode = action?.action === "clear" ? "clear" : editing || action?.action === "set" ? "set" : "keep"

    const reset = () => {
        setEditing(false)
        onChange(undefined)
    }

    return (
        <AnimatePresence mode="wait" initial={false}>
            {mode === "set" ? (
                <motion.div key="set" {...swap} className="flex gap-2">
                    <Input
                        id={id}
                        type="password"
                        autoComplete="new-password"
                        autoFocus={!initiallyEditing}
                        placeholder={`Novo valor para ${label.toLowerCase()}`}
                        value={action?.action === "set" ? action.value : ""}
                        onChange={(event) => onChange(event.target.value ? { action: "set", value: event.target.value } : undefined)}
                        disabled={disabled}
                    />
                    {!initiallyEditing && <IconAction label="Desfazer" icon={Undo2} onClick={reset} className="h-10 w-10" />}
                </motion.div>
            ) : (
                <motion.div
                    key={mode}
                    {...swap}
                    className={cn("flex h-10 items-center justify-between gap-2 rounded-md border px-3", mode === "clear" ? "border-destructive/40 bg-destructive/5" : "bg-muted/40")}
                >
                    <span className="flex items-center gap-2 text-sm">
                        {mode === "clear" ? (
                            <span className="text-destructive">Será removido ao salvar</span>
                        ) : (
                            <>
                                <span className={cn(configured ? "text-foreground" : "text-muted-foreground")}>{statusLabel}</span>
                                {configured && <span className="tracking-widest text-muted-foreground">••••••••</span>}
                            </>
                        )}
                    </span>
                    <span className="-mr-2 flex items-center">
                        {mode === "clear" ? (
                            <IconAction label="Desfazer" icon={Undo2} onClick={reset} />
                        ) : (
                            <>
                                <IconAction
                                    label={configured ? "Substituir" : "Definir"}
                                    icon={Pencil}
                                    disabledReason={editBlockedReason ?? (disabled ? "Indisponível" : null)}
                                    onClick={() => setEditing(true)}
                                />
                                {configured && allowClear && <IconAction label="Limpar" icon={Eraser} tone="danger" disabledReason={disabled ? "Indisponível" : null} onClick={() => onChange({ action: "clear" })} />}
                            </>
                        )}
                    </span>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
