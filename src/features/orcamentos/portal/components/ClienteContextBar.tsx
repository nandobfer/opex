"use client"

import { useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Building2, Eye, ExternalLink } from "lucide-react"
import { api, apiErrorMessage } from "@/lib/api"
import { withBasePath } from "@/lib/base-path"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { HOME_HREF } from "@/features/layout/navigation"
import { clienteDashboardPath } from "../../constants"
import { useClientePortal } from "../ClientePortalContext"

/**
 * Barra de contexto do portal: seletor de cliente (quando o usuário tem mais de um), aviso de
 * **pré-visualização** do dono e atalho de volta ao Opex. A sidebar fica sempre recolhida no desktop
 * (68px), então o seletor vive nesta barra — visível e alcançável.
 */
export function ClienteContextBar() {
    const { clientId, clientName, clients, preview } = useClientePortal()
    const [switching, setSwitching] = useState(false)

    const switchClient = async (nextId: string) => {
        if (nextId === clientId) return
        setSwitching(true)
        try {
            await api.post("/auth/client-select", { clientId: nextId })
            window.location.assign(withBasePath(clienteDashboardPath()))
        } catch (error) {
            setSwitching(false)
            toast.error(apiErrorMessage(error, "Não foi possível trocar de cliente"))
        }
    }

    return (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card/60 px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
                <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                {clients.length > 1 && !preview ? (
                    <Select value={clientId} onValueChange={(value) => void switchClient(value)} disabled={switching}>
                        <SelectTrigger className="h-8 w-auto min-w-[180px] gap-2" aria-label="Cliente">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {clients.map((client) => (
                                <SelectItem key={client.id} value={client.id}>
                                    {client.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                ) : (
                    <span className="truncate text-sm font-medium">{clientName}</span>
                )}
                {preview && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                        <Eye className="h-3 w-3" aria-hidden /> Pré-visualização do dono
                    </span>
                )}
            </div>
            {preview && (
                <Button asChild variant="outline" size="sm" className="h-8 gap-1.5">
                    <Link href={HOME_HREF}>
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden /> Voltar ao Opex
                    </Link>
                </Button>
            )}
        </div>
    )
}
