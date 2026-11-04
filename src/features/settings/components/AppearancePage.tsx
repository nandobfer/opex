"use client"

import { CadastroHeader } from "@/components/list/CadastroHeader"
import { FavoriteColorsCard } from "./FavoriteColorsCard"

/** Configurações › Aparência (`/configuracoes/aparencia`): cores favoritas reaproveitadas pelas telas. */
export function AppearancePage() {
    return (
        <div className="flex flex-col gap-6">
            <CadastroHeader title="Aparência" description="Cores favoritas usadas pelas telas" />
            <section aria-labelledby="settings-favorite-colors" className="space-y-3">
                <h2 id="settings-favorite-colors" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Cores favoritas
                </h2>
                <FavoriteColorsCard />
            </section>
        </div>
    )
}
