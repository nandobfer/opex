"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { AnimatePresence } from "framer-motion"
import { FileWarning, Gauge, PlugZap, TriangleAlert } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { integrationPath } from "@/lib/integrations/catalog"
import type { OpencodeQuotaDto } from "../types"
import { QuotaProviderGroup } from "./QuotaProviderGroup"

function PanelMessage({ icon: Icon, tone = "muted", title, description, children }: { icon: LucideIcon; tone?: "muted" | "warning" | "destructive"; title: string; description?: string; children?: ReactNode }) {
    const color = tone === "destructive" ? "text-destructive" : tone === "warning" ? "text-warning" : "text-muted-foreground"
    return (
        <div className="flex gap-2 rounded-md bg-muted/40 p-2 text-[11px]" role={tone === "muted" ? "status" : "alert"}>
            <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${color}`} aria-hidden />
            <div className="min-w-0 flex-1 space-y-1">
                <p className="font-medium text-foreground">{title}</p>
                {description && <p className="text-muted-foreground">{description}</p>}
                {children}
            </div>
        </div>
    )
}

interface QuotaPanelBodyProps {
    data: OpencodeQuotaDto | undefined
    isLoading: boolean
    error: string | null
    now: number
    onRetry: () => void
    collapsedProviders: readonly string[]
    onToggleProvider: (id: string) => void
}

/** Conteúdo expandido do painel: carregando, estados de falha/vazio ou os provedores com as barras. */
export function QuotaPanelBody({ data, isLoading, error, now, onRetry, collapsedProviders, onToggleProvider }: QuotaPanelBodyProps) {
    if (isLoading) {
        return (
            <div className="space-y-2" aria-label="Carregando quota do OpenCode">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
            </div>
        )
    }
    if (error || !data) {
        return (
            <PanelMessage icon={TriangleAlert} tone="destructive" title="Não foi possível carregar a quota" description={error ?? "Tente novamente."}>
                <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={onRetry}>
                    Tentar novamente
                </Button>
            </PanelMessage>
        )
    }
    if (data.state === "unconfigured") {
        return (
            <PanelMessage icon={PlugZap} title="OpenCode não configurado" description={data.message ?? undefined}>
                <Button asChild size="sm" variant="outline" className="h-6 px-2 text-[11px]">
                    <Link href={integrationPath("ai_opencode")}>Configurar OpenCode</Link>
                </Button>
            </PanelMessage>
        )
    }
    if (data.state === "missing") {
        return (
            <PanelMessage icon={FileWarning} tone="warning" title="Export do opencode-quota desligado" description="Ligue “Quota file (JSON)” em /quota_status › Plugin no OpenCode, ou use system.exportFile: true no settings.jsonc do plugin.">
                <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={onRetry}>
                    Verificar de novo
                </Button>
            </PanelMessage>
        )
    }
    if (data.state === "error") {
        return (
            <PanelMessage icon={TriangleAlert} tone="destructive" title="Não foi possível ler a quota" description={data.message ?? undefined}>
                <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={onRetry}>
                    Tentar novamente
                </Button>
            </PanelMessage>
        )
    }
    if (!data.providers.length) return <PanelMessage icon={Gauge} title="Nenhum provedor com quota" description="Entre num provedor no OpenCode (/connect) para ver os limites aqui." />
    return (
        <div className="space-y-3">
            <AnimatePresence initial={false}>
                {data.providers.map((provider) => (
                    <QuotaProviderGroup key={provider.id} provider={provider} now={now} expanded={!collapsedProviders.includes(provider.id)} onToggle={() => onToggleProvider(provider.id)} />
                ))}
            </AnimatePresence>
        </div>
    )
}
