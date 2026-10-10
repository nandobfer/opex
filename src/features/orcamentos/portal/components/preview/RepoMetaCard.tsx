"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { GithubRepoLabel } from "@/features/github/components/shared"

/** Card do repositório escolhido para a tarefa. */
export function RepoMetaCard({ repo }: { repo: string | null }) {
    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Repositório</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
                {repo ? (
                    <GithubRepoLabel repo={{ fullName: repo, ownerAvatarUrl: null, description: null, private: false }} />
                ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                )}
            </CardContent>
        </Card>
    )
}
