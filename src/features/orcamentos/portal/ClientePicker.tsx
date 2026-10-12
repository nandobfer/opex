"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { toast } from "sonner"
import { Building2, ChevronRight, ShieldCheck } from "lucide-react"
import { api, apiErrorMessage } from "@/lib/api"
import { withBasePath } from "@/lib/base-path"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/feedback/EmptyState"
import { clienteDashboardPath } from "../constants"
import type { ClienteSelectableDto } from "../types"

/**
 * Escolha do cliente na entrada do portal: o usuário com mais de um cliente escolhe por onde entrar
 * (grava o cliente na sessão); o **dono** escolhe qual cliente pré-visualizar (cookie de prévia).
 */
export function ClientePicker({ clients, mode, greeting }: { clients: readonly ClienteSelectableDto[]; mode: "client" | "preview"; greeting?: string }) {
    const [pending, setPending] = useState<string | null>(null)

    const choose = async (client: ClienteSelectableDto) => {
        if (mode === "preview") {
            window.location.assign(withBasePath(`/api/auth/preview-client?clientId=${encodeURIComponent(client.id)}`))
            return
        }
        setPending(client.id)
        try {
            await api.post("/auth/client-select", { clientId: client.id })
            window.location.assign(withBasePath(clienteDashboardPath()))
        } catch (error) {
            setPending(null)
            toast.error(apiErrorMessage(error, "Não foi possível entrar neste cliente"))
        }
    }

    return (
        <div className="mx-auto w-full max-w-lg space-y-5">
            <header className="space-y-1 text-center">
                <h1 className="text-2xl font-semibold">Escolha o cliente</h1>
                <p className="text-sm text-muted-foreground">{greeting ?? (mode === "preview" ? "Selecione um cliente para pré-visualizar o portal." : "Você tem acesso a mais de um cliente. Escolha por onde entrar.")}</p>
            </header>

            {clients.length === 0 ? (
                <EmptyState icon={Building2} title="Nenhum cliente disponível" description="Fale com a equipe para liberar o acesso." />
            ) : (
                <ul className="space-y-2">
                    {clients.map((client, index) => (
                        <motion.li key={client.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: index * 0.03 }}>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => void choose(client)}
                                disabled={pending !== null}
                                className="flex h-auto w-full items-center justify-between gap-3 py-3 text-left"
                            >
                                <span className="flex min-w-0 items-center gap-2.5">
                                    <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                                    <span className="truncate font-medium">{client.name}</span>
                                    {client.admin && (
                                        <span className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                                            <ShieldCheck className="h-3 w-3" aria-hidden /> admin
                                        </span>
                                    )}
                                </span>
                                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                            </Button>
                        </motion.li>
                    ))}
                </ul>
            )}
        </div>
    )
}
