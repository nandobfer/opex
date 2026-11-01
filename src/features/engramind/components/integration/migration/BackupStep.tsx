"use client"

import { Archive, Download, Loader2, Network } from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Button } from "@/components/ui/button"
import { useMigrationBackup, useMigrationProvision } from "../../../hooks/useMemoryMigration"
import type { MemoryMigrationDto } from "../../../types"
import { Section } from "../../shared/Section"
import { StepStatus } from "./StepStatus"

/** Etapa 1: conferir canais e agentes no Engramind e gerar o backup da coleção antiga (sem alterá-la). */
export function BackupStep({ state }: { state: MemoryMigrationDto }) {
    const backup = useMigrationBackup()
    const provision = useMigrationProvision()
    const busy = Object.values(state.steps).some((step) => step.status === "running")
    return (
        <Section
            title="1. Backup"
            info="Lê toda a coleção agent_memories do Opex (sem alterar nada) e guarda um snapshot JSON com hash SHA-256. O curador não roda sem backup."
            description={`${state.legacyCount} memória(s) na coleção antiga.`}
            actions={
                <>
                    <Button type="button" variant="outline" size="sm" disabled={provision.isPending} onClick={() => provision.mutate()}>
                        {provision.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : <Network className="mr-1.5 h-4 w-4" aria-hidden />} Conferir canais e agentes
                    </Button>
                    <Button type="button" size="sm" disabled={busy || backup.isPending} onClick={() => backup.mutate()}>
                        {backup.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : <Archive className="mr-1.5 h-4 w-4" aria-hidden />} {state.backup ? "Gerar backup de novo" : "Gerar backup"}
                    </Button>
                </>
            }
        >
            <StepStatus step={state.steps.backup} onRetry={() => backup.mutate()} retrying={backup.isPending} />
            {state.backup ? (
                <div className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2 text-sm" data-testid="migration-backup">
                    <span className="min-w-0 flex-1">
                        Backup de {format(new Date(state.backup.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} · {state.backup.count} memória(s) · <span className="font-mono text-xs">sha256 {state.backup.sha256.slice(0, 16)}…</span>
                    </span>
                    <Button asChild type="button" size="sm" variant="ghost">
                        <a href="/api/engramind/migration/backup" download>
                            <Download className="mr-1.5 h-4 w-4" aria-hidden /> Baixar JSON
                        </a>
                    </Button>
                </div>
            ) : (
                <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Nenhum backup ainda: gere o backup para liberar o curador.</p>
            )}
        </Section>
    )
}
