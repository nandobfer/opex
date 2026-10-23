import { beforeEach, describe, expect, it, vi } from 'vitest'

const host = vi.hoisted(() => ({
  settings: { allowedDirectories: [] as string[], maxTimeoutSeconds: 300 },
  directory: '/srv/opencode' as string | undefined,
  recordAudit: vi.fn(async () => {}),
  shell: {
    create: vi.fn(async (_input: unknown, _options?: unknown) => ({ data: { id: 'sh1', status: 'running', cwd: '/srv/opencode', time: { started: 1 } } as Record<string, unknown> })),
    get: vi.fn(async (_input: unknown, _options?: unknown) => ({ data: { id: 'sh1', status: 'exited', exit: 0, cwd: '/srv/opencode', time: { started: 1, completed: 2 } } as Record<string, unknown> })),
    output: vi.fn(async (_input: { cursor?: number }, _options?: unknown) => ({ data: { output: 'ok\n', cursor: 3, size: 3, truncated: false } })),
    remove: vi.fn(async (_input: unknown) => undefined),
  },
}))

vi.mock('@/lib/ai/opencode-client', () => ({ getOpencodeClient: async () => ({ shell: host.shell }) }))
vi.mock('@/lib/ai/opencode', async (original) => ({ ...(await original<object>()), getOpencodeConnection: async () => ({ baseUrl: 'http://oc', headers: {}, directory: host.directory }) }))
vi.mock('@/lib/db', async (original) => ({ ...(await original<object>()), recordAudit: host.recordAudit }))
vi.mock('@/features/opex-agent/server/settings', async (original) => ({
  ...(await original<object>()),
  loadOpexSettings: async () => ({ settings: { host: host.settings }, isDefault: false, updatedAt: null }),
}))

import { isHostDirectoryAllowed, normalizeHostDirectories, normalizeHostDirectory, resolveHostDirectory } from '@/features/opex-agent/host-terminal'
import { opexAgentSettingsSchema, DEFAULT_OPEX_AGENT_SETTINGS } from '@/features/opex-agent/schemas'
import { withDefaults } from '@/features/opex-agent/server/settings'
import { findOpexTool, needsConfirmation } from '@/features/opex-agent/server/tools/registry'

const context = { sessionId: 's1', actorId: 'local' }
const run = (input: unknown) => {
  const tool = findOpexTool('run_host_command')!
  return tool.execute(tool.input.parse(input), context) as Promise<Record<string, unknown>>
}

beforeEach(() => {
  host.settings = { allowedDirectories: [], maxTimeoutSeconds: 300 }
  host.directory = '/srv/opencode'
  vi.clearAllMocks()
})

describe('diretórios do terminal do host', () => {
  it('normaliza caminhos e confere permitidos (subdiretórios valem; prefixo parcial não)', () => {
    expect(normalizeHostDirectory('/home/u/proj/../app/./')).toBe('/home/u/app')
    expect(normalizeHostDirectory('/')).toBe('/')
    expect(isHostDirectoryAllowed('/home/u/app/src', ['/home/u/app'])).toBe(true)
    expect(isHostDirectoryAllowed('/home/u/app', ['/home/u/app/'])).toBe(true)
    expect(isHostDirectoryAllowed('/home/u/app-2', ['/home/u/app'])).toBe(false)
    expect(isHostDirectoryAllowed('/home/u/app/../outro', ['/home/u/app'])).toBe(false)
    expect(isHostDirectoryAllowed('/qualquer', [])).toBe(true)
    expect(normalizeHostDirectories(['/a/', '/a', '/b'])).toEqual(['/a', '/b'])
  })

  it('resolve o diretório: pedido, primeiro permitido ou o do OpenCode; recusa relativo e fora da lista', () => {
    expect(resolveHostDirectory('/x/y', [], '/srv')).toEqual({ ok: true, directory: '/x/y' })
    expect(resolveHostDirectory(undefined, ['/p1', '/p2'], '/srv')).toEqual({ ok: true, directory: '/p1' })
    expect(resolveHostDirectory(undefined, [], '/srv')).toEqual({ ok: true, directory: '/srv' })
    expect(resolveHostDirectory(undefined, [], null)).toEqual({ ok: true, directory: null })
    expect(resolveHostDirectory('proj', [], null).ok).toBe(false)
    expect(resolveHostDirectory('/etc', ['/home/u'], null)).toMatchObject({ ok: false })
  })

  it('configuração: padrão livre, caminho relativo inválido e configuração antiga recebe o padrão', () => {
    expect(DEFAULT_OPEX_AGENT_SETTINGS.host.allowedDirectories).toEqual([])
    const invalid = opexAgentSettingsSchema.safeParse({ ...DEFAULT_OPEX_AGENT_SETTINGS, host: { allowedDirectories: ['relativo'], maxTimeoutSeconds: 60 } })
    expect(invalid.success).toBe(false)
    const { host: _host, ...legacy } = DEFAULT_OPEX_AGENT_SETTINGS
    void _host
    expect(opexAgentSettingsSchema.parse(withDefaults(legacy)).host).toEqual(DEFAULT_OPEX_AGENT_SETTINGS.host)
  })
})

describe('ferramenta run_host_command', () => {
  it('pede confirmação por padrão, ajustável pela configuração', () => {
    const tool = findOpexTool('run_host_command')!
    expect(tool.group).toBe('host')
    expect(needsConfirmation(tool)).toBe(true)
    expect(needsConfirmation(tool, { run_host_command: false })).toBe(false)
  })

  it('executa no shell do OpenCode, devolve a saída, remove o shell e audita', async () => {
    const result = await run({ command: 'git status', directory: '/home/u/app' })
    expect(host.shell.create).toHaveBeenCalledWith({ location: { directory: '/home/u/app' }, command: 'git status', timeout: 60_000 }, expect.anything())
    expect(result).toMatchObject({ status: 'exited', exitCode: 0, output: 'ok', truncated: false })
    expect(host.shell.remove).toHaveBeenCalledWith({ id: 'sh1', location: { directory: '/home/u/app' } })
    expect(host.recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entidade: 'TerminalHost', depois: expect.objectContaining({ comando: 'git status', codigoSaida: 0 }) }))
  })

  it('sem diretório: usa o primeiro permitido; limita o tempo ao máximo configurado', async () => {
    host.settings = { allowedDirectories: ['/home/u/app'], maxTimeoutSeconds: 10 }
    await run({ command: 'ls', timeoutSeconds: 600 })
    expect(host.shell.create).toHaveBeenCalledWith(expect.objectContaining({ location: { directory: '/home/u/app' }, timeout: 10_000 }), expect.anything())
  })

  it('recusa diretório fora dos permitidos sem executar', async () => {
    host.settings = { allowedDirectories: ['/home/u/app'], maxTimeoutSeconds: 60 }
    await expect(run({ command: 'rm -rf x', directory: '/etc' })).rejects.toThrow(/não está entre os permitidos/)
    expect(host.shell.create).not.toHaveBeenCalled()
  })

  it('saída acima do limite: devolve o fim e avisa', async () => {
    host.shell.output.mockImplementation(async (input: { cursor?: number }) =>
      input.cursor === undefined ? { data: { output: 'começo', cursor: 20_000, size: 50_000, truncated: true } } : { data: { output: 'fim', cursor: 50_000, size: 50_000, truncated: false } },
    )
    const result = await run({ command: 'cat grande.log' })
    expect(host.shell.output).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 30_000 }), expect.anything())
    expect(result).toMatchObject({ output: 'fim', truncated: true, outputSize: 50_000 })
    expect(result.outputNote).toBeTruthy()
  })
})
