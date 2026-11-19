import type { PluginManifest } from "../../manifest"
import type { PluginOwner } from "./registries"
import { parentFiber, type Context, type Fiber } from "./cordis"

/**
 * Identidade da fiber de cada plugin ativado (OPE-172). O loader marca a fiber raiz da ativação; os
 * serviços sobem a árvore a partir do contexto de quem chamou (um plugin pode criar sub-fibers com
 * `ctx.use`) para saber a que plugin, canal e versão o registro pertence.
 */

export interface PluginFiberMeta extends PluginOwner {
    manifest: PluginManifest
}

const KEY = "__opexPluginFiberMeta"
type GlobalWithMeta = typeof globalThis & { [KEY]?: WeakMap<Fiber, PluginFiberMeta> }

function metaMap(): WeakMap<Fiber, PluginFiberMeta> {
    const g = globalThis as GlobalWithMeta
    g[KEY] ??= new WeakMap()
    return g[KEY]
}

export function markPluginFiber(fiber: Fiber, meta: PluginFiberMeta): void {
    metaMap().set(fiber, meta)
}

export function pluginMetaOf(ctx: Context): PluginFiberMeta | null {
    let fiber: Fiber | null = ctx.fiber
    const map = metaMap()
    for (let depth = 0; fiber && depth < 50; depth++) {
        const meta = map.get(fiber)
        if (meta) return meta
        fiber = parentFiber(fiber)
    }
    return null
}

/** Identidade obrigatória: serviço chamado fora de um plugin é erro de uso. */
export function requirePluginMeta(ctx: Context, service: string): PluginFiberMeta {
    const meta = pluginMetaOf(ctx)
    if (!meta) throw new Error(`O serviço "${service}" só pode ser usado dentro de um plugin`)
    return meta
}
