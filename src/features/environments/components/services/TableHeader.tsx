import { cn } from "@/lib/utils"

/**
 * Cabeçalho das colunas das tabelas dos editores (portas, volumes, dependências), com a mesma grade das
 * linhas. Abaixo de `sm` some: as linhas empilham e cada campo leva o próprio rótulo/placeholder.
 */
export function TableHeader({ grid, columns }: { grid: string; columns: string[] }) {
    return (
        <div className={cn(grid, "hidden text-xs font-medium text-muted-foreground sm:grid")} aria-hidden>
            {columns.map((column, index) => (
                <span key={index}>{column}</span>
            ))}
        </div>
    )
}
