"use client"

import { createContext, useContext, type ReactNode } from "react"
import { useGithubRepoIndex } from "../hooks/useGithub"
import type { GithubRepoLabelData, GithubRepoOption } from "../types"

const EMPTY: ReadonlyMap<string, GithubRepoOption> = new Map()
const RepoIndexContext = createContext<ReadonlyMap<string, GithubRepoOption>>(EMPTY)

/**
 * Distribui o índice `owner/repo → repositório do GitHub` para as telas de tarefas, sem `prop
 * drilling` até o card. Fora do provider o índice é vazio (o `GithubRepoLabel` cai na inicial).
 */
export function RepoIndexProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
    return <RepoIndexContext.Provider value={useGithubRepoIndex(enabled)}>{children}</RepoIndexContext.Provider>
}

export const useRepoIndex = () => useContext(RepoIndexContext)

/** Dados do `GithubRepoLabel` para um repositório do projeto; sem dado do GitHub, mantém a inicial. */
export function repoLabelOption(repo: string, index: ReadonlyMap<string, GithubRepoOption>): GithubRepoLabelData {
    return index.get(repo.toLowerCase()) ?? { fullName: repo, ownerAvatarUrl: null, description: null, private: false }
}
