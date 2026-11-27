"use client"

import { Suspense } from "react"
import { IntegrationsCentral } from "@nandobfer/integracoes/react"

/** Página da central (a lista, a página de cada integração e as páginas próprias dos adaptadores). */
export function IntegrationsCentralPage({ slug }: { slug: string[] }) {
    return (
        <Suspense>
            <IntegrationsCentral slug={slug} />
        </Suspense>
    )
}
