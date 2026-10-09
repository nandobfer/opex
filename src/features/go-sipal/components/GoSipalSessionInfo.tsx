"use client"

import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { AlertTriangle, CalendarClock, ShieldCheck, ShieldX, UserRound } from "lucide-react"
import { cn } from "@/lib/utils"
import type { GoSipalSessionDto } from "../session/types"

const when = (iso: string) => format(new Date(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })

function profileLabel(session: GoSipalSessionDto): { label: string; ok: boolean } {
    if (session.user?.isDevLeader) return { label: "Líder de desenvolvimento", ok: true }
    if (session.user?.isDeveloper) return { label: "Desenvolvedor", ok: true }
    return { label: "Sem acesso ao Centro de Desenvolvimento", ok: false }
}

function expiryText(session: GoSipalSessionDto): string {
    if (!session.expiresAt) return "Expiração não informada pelo token"
    if (session.status === "expired") return `Expirou em ${when(session.expiresAt)}`
    const days = session.daysLeft ?? 0
    return `Expira em ${when(session.expiresAt)} (${days === 1 ? "falta 1 dia" : `faltam ${days} dias`})`
}

/** Dados da sessão conectada: usuário, perfil, conexão e expiração (com destaque de aviso). */
export function GoSipalSessionInfo({ session }: { session: GoSipalSessionDto }) {
    const profile = profileLabel(session)
    const tone = session.status === "expired" ? "text-destructive" : session.status === "expiring" ? "text-warning" : "text-muted-foreground"
    return (
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="flex items-start gap-2">
                <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                <div className="min-w-0">
                    <dt className="sr-only">Usuário</dt>
                    <dd className="truncate font-medium">{session.user?.name ?? "—"}</dd>
                    <dd className="truncate text-xs text-muted-foreground">
                        {session.user?.email ?? session.email ?? "—"}
                        {session.user?.userType ? ` · ${session.user.userType}` : ""}
                    </dd>
                </div>
            </div>
            <div className="flex items-start gap-2">
                {profile.ok ? (
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />
                ) : (
                    <ShieldX className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
                )}
                <div>
                    <dt className="text-xs text-muted-foreground">Perfil</dt>
                    <dd className={cn(!profile.ok && "text-warning")}>{profile.label}</dd>
                </div>
            </div>
            <div className="flex items-start gap-2 sm:col-span-2">
                {session.status === "connected" ? (
                    <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                ) : (
                    <AlertTriangle className={cn("mt-0.5 h-4 w-4 shrink-0", tone)} aria-hidden />
                )}
                <div>
                    <dt className="sr-only">Validade</dt>
                    <dd className={tone}>{expiryText(session)}</dd>
                    {session.connectedAt && <dd className="text-xs text-muted-foreground">Conectado em {when(session.connectedAt)}</dd>}
                </div>
            </div>
        </dl>
    )
}
