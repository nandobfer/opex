import Link from "next/link"
import { SearchX } from "lucide-react"

/** 404 fora do shell (endereço que não pertence a nenhuma área do app). */
export default function NotFound() {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
            <div className="rounded-full bg-muted p-4">
                <SearchX className="h-7 w-7 text-muted-foreground" aria-hidden />
            </div>
            <div className="space-y-1">
                <h1 className="text-xl font-semibold text-foreground">Página não encontrada</h1>
                <p className="text-sm text-muted-foreground">Não encontramos o endereço solicitado.</p>
            </div>
            <Link href="/" className="text-sm font-medium text-primary hover:underline">
                Voltar para o início
            </Link>
        </div>
    )
}
