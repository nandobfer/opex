import type { EnvironmentsBuilder } from "./schemas"
import type { BuilderLimitsDto, BuilderStatus, EnvironmentsBuilderDto } from "./types"

/** Textos (puros) da linha "Builder do servidor". */

export const BUILDER_STATUS_LABELS: Record<BuilderStatus, string> = { running: "No ar", stopped: "Parado", missing: "Não existe", unmanageable: "Sem container", unknown: "Sem resposta" }

const number = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })

/** "RAM 24 GiB · swap +16 GiB · 6 CPUs" (vazio = sem limite; swap vazio = padrão do Docker). */
export function limitsText(limits: BuilderLimitsDto | Pick<EnvironmentsBuilder, "memoryGb" | "swapGb" | "cpus">): string {
    const ram = limits.memoryGb === null ? "RAM sem limite" : `RAM ${number(limits.memoryGb)} GiB`
    const swap = limits.memoryGb === null ? null : limits.swapGb === null ? "swap padrão" : limits.swapGb === 0 ? "sem swap" : `swap +${number(limits.swapGb)} GiB`
    const cpus = limits.cpus === null ? "CPU sem limite" : `${number(limits.cpus)} CPU${limits.cpus === 1 ? "" : "s"}`
    return [ram, swap, cpus].filter(Boolean).join(" · ")
}

export function usageText(usage: EnvironmentsBuilderDto["usage"]): string | null {
    if (!usage) return null
    return `CPU ${usage.cpuPercent.toFixed(1)}% · RAM ${usage.memoryUsage.split("/")[0]?.trim() ?? usage.memoryUsage}`
}

export type BuilderConfirmKind = "delete" | "stop"

/** Texto da confirmação de Apagar e de Derrubar com um build em andamento. */
export function builderConfirmText(kind: BuilderConfirmKind, builder: Pick<EnvironmentsBuilderDto, "name" | "isHostDefault" | "buildRunning">): { title: string; description: string; action: string } {
    const running = builder.buildRunning ? " Há um build em andamento: ele falha." : ""
    if (kind === "stop") return { title: `Derrubar o builder ${builder.name ?? ""}?`, description: `O builder para (o cache continua) e o próximo build o levanta de novo.${running}`, action: "Derrubar" }
    const fallback = builder.isHostDefault ? " Ele é o builder do host: até criar outro, as prévias das mesas usam o builder padrão do Docker, sem limites." : ""
    return { title: `Apagar o builder ${builder.name ?? ""}?`, description: `Remove o builder e todo o cache de build (o próximo build é sem cache).${fallback}${running}`, action: "Apagar" }
}

/** Avisos da linha (na ordem em que aparecem). */
export function builderNotices(builder: EnvironmentsBuilderDto): { tone: "warning" | "error" | "info"; text: string }[] {
    const notices: { tone: "warning" | "error" | "info"; text: string }[] = []
    if (builder.error) notices.push({ tone: "error", text: builder.error })
    if (builder.lastAction && !builder.lastAction.ok) notices.push({ tone: "error", text: builder.lastAction.message })
    if (!builder.managed && builder.status === "unmanageable")
        notices.push({ tone: "info", text: `O builder atual do host (${builder.name ?? "—"}) usa o driver ${builder.driver ?? "desconhecido"}, sem container nem limites: Gerenciar cria um builder novo do Opex.` })
    if (!builder.managed && builder.status !== "unmanageable") notices.push({ tone: "info", text: "Não gerenciado pelo Opex: Gerenciar assume este builder com os limites de hoje (nada é recriado)." })
    if (builder.managed && builder.containerMissing) notices.push({ tone: "warning", text: "O container do builder foi removido (a instância continua no buildx): Levantar usaria as opções antigas; use Recriar para aplicar os limites salvos." })
    if (builder.config && builder.limitsDiffer) notices.push({ tone: "warning", text: `Limites salvos (${limitsText(builder.config)}) diferem dos aplicados: use Recriar.` })
    if (builder.pending) notices.push({ tone: "warning", text: "Recriação com --keep-state pendente: roda quando o build em andamento terminar." })
    if (builder.unknownFlags.length) notices.push({ tone: "warning", text: `Flags do BuildKit que o Opex não recria (se perdem ao recriar): ${builder.unknownFlags.join(" ")}` })
    return notices
}
