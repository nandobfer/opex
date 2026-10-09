import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/**
 * Rodapé de ações de formulário no padrão do app (`DetailActions`, `TabFooter`): linha com
 * borda superior e botões à direita. Nunca flutuante/sticky.
 */
export function FormFooter({ children, className }: { children: ReactNode; className?: string }) {
    return <div className={cn("flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 pt-6 dark:border-gray-700", className)}>{children}</div>
}
