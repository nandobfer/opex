"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { GithubRepoLabel } from "@/features/github/components/shared"
import { repoLabel } from "@/features/orcamentos/logic"
import type { ClienteRepoDto } from "@/features/orcamentos/types"

/** Card do repositório escolhido para a tarefa (dados do GitHub: avatar, descrição e privacidade). */
export function RepoMetaCard({ repo }: { repo: ClienteRepoDto | null }) {
    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Repositório</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
                {repo ? <GithubRepoLabel repo={repoLabel(repo)} /> : <span className="text-sm text-muted-foreground">—</span>}
            </CardContent>
        </Card>
    )
}
