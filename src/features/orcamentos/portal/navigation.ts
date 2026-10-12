import { Banknote, LayoutDashboard, ListTodo, Users } from "lucide-react"
import type { NavSectionDef } from "@/features/layout/types"
import { clienteDashboardPath, clienteFinanceiroPath, clienteTarefasPath, clienteUsuariosPath } from "../constants"

/**
 * Navegação do **portal do cliente**: Dashboard, Tarefas e — só para o **admin** do cliente —
 * Financeiro e Usuários. Sem itens internos do dono (Horas agênticas, Central de desenvolvimento,
 * Integrações).
 */
export function clienteNav(isAdmin: boolean): readonly NavSectionDef[] {
    const items = [
        { href: clienteDashboardPath(), label: "Dashboard", title: "Dashboard", icon: LayoutDashboard },
        { href: clienteTarefasPath(), label: "Tarefas", title: "Tarefas", icon: ListTodo },
    ]
    if (isAdmin) {
        items.push({ href: clienteFinanceiroPath(), label: "Financeiro", title: "Financeiro", icon: Banknote })
        items.push({ href: clienteUsuariosPath(), label: "Usuários", title: "Usuários", icon: Users })
    }
    return [{ id: "portal", items }]
}

/** Telas do portal com sub-rotas: navegar dentro delas não troca a página inteira. */
export const CLIENTE_PERSISTENT_HREFS: readonly string[] = ["/cliente/tarefa"]
