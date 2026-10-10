import { Link2Off } from "lucide-react"

/** Aviso do portal quando o link não traz um token de acesso. */
export function ClienteMissingToken() {
    return (
        <div className="mx-auto max-w-md rounded-lg border p-8 text-center">
            <Link2Off className="mx-auto mb-3 h-8 w-8 text-muted-foreground" aria-hidden />
            <h1 className="text-lg font-semibold">Link inválido</h1>
            <p className="mt-1 text-sm text-muted-foreground">Este endereço não inclui o token de acesso. Use o link enviado pela equipe.</p>
        </div>
    )
}
