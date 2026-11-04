import { redirect } from "next/navigation"

/** `/configuracoes` é o grupo do menu, sem página própria: leva a Aparência. */
export default function ConfiguracoesPage() {
    redirect("/configuracoes/aparencia")
}
