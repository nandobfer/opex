import { Banknote, Blocks, LayoutDashboard, ListTodo, Server, Users } from "lucide-react"
import type { NavSectionDef } from "@/features/layout/types"
import { clienteAmbientesPath, clienteDashboardPath, clienteFinanceiroPath, clientePluginsPath, clienteTarefasPath, clienteUsuariosPath } from "../constants"

/**
 * Navegação do **portal do cliente**: Dashboard, Tarefas, Ambientes (estado para todos; ações do
 * admin) e — só para o **admin** do cliente — Financeiro e Usuários. Sem itens internos do dono (Horas agênticas, Central de desenvolvimento,
 * Integrações).
 */
export function clienteNav(isAdmin: boolean): readonly NavSectionDef[] {
    const items = [
        { href: clienteDashboardPath(), label: "Dashboard", title: "Dashboard", icon: LayoutDashboard },
        { href: clienteTarefasPath(), label: "Tarefas", title: "Tarefas", icon: ListTodo },
        { href: clienteAmbientesPath(), label: "Ambientes", title: "Ambientes", icon: Server },
    ]
    if (isAdmin) {
        items.push({ href: clienteFinanceiroPath(), label: "Financeiro", title: "Financeiro", icon: Banknote })
        items.push({ href: clienteUsuariosPath(), label: "Usuários", title: "Usuários", icon: Users })
        // Plugins do portal (OPE-172): prévia, aprovação e rollback dos plugins do cliente.
        items.push({ href: clientePluginsPath(), label: "Plugins", title: "Plugins", icon: Blocks })
    }
    return [{ id: "portal", items }]
}

/** Telas do portal com sub-rotas: navegar dentro delas não troca a página inteira. */
export const CLIENTE_PERSISTENT_HREFS: readonly string[] = ["/cliente/tarefa"]
