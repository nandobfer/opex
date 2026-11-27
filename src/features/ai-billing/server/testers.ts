import { addDays } from "@/lib/fx/ptax-parse"
import { describeFetchError, fail, type IntegrationTester } from "@/features/integrations/testers/types"
import { brasiliaDateKey } from "../money"

/** Testes de conexão das integrações de custo de IA (OPE-203): PTAX do Banco Central e catálogo do models.dev. */

export const testFxPtax: IntegrationTester = async ({ emit, signal }) => {
    const { fetchPtaxPeriod } = await import("./fx")
    const today = brasiliaDateKey(new Date())
    const from = addDays(today, -10)
    emit("step", `Lendo a PTAX de ${from} a ${today} (CotacaoDolarPeriodo)`)
    let quotes
    try {
        quotes = await fetchPtaxPeriod(from, today, signal)
    } catch (error) {
        fail(`Não foi possível ler a PTAX: ${describeFetchError(error)}`)
    }
    const last = quotes[quotes.length - 1]
    if (!last) fail("O serviço PTAX não devolveu cotação nos últimos 10 dias")
    emit("success", `${quotes.length} cotação(ões); última: R$ ${last.usdBrl.toLocaleString("pt-BR", { minimumFractionDigits: 4 })} em ${last.date}`)
    return `PTAX disponível (última em ${last.date})`
}

export const testModelsDev: IntegrationTester = async ({ emit, signal }) => {
    const { loadModelsDevCatalog } = await import("@/lib/ai/pricing/server")
    emit("step", "Lendo o catálogo de preços do models.dev")
    const copy = await loadModelsDevCatalog(signal, { fresh: true }).catch((error: unknown) => fail(`Não foi possível ler o models.dev: ${describeFetchError(error)}`))
    if (!copy) fail("O models.dev não respondeu e não há cópia anterior do catálogo")
    const counts = Object.entries(copy.data).map(([provider, models]) => `${provider}: ${Object.keys(models ?? {}).length}`)
    emit("success", `Modelos com preço — ${counts.join(" · ")}`)
    const ageMs = Date.now() - Date.parse(copy.at)
    if (ageMs > 60_000) fail(`O models.dev não respondeu agora; vale a cópia de ${copy.at}`)
    return `Catálogo de preços disponível (${counts.join(", ")})`
}
