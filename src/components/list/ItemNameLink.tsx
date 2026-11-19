import type { ReactNode } from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"

/**
 * Nome de um item de lista como link para a página dele (padrão do projeto: o nome leva à página;
 * sem ícone de "abrir"). Mesmo estilo e foco em todas as listas.
 */
export function ItemNameLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
    return (
        <Link href={href} className={cn("truncate rounded-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}>
            {children}
        </Link>
    )
}
