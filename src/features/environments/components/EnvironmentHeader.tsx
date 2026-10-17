"use client"

import Link from "next/link"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Database, FileCode2, FolderTree, GitBranch, History, Settings, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import type { EnvironmentDto } from "../types"
import { EnvironmentStatusBadge } from "./EnvironmentStatusBadge"

interface EnvironmentHeaderProps {
    environment: EnvironmentDto
    /** Etapa da operação em andamento (null quando não há). */
    operationStage: string | null
    /** Link da configuração do ambiente (null quando o ator não pode editar). */
    configHref: string | null
    onSelectTab: (tab: "publish" | "restore") => void
}

/** Cabeçalho do ambiente: identidade, estado, atalhos de publicação/restauração e os metadados. */
export function EnvironmentHeader({ environment, operationStage, configHref, onSelectTab }: EnvironmentHeaderProps) {
    const busy = Boolean(environment.activeOperationId)
    return (
        <header className="space-y-2 border-b px-4 py-3">
            <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-primary">{environment.slug}</span>
                        {busy ? (
                            <EnvironmentStatusBadge label={operationStage ?? "Na fila"} tone="primary" running />
                        ) : (
                            <EnvironmentStatusBadge label="Sem operação" tone="muted" />
                        )}
                    </div>
                    <h2 className="truncate text-base font-semibold" title={environment.name}>
                        {environment.name}
                    </h2>
                </div>
                <div className="hidden shrink-0 text-right text-[11px] text-muted-foreground sm:block">
                    <p className="font-mono text-foreground">{environment.dbVersion ?? "—"}</p>
                    <p>banco registrado</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    <Button size="sm" className="gap-1.5" onClick={() => onSelectTab("publish")}>
                        <Upload className="h-4 w-4" aria-hidden /> Publicar
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onSelectTab("restore")}>
                        <History className="h-4 w-4" aria-hidden /> Restaurar
                    </Button>
                    {configHref && (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button asChild variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                                        <Link href={configHref} aria-label="Configurações do ambiente">
                                            <Settings className="h-4 w-4" aria-hidden />
                                        </Link>
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Configurações do ambiente</TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                </div>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1 font-mono">
                    <GitBranch className="h-3 w-3" aria-hidden /> {environment.branch}
                </span>
                {environment.directory && (
                    <span className="flex min-w-0 items-center gap-1 font-mono" title={environment.directory}>
                        <FolderTree className="h-3 w-3 shrink-0" aria-hidden /> <span className="truncate">{environment.directory}</span>
                    </span>
                )}
                {environment.composeFile && (
                    <span className="flex items-center gap-1 font-mono">
                        <FileCode2 className="h-3 w-3" aria-hidden /> {environment.composeFile}
                    </span>
                )}
                {environment.port && <span className="font-mono">porta {environment.port}</span>}
                <span className="flex items-center gap-1">
                    <Database className="h-3 w-3" aria-hidden /> {environment.dbVersion ? `banco ${environment.dbVersion}` : "banco desconhecido"}
                </span>
                {environment.observedAt && (
                    <span>observado em {format(new Date(environment.observedAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
                )}
                {environment.healthcheck && <span className="truncate">saúde: {environment.healthcheck}</span>}
            </div>
        </header>
    )
}
