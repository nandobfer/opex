import { cn } from "@/lib/utils"
import { withBasePath } from "@/lib/base-path"

/** Marca do Opex (menu lateral e cabeçalho do celular): imagem decorativa, o nome fica no link. */
export function BrandMark({ className }: { className?: string }) {
    return (
        // eslint-disable-next-line @next/next/no-img-element -- marca pequena e estática; o caminho passa por `withBasePath`.
        <img src={withBasePath("/opex-mark.png")} alt="" className={cn("h-9 w-9 shrink-0 drop-shadow-[0_0_12px_hsl(var(--primary)/0.45)]", className)} />
    )
}
