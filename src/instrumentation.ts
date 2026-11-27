/**
 * Instrumentation do Next.js — executa uma vez quando o servidor inicia.
 *
 * O app roda só em processo Node persistente (local ou Docker, `output: "standalone"`): inicia o
 * agendador interno das rotinas (Integrações › Crons) com tick a cada minuto. A rota
 * `/api/routines/scheduler-tick` executa o MESMO motor sob demanda. Numa prévia do Opex
 * (`OPEX_PREVIEW=1`, OPE-147) o `startCronScheduler` não liga o tick (banco compartilhado). Depois
 * sobe o kernel de plugins (OPE-172), que numa prévia não ativa código de servidor de plugin.
 */
export async function register() {
    if (process.env.NEXT_RUNTIME !== "nodejs") return

    const { startCronScheduler } = await import("@/features/integrations/scheduler/cron-scheduler")
    startCronScheduler()

    // Kernel de plugins (OPE-172): sobe sem bloquear o boot. Ver aicontext/modules/plugins.md.
    const { startPluginKernel } = await import("@/features/plugins/server/boot")
    void startPluginKernel()

    // Engramind (OPE-206): confere a rede das memórias e revoga tokens gravados de outro app (migração A), fora da prévia.
    const { scheduleEngramindStartupCheck } = await import("@/features/engramind/server/memory-network")
    scheduleEngramindStartupCheck()
}
