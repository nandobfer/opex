import { Context, Service, type Fiber } from "cordis"

/**
 * Único ponto do Opex que conhece o Cordis (OPE-172). O 4.x ainda é release candidate (versão fixada
 * no package.json): se a API mudar, só este arquivo muda.
 *
 * Conceitos usados: `Context` (raiz do kernel), `Service` (serviços do núcleo; `this.ctx` é o
 * contexto de QUEM chamou, então o registro pertence à fiber do plugin), `ctx.use(component)` (uma
 * fiber por ativação) e `fiber.effect(...)` (efeito desfeito no `dispose` da fiber).
 */

export { Context, Service }
export type { Fiber }

export function createRootContext(): Context {
    return new Context()
}

export interface PluginComponent {
    name?: string
    inject?: string[] | Record<string, unknown>
    apply: (ctx: Context, config: unknown) => unknown
}

/** Ativa um componente numa fiber nova, filha da raiz; rejeita se a ativação falhar. */
export async function useComponent(root: Context, component: PluginComponent): Promise<Fiber> {
    const fiber = root.use(component as never, {} as never)
    await fiber
    return fiber
}

/** Fiber do contexto. */
export const fiberOf = (ctx: Context): Fiber => ctx.fiber

/** Sobe na árvore de fibers (fiber → contexto pai → fiber do pai). */
export function parentFiber(fiber: Fiber): Fiber | null {
    const parent = fiber.parent as Context | undefined
    const next = parent?.fiber
    return next && next !== fiber ? next : null
}

/** Cria um efeito na fiber do contexto: `setup` registra e devolve a função que desfaz. */
export function fiberEffect(ctx: Context, label: string, setup: () => () => void): void {
    ctx.fiber.effect(() => setup(), label)
}

export const effectLabels = (fiber: Fiber): string[] => fiber.getEffects().map((effect) => effect.label)
