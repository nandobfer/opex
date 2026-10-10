import type { ReactNode } from "react"
import { RepoIndexProvider } from "@/features/github/components/RepoIndexProvider"

/** Central de desenvolvimento: distribui o índice de repositórios do GitHub (avatar das centrais). */
export default function DesenvolvimentoLayout({ children }: { children: ReactNode }) {
    return <RepoIndexProvider enabled>{children}</RepoIndexProvider>
}
