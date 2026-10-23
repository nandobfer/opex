import type { ReactNode } from "react"
import { DevCenterRoute } from "@/features/agentic/components/dev-center/DevCenterRoute"
import { RepoIndexProvider } from "@/features/github/components/RepoIndexProvider"

/**
 * Central de desenvolvimento: distribui o índice de repositórios do GitHub (avatar das centrais) e
 * renderiza a tela inteira no layout (a tarefa vem da URL por `useParams`), para trocar de tarefa não
 * remontar as colunas. As páginas filhas não renderizam nada.
 */
export default function DesenvolvimentoLayout({ children }: { children: ReactNode }) {
    return (
        <RepoIndexProvider enabled>
            <DevCenterRoute />
            {children}
        </RepoIndexProvider>
    )
}
