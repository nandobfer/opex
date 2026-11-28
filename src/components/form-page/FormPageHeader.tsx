import type { MouseEvent, ReactNode } from "react"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"

interface FormPageHeaderProps {
    backHref: string
    backLabel: string
    title: string
    description?: ReactNode
    /** Status ao lado das ações (ex.: "Tudo salvo", alterações não salvas). */
    status?: ReactNode
    /** Ações à direita (Cancelar, Salvar...). */
    actions?: ReactNode
    /** Clique no voltar (ex.: o guarda de alterações chama `preventDefault` e confirma antes). */
    onBack?: (event: MouseEvent<HTMLAnchorElement>) => void
}

/**
 * Cabeçalho das páginas de formulário (Novo/Editar): voltar para a lista, título, descrição e, à
 * direita, o status e as ações. Mesmo cabeçalho do serviço do Financeiro e do ambiente.
 */
export function FormPageHeader({ backHref, backLabel, title, description, status, actions, onBack }: FormPageHeaderProps) {
    return (
        <header className="space-y-3">
            <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1.5">
                <Link href={backHref} onClick={onBack}>
                    <ArrowLeft className="h-4 w-4" aria-hidden /> {backLabel}
                </Link>
            </Button>
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div className="min-w-0">
                    <h1 className="text-lg font-semibold md:text-2xl">{title}</h1>
                    {description && <p className="text-sm text-muted-foreground">{description}</p>}
                </div>
                {(status || actions) && (
                    <div className="flex flex-wrap items-center gap-2 md:justify-end">
                        {status}
                        {actions}
                    </div>
                )}
            </div>
        </header>
    )
}
