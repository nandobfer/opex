/**
 * Tempo relativo no passado em pt-BR (módulo puro): "há 3 dias", "há 2 semanas", "há 4 meses". O
 * `formatDistance` do date-fns não fala em semanas, por isso a regra fica aqui.
 */
export function formatRelativePast(date: Date | string | number, now: Date | number = Date.now()): string {
    const diff = Math.max(0, new Date(now).getTime() - new Date(date).getTime())
    const minutes = Math.floor(diff / 60_000)
    const hours = Math.floor(diff / 3_600_000)
    const days = Math.floor(diff / 86_400_000)
    const unit = (value: number, one: string, many: string) => `há ${value} ${value === 1 ? one : many}`
    if (minutes < 1) return "agora há pouco"
    if (minutes < 60) return unit(minutes, "minuto", "minutos")
    if (hours < 24) return unit(hours, "hora", "horas")
    if (days < 14) return unit(days, "dia", "dias")
    if (days < 60) return unit(Math.floor(days / 7), "semana", "semanas")
    if (days < 365) return unit(Math.floor(days / 30), "mês", "meses")
    return unit(Math.floor(days / 365), "ano", "anos")
}
