/**
 * Instrumentation do Next.js — executa uma vez quando o servidor inicia.
 *
 * O app roda só em processo Node persistente (local ou Docker, `output: "standalone"`): inicia o
 * agendador interno das rotinas (Integrações › Crons) com tick a cada minuto. A rota
 * `/api/routines/scheduler-tick` executa o MESMO motor sob demanda.
 */
export async function register() {
    if (process.env.NEXT_RUNTIME !== "nodejs") return

    const { startCronScheduler } = await import("@/features/integrations/scheduler/cron-scheduler")
    startCronScheduler()
}
