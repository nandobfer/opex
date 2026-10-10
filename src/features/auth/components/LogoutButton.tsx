"use client"

import { useState } from "react"
import { Loader2, LogOut } from "lucide-react"
import { api } from "@/lib/api"
import { withBasePath } from "@/lib/base-path"
import { cn } from "@/lib/utils"

/**
 * Sair da sessão: apaga o cookie no servidor (`POST /auth/logout`) e volta para a tela de login.
 * A volta usa `window.location` (recarga completa) para limpar caches do cliente. Qualquer falha
 * na chamada não impede a saída — o cookie é de sessão e expira ao fechar o navegador.
 */
export function LogoutButton({ collapsed = false, className }: { collapsed?: boolean; className?: string }) {
    const [pending, setPending] = useState(false)

    async function handleLogout() {
        setPending(true)
        try {
            await api.post("/auth/logout")
        } catch {
            // Sem problema: o cookie de sessão expira sozinho ao fechar o navegador.
        }
        window.location.assign(withBasePath("/login"))
    }

    return (
        <button
            type="button"
            onClick={handleLogout}
            disabled={pending}
            aria-label="Sair"
            title="Sair"
            className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground disabled:opacity-60",
                collapsed && "justify-center px-0",
                className,
            )}
        >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
            {!collapsed && <span>Sair</span>}
        </button>
    )
}
