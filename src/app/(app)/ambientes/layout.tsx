import type { ReactNode } from "react"
import { RepoIndexProvider } from "@/features/github/components/RepoIndexProvider"

/** Ambientes (dono): distribui o índice de repositórios do GitHub para o seletor com busca. */
export default function AmbientesLayout({ children }: { children: ReactNode }) {
    return <RepoIndexProvider enabled>{children}</RepoIndexProvider>
}
