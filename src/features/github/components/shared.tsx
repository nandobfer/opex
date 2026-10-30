"use client"

import { Github, Lock } from "lucide-react"
import { TooltipIconButton } from "@/components/ui/tooltip-icon-button"
import { cn } from "@/lib/utils"
import type { GithubRepoLabelData } from "../types"

/** Avatar do GitHub (imagem pública) com inicial como reserva. */
export function GithubAvatar({ login, avatarUrl, className }: { login: string; avatarUrl?: string | null; className?: string }) {
    return avatarUrl ? (
        // Avatares vêm de avatars.githubusercontent.com (sem otimização do Next: app local).
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" className={cn("h-5 w-5 shrink-0 rounded-full bg-muted", className)} loading="lazy" />
    ) : (
        <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold uppercase text-muted-foreground", className)} aria-hidden>
            {login.slice(0, 1)}
        </span>
    )
}

export function GithubUserLabel({ login, name, avatarUrl }: { login: string; name?: string | null; avatarUrl?: string | null }) {
    return (
        <span className="flex min-w-0 items-center gap-2">
            <GithubAvatar login={login} avatarUrl={avatarUrl} />
            <span className="min-w-0 truncate">
                <span className="font-medium">@{login}</span>
                {name && name !== login && <span className="ml-1.5 text-xs text-muted-foreground">{name}</span>}
            </span>
        </span>
    )
}

export { FieldTrigger } from "@/components/ui/field-trigger"

/** Item de repositório do GitHub (padrão único do app): avatar real (fallback inicial) + `owner/repo` + descrição + cadeado quando privado. */
export function GithubRepoLabel({ repo, nameClassName }: { repo: GithubRepoLabelData; /** Classe extra do `org/repo` (ex.: cor da central em Tarefas). */ nameClassName?: string }) {
    return (
        <span className="flex min-w-0 flex-1 items-center gap-2">
            <GithubAvatar login={repo.fullName} avatarUrl={repo.ownerAvatarUrl} />
            <span className="min-w-0 flex-1">
                <span className={cn("block truncate font-medium", nameClassName)} data-testid="github-repo-name">
                    {repo.fullName}
                </span>
                {repo.description && <span className="block truncate text-xs text-muted-foreground">{repo.description}</span>}
            </span>
            {repo.private && <Lock className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Privado" />}
        </span>
    )
}

/** Link para abrir a issue no GitHub sem abrir o card/linha. Com `number`, mostra `#N` ao lado do ícone. */
export function IssueLinkButton({ url, label, number, className }: { url: string; label: string; number?: number; className?: string }) {
    const stop = (event: { stopPropagation: () => void }) => event.stopPropagation()
    return (
        <a
            href={url}
            target="_blank"
            rel="noreferrer"
            onClick={stop}
            onPointerDown={stop}
            onKeyDown={stop}
            aria-label={label}
            title={label}
            className={cn(
                "inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
                number !== undefined && "w-auto gap-1 px-1.5",
                className,
            )}
        >
            <Github className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {number !== undefined && <span className="font-mono text-[11px] font-semibold tabular-nums">#{number}</span>}
        </a>
    )
}

/** Botão de ícone "Abrir issue" dos cabeçalhos (tarefa e rascunho): ícone do GitHub + `#N`, dica com o rótulo. */
export function IssueIconButton({ url, repo, number }: { url: string; repo: string; number: number }) {
    return (
        <TooltipIconButton label={`Abrir issue ${repo}#${number} no GitHub`} tooltip="Abrir issue" href={url} external className="gap-1.5">
            <Github aria-hidden />
            <span className="font-mono text-xs font-semibold tabular-nums">#{number}</span>
        </TooltipIconButton>
    )
}

export function NotConfiguredHint() {
    return <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Cadastre o token de acesso do GitHub na aba Geral para usar esta seção.</p>
}
