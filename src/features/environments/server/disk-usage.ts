import type { HostRunner } from "@/features/local-docker/server/shell"
import { diskUsageCommand, parseDiskUsage, type ContainerDisk } from "../commands"
import type { Machine } from "../schemas"
import { envLog as log, publishEnvironment } from "./settings"

/** Validade da leitura do disco dos containers (`docker ps --size` e `system df -v` são lentos). */
export const DISK_USAGE_TTL_MS = 5 * 60_000

interface DiskEntry {
    /** Última leitura bem-sucedida (0 = nenhuma). */
    at: number
    /** Última tentativa (com sucesso ou não): a validade conta daqui, para uma falha não repetir a cada leitura. */
    triedAt: number
    values: Map<string, ContainerDisk>
    pending: Promise<void> | null
}

/** Cache por máquina, no processo (sobrevive ao HMR do dev). */
const KEY = Symbol.for("opex.environments.disk-usage")
const store = globalThis as unknown as Record<symbol, Map<Machine, DiskEntry> | undefined>
const cache = () => (store[KEY] ??= new Map())

/** Esvazia o cache (testes). */
export const resetDiskUsageCache = () => cache().clear()

/**
 * Disco por nome de container na máquina, da última leitura (`null` = nunca lido). Nunca espera: com o
 * cache vencido, dispara uma leitura em segundo plano (uma por vez por máquina) e, ao terminar, avisa a
 * tela pelo evento do módulo para ela reler. Uma falha só registra no log (fica a leitura anterior).
 */
export function diskUsageFor(machine: Machine, context: string, run: HostRunner, now = Date.now()): { values: Map<string, ContainerDisk>; checkedAt: string } | null {
    const entry = cache().get(machine)
    if (!entry?.pending && (!entry || now - entry.triedAt >= DISK_USAGE_TTL_MS)) refresh(machine, context, run, entry, now)
    return entry && entry.at > 0 ? { values: entry.values, checkedAt: new Date(entry.at).toISOString() } : null
}

function refresh(machine: Machine, context: string, run: HostRunner, previous: DiskEntry | undefined, now: number): void {
    const entry: DiskEntry = previous ?? { at: 0, triedAt: 0, values: new Map(), pending: null }
    entry.triedAt = now
    cache().set(machine, entry)
    entry.pending = (async () => {
        try {
            const result = await run(diskUsageCommand(machine, context), 120_000, { retryOnLost: true, quiet: true })
            if (result.exitCode !== 0) throw new Error(`código ${result.exitCode}`)
            entry.values = parseDiskUsage(result.output)
            entry.at = Date.now()
            await publishEnvironment(null, "usage")
        } catch (error) {
            log.warn({ machine, err: error instanceof Error ? error.message : String(error) }, "[environments] Não foi possível ler o disco dos containers")
        } finally {
            entry.pending = null
        }
    })()
}

/** Espera a leitura em andamento (testes). */
export const pendingDiskUsage = (machine: Machine) => cache().get(machine)?.pending ?? null
