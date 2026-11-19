"use client"

import { ErrorState } from "@/components/feedback/ErrorState"

/** Fronteira de erro do segmento das páginas de plugin (`error.tsx`): a falha não derruba o app. */
export function PluginRouteError({ reset }: { reset: () => void }) {
    return <ErrorState title="A página do plugin falhou" description="O plugin teve um erro ao renderizar. Tente novamente; se continuar, desative o plugin ou faça rollback." onRetry={reset} />
}
