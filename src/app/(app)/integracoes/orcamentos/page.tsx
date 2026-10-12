import { redirect } from "next/navigation"
import { integrationPath } from "@/lib/integrations/catalog"

/** Rota legada: a integração "Orçamentos" passou a se chamar "Clientes" (`/integracoes/clientes`). */
export default function OrcamentosPage() {
    redirect(integrationPath("orcamentos"))
}
