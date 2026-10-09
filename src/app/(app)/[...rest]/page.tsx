import { ShellNotFound } from "@/features/layout/components/ShellNotFound"
import { HOME_HREF } from "@/features/layout/navigation"

/** Endereço desconhecido: aviso dentro do shell, com o menu. */
export default function UnknownPage() {
    return <ShellNotFound homeHref={HOME_HREF} />
}
