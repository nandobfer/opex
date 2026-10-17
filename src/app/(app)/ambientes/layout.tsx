import type { ReactNode } from "react"
import { RepoIndexProvider } from "@/features/github/components/RepoIndexProvider"

/** Ambientes: distribui o índice de repositórios do GitHub (avatar do seletor de repositório). */
export default function AmbientesLayout({ children }: { children: ReactNode }) {
    return <RepoIndexProvider enabled>{children}</RepoIndexProvider>
}
