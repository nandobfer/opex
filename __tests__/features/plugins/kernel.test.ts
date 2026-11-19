import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Kernel de plugins (OPE-172) com o Cordis e o Rolldown reais: a versão é compilada, importada e
 * ativada numa fiber; o que ela registra (ferramentas, rotas, crons) sai sozinho no dispose; a
 * recarga é transacional e o manifesto é o contrato (registro não declarado falha a ativação).
 */

const holder = vi.hoisted(() => ({ preview: false, events: [] as unknown[] }))

vi.mock('@/lib/instance', () => ({ isPreviewInstance: () => holder.preview, INSTANCE_ID: 'test' }))
vi.mock('@/lib/logger', () => ({ loggerFor: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) }))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: async (event: string, payload: unknown) => void holder.events.push({ event, payload }) }))

import { activatePluginServer, deactivatePluginServer, inspectPluginRuntime, resetPluginKernelForTests } from '@/features/plugins/server/kernel/kernel'
import { findPluginRoute, pluginToolList } from '@/features/plugins/server/kernel/registries'
import { compilePluginSources } from '@/features/plugins/server/compiler/rolldown'
import { parsePluginManifest } from '@/features/plugins/manifest'

const MANIFEST = { id: 'relogio', name: 'Relógio', apiVersion: '1.0', scope: 'owner', entries: { server: 'server/index.ts' }, routes: [{ method: 'GET', path: '/hora/:fuso' }], tools: ['hora'], crons: ['tique'], services: ['tools', 'routes', 'cron', 'sdk'] }

async function build(server: string, manifest: Record<string, unknown> = MANIFEST) {
  const files = [
    { path: 'plugin.json', content: JSON.stringify(manifest) },
    { path: 'server/index.ts', content: server },
    { path: 'server/util.ts', content: 'export const prefixo = (v: string): string => `hora:${v}`\n' },
  ]
  const parsed = parsePluginManifest(files)
  if (!parsed.ok) throw new Error(parsed.issues.join('; '))
  const compiled = await compilePluginSources(files, parsed.manifest)
  if (!compiled.ok) throw new Error(compiled.errors.join('; '))
  return { manifest: parsed.manifest, artifact: compiled.server! }
}

const SERVER = (label: string, extra = '') => `
import { definePlugin } from "@opex/plugin-sdk/server"
import { prefixo } from "./util"
export default definePlugin({
  inject: ["tools", "routes", "cron", "sdk"],
  apply(ctx) {
    const { z } = ctx.sdk
    ctx.tools.register({ name: "hora", label: "${label}", description: "Hora", risk: "read", input: z.object({}), execute: async () => ({ v: "${label}" }) })
    ctx.routes.get("/hora/:fuso", ({ params }) => ({ texto: prefixo(params.fuso), versao: "${label}" }))
    ctx.cron.schedule("tique", { type: "interval", minutes: 5 }, () => undefined)
    ${extra}
  },
})
`

beforeEach(async () => {
  holder.preview = false
  await resetPluginKernelForTests()
})
afterEach(async () => {
  await resetPluginKernelForTests()
})

describe('ativação da stable', () => {
  it('compila com Rolldown, ativa no Cordis e registra ferramenta, rota e cron', async () => {
    const v1 = await build(SERVER('v1'))
    expect(await activatePluginServer({ pluginId: 'relogio', channel: 'stable', versionId: 'v1', ...v1 })).toMatchObject({ ok: true })

    const tool = pluginToolList().find((item) => item.name === 'plugin_relogio_hora')
    expect(tool?.group).toBe('plugin-tools')
    expect(await tool!.execute({}, { actorId: 'local', sessionId: '' } as never)).toEqual({ v: 'v1' })
    const route = findPluginRoute('relogio', 'GET', '/hora/utc', 'stable')
    expect(await route!.entry.handler({ req: new Request('http://x'), params: route!.params, path: '/hora/utc' })).toEqual({ texto: 'hora:utc', versao: 'v1' })
    const snapshot = await inspectPluginRuntime()
    expect(snapshot.crons).toEqual([expect.objectContaining({ pluginId: 'relogio', name: 'tique', scheduled: true })])
  }, 30_000)
})

describe('recarga transacional e dispose sem resíduo', () => {
  it('a versão nova substitui a antiga; a falha mantém a anterior; desativar limpa tudo', async () => {
    const v1 = await build(SERVER('v1'))
    await activatePluginServer({ pluginId: 'relogio', channel: 'stable', versionId: 'v1', ...v1 })

    const v2 = await build(SERVER('v2'))
    await activatePluginServer({ pluginId: 'relogio', channel: 'stable', versionId: 'v2', ...v2 })
    expect(pluginToolList().filter((item) => item.name === 'plugin_relogio_hora').map((item) => item.label)).toEqual(['v2'])

    const broken = await build(SERVER('v3', 'throw new Error("quebrou")'))
    const result = await activatePluginServer({ pluginId: 'relogio', channel: 'stable', versionId: 'v3', ...broken })
    expect(result).toEqual({ ok: false, error: expect.stringContaining('quebrou') })
    expect(pluginToolList().map((item) => item.label)).toEqual(['v2'])

    await deactivatePluginServer('relogio')
    expect(pluginToolList()).toEqual([])
    expect(findPluginRoute('relogio', 'GET', '/hora/utc', 'stable')).toBeNull()
    expect((await inspectPluginRuntime()).crons).toEqual([])
  }, 60_000)

  it('registro fora do manifesto falha a ativação e não deixa nada registrado', async () => {
    const undeclared = await build(SERVER('v1', 'ctx.tools.register({ name: "extra", label: "x", description: "x", input: z.object({}), execute: () => 1 })'))
    const result = await activatePluginServer({ pluginId: 'relogio', channel: 'stable', versionId: 'v1', ...undeclared })
    expect(result).toEqual({ ok: false, error: expect.stringContaining('extra') })
    expect(pluginToolList()).toEqual([])
  }, 30_000)
})

describe('prévia', () => {
  it('a fiber de prévia só vale para quem tem a prévia ligada e o cron dela não agenda', async () => {
    await activatePluginServer({ pluginId: 'relogio', channel: 'stable', versionId: 'v1', ...(await build(SERVER('v1'))) })
    await activatePluginServer({ pluginId: 'relogio', channel: 'preview', versionId: 'v2', ...(await build(SERVER('v2'))) })
    expect(pluginToolList().map((item) => item.label)).toEqual(['v1'])
    expect(pluginToolList(new Set(['relogio'])).map((item) => item.label)).toEqual(['v2'])
    const crons = (await inspectPluginRuntime()).crons
    expect(crons).toEqual(expect.arrayContaining([expect.objectContaining({ channel: 'preview', scheduled: false }), expect.objectContaining({ channel: 'stable', scheduled: true })]))
  }, 60_000)

  it('numa instância de prévia do app o código de servidor dos plugins não é ativado', async () => {
    holder.preview = true
    await resetPluginKernelForTests()
    const result = await activatePluginServer({ pluginId: 'relogio', channel: 'stable', versionId: 'v1', ...(await build(SERVER('v1'))) })
    expect(result).toEqual({ ok: true, skipped: 'preview-instance' })
    expect(pluginToolList()).toEqual([])
  }, 30_000)
})
