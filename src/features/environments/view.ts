import type { OptionTabsOption } from "@/components/ui/option-tabs"
import { MACHINE_LABELS, MACHINES, type EnvironmentInput, type Machine } from "./schemas"
import type { DeployKind, EnvironmentDto } from "./types"

/** Regras de tela (puras) do módulo Ambientes. */

/** Grupos da lista: onde o ambiente executa (ou vai executar). */
export function groupByMachine(items: EnvironmentDto[]): Record<Machine, EnvironmentDto[]> {
    const groups: Record<Machine, EnvironmentDto[]> = { server: [], pc: [] }
    for (const env of items) groups[env.deployedOn?.runOn ?? env.runOn].push(env)
    return groups
}

export type EnvironmentHealth = "running" | "partial" | "stopped" | "never"

export function healthOf(env: Pick<EnvironmentDto, "services" | "deployedOn">): EnvironmentHealth {
    if (!env.deployedOn && !env.services.length) return "never"
    const running = env.services.filter((service) => service.state === "running").length
    if (!running) return "stopped"
    return running === env.services.length ? "running" : "partial"
}

export const HEALTH_LABELS: Record<EnvironmentHealth, string> = { running: "No ar", partial: "Parcial", stopped: "Parado", never: "Nunca implantado" }

/** Opções de máquina com o PC desabilitado (e o motivo) quando o túnel está fechado. */
export function machineOptions(pcAvailable: boolean, pcReason: string | null): OptionTabsOption<Machine>[] {
    return MACHINES.map((machine) => ({ value: machine, label: MACHINE_LABELS[machine], disabled: machine === "pc" && !pcAvailable, title: machine === "pc" && !pcAvailable ? (pcReason ?? "PC indisponível") : MACHINE_LABELS[machine] }))
}

/** Valores do formulário a partir de um ambiente salvo (variáveis com valor vazio = mantém). */
export function formValuesOf(env: EnvironmentDto | null, defaults: { centralId: string; projectName: string }): EnvironmentInput {
    if (!env)
        return {
            name: "",
            slug: "",
            source: { kind: "central", centralId: defaults.centralId, ref: "main", composeFile: "docker-compose.yml", services: [], projectName: defaults.projectName },
            env: [],
            ports: [],
            healthUrl: "",
            buildOn: "server",
            runOn: "server",
        }
    return { name: env.name, slug: env.slug, source: env.source, env: env.envKeys.map((key) => ({ key, value: "" })), ports: env.ports, healthUrl: env.healthUrl ?? "", buildOn: env.buildOn, runOn: env.runOn }
}

/** Slug sugerido a partir do nome. */
export function slugify(name: string): string {
    return name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40)
}

/** "Build no PC → execução no servidor". */
export function placementLabel(buildOn: Machine, runOn: Machine): string {
    return buildOn === runOn ? `Build e execução no ${MACHINE_LABELS[runOn].toLowerCase()}` : `Build no ${MACHINE_LABELS[buildOn].toLowerCase()} → execução no ${MACHINE_LABELS[runOn].toLowerCase()}`
}

/** "45 s", "3 min 12 s", "1 h 05 min". */
export function formatDuration(ms: number): string {
    const seconds = Math.max(0, Math.round(ms / 1000))
    if (seconds < 60) return `${seconds} s`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes} min ${String(seconds % 60).padStart(2, "0")} s`
    return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`
}

/**
 * Versão do app no ambiente: a dos containers no ar (lida do `package.json` de cada um; por serviço
 * quando diferem) ou, sem ela, a do código do último deploy (`live: false`).
 */
/** Versão em execução (uma ou por serviço) ou a implantada; serve à lista do dono e ao portal. */
export function versionLabel(env: { services: readonly { service: string; state: string; version: string | null }[]; deployedVersion: string | null }): { text: string; live: boolean } | null {
    const running = env.services.filter((service) => service.state === "running" && service.version)
    const versions = [...new Set(running.map((service) => service.version!))]
    if (versions.length === 1) return { text: `v${versions[0]}`, live: true }
    if (versions.length > 1) return { text: running.map((service) => `${service.service} v${service.version}`).join(" · "), live: true }
    return env.deployedVersion ? { text: `v${env.deployedVersion}`, live: false } : null
}

export const DEPLOY_KIND_LABELS: Record<DeployKind, string> = { deploy: "Deploy", move: "Mover", delete: "Apagar" }

/** Aviso do mover: volumes não migram; a mesma porta derruba antes (tempo fora do ar). */
export function moveWarning(env: Pick<EnvironmentDto, "deployedOn" | "ports">, runOn: Machine): string | null {
    if (!env.deployedOn || env.deployedOn.runOn === runOn) return null
    const volumes = "Os volumes não migram: os dados do destino começam vazios."
    return env.ports.length ? `Com as mesmas portas, o ambiente é derrubado na origem antes de subir no destino (fica fora do ar durante o deploy). ${volumes}` : `Sobe no destino, espera a saúde e só então derruba a origem. ${volumes}`
}
