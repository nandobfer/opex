import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listResources: vi.fn(),
  getResource: vi.fn(),
  createResource: vi.fn(async () => ({ id: 'novo', backupId: 'b1', restartRequired: false })),
  updateResource: vi.fn(async () => ({ id: 'x', backupId: 'b2', restartRequired: false })),
  setMcpSecretsById: vi.fn(async () => ({ id: 'x', backupId: 'b3', restartRequired: false })),
  updateResources: vi.fn(async () => ({ updated: [], backupId: null, restartRequired: false })),
  runServiceAction: vi.fn(async (action: string) => ({ id: 'op', action, status: action === 'upgrade' ? 'running' : 'succeeded' })),
  restoreBackup: vi.fn(async () => ({})),
}))

vi.mock('ai', () => ({ dynamicTool: (def: unknown) => def }))
vi.mock('@/features/opencode-resources/server/service', () => ({
  listResources: mocks.listResources,
  getResource: mocks.getResource,
  createResource: mocks.createResource,
  updateResource: mocks.updateResource,
  setMcpSecretsById: mocks.setMcpSecretsById,
  updateResources: mocks.updateResources,
  listOpencodeScopes: vi.fn(),
  deleteResource: vi.fn(),
  setResourceEnabled: vi.fn(),
  installResource: vi.fn(),
  checkResourceUpdates: vi.fn(),
  testMcpById: vi.fn(),
}))
vi.mock('@/features/opencode-resources/server/backups', () => ({ listBackups: vi.fn(), restoreBackup: mocks.restoreBackup }))
vi.mock('@/features/opencode-service/server/service', () => ({ runServiceAction: mocks.runServiceAction, getServiceStatus: vi.fn(), getServiceLogs: vi.fn(), getOperation: vi.fn(), getLatestOperation: vi.fn() }))

import { findOpexTool, needsConfirmation, OPEX_TOOLS } from '@/features/opex-agent/server/tools/registry'
import { opexClientToolsFor } from '@/features/opex-agent/client-tools'

const ctx = { sessionId: 's1', actorId: 'local' }
const run = (name: string, input: unknown) => {
  const tool = findOpexTool(name)!
  return tool.execute(tool.input.parse(input), ctx)
}

beforeEach(() => vi.clearAllMocks())

describe('ferramentas do Agente Opex para o OpenCode', () => {
  it('riscos: destrutivas e as que pedem confirmação por padrão', () => {
    const risk = (name: string) => findOpexTool(name)!.risk
    for (const name of ['stop_opencode_service', 'restart_opencode_service', 'upgrade_opencode', 'restore_opencode_backup', 'delete_opencode_resource', 'set_opencode_mcp_secrets']) expect({ name, risk: risk(name) }).toEqual({ name, risk: 'destructive' })
    for (const name of ['install_opencode_resource', 'update_opencode_resources', 'set_opencode_resource_enabled']) expect(needsConfirmation(findOpexTool(name)!)).toBe(true)
    for (const name of ['get_opencode_service_status', 'list_opencode_resources', 'get_opencode_resource', 'check_opencode_updates']) expect(risk(name)).toBe('read')
    expect(OPEX_TOOLS.filter((tool) => tool.group === 'opencode-service' || tool.group === 'opencode-resources')).toHaveLength(21)
  })

  it('não entram no catálogo do portal do cliente', () => {
    expect(opexClientToolsFor(true).some((tool) => /opencode/.test(tool.name))).toBe(false)
  })

  it('chamam o serviço real com o ator do agente e a sessão (aviso no fim da atualização)', async () => {
    await run('restart_opencode_service', {})
    expect(mocks.runServiceAction).toHaveBeenCalledWith('restart', {}, { id: 'local', origin: 'opex-agent', opexSessionId: 's1' })
    const result = (await run('upgrade_opencode', { allowMajor: true, version: '3.0.0' })) as { nota: string }
    expect(mocks.runServiceAction).toHaveBeenLastCalledWith('upgrade', { allowMajor: true, version: '3.0.0' }, expect.objectContaining({ origin: 'opex-agent' }))
    expect(result.nota).toMatch(/automaticamente/)
  })

  it('cria com frontmatterJson e valida o mcpJson', async () => {
    await run('create_opencode_resource', { kind: 'skill', scope: 'global', name: 'minha', frontmatterJson: '{"description":"Use quando"}', body: 'faça' })
    expect(mocks.createResource).toHaveBeenCalledWith({ kind: 'skill', scope: 'global', name: 'minha', frontmatter: { description: 'Use quando' }, body: 'faça' }, { id: 'local', origin: 'opex-agent' })
    await expect(run('create_opencode_resource', { kind: 'mcp', scope: 'global', name: 'm', mcpJson: '{"type":"local","command":[]}' })).rejects.toThrow(/mcpJson inválido/)
    await expect(run('create_opencode_resource', { kind: 'agent', scope: 'global', name: 'a', frontmatterJson: '[1]' })).rejects.toThrow(/objeto JSON/)
  })

  it('instalar usa o schema da rota: origem com espaço ou começando por "-" é recusada (F6)', () => {
    const tool = findOpexTool('install_opencode_resource')!
    expect(tool.input.safeParse({ kind: 'mcp', scope: 'global', source: '--registry=http://x' }).success).toBe(false)
    expect(tool.input.safeParse({ kind: 'skill', scope: 'global', source: 'dono/repo extra' }).success).toBe(false)
    expect(tool.input.safeParse({ kind: 'plugin', scope: 'global', source: '@escopo/pkg@1.0.0' }).success).toBe(true)
  })

  it('editar MCP mantém os segredos atuais (só os nomes vão na lista)', async () => {
    mocks.getResource.mockResolvedValue({ format: 'mcp', mcp: { type: 'local', command: ['x'], url: null, cwd: null, disabled: false, environmentKeys: ['TOKEN'], headerKeys: [] } })
    await run('update_opencode_resource', { id: 'x', mcpJson: '{"type":"local","command":["y"]}' })
    expect(mocks.updateResource).toHaveBeenCalledWith('x', { mcp: { type: 'local', command: ['y'] }, secrets: { environment: [{ key: 'TOKEN' }], headers: [] } }, expect.anything())
  })

  it('editar skill sem body mantém o corpo atual', async () => {
    mocks.getResource.mockResolvedValue({ format: 'markdown', frontmatter: { description: 'a' }, body: 'corpo atual' })
    await run('update_opencode_resource', { id: 'x', frontmatterJson: '{"description":"b"}' })
    expect(mocks.updateResource).toHaveBeenCalledWith('x', { frontmatter: { description: 'b' }, body: 'corpo atual' }, expect.anything())
  })

  it('segredos de MCP saem do histórico e dos cards (redact)', () => {
    const tool = findOpexTool('set_opencode_mcp_secrets')!
    const input = tool.input.parse({ id: 'x', environment: [{ key: 'SENHA', value: 's3gr3do' }, { key: 'VELHA', value: null }] })
    expect(JSON.stringify(tool.redact!(input))).not.toContain('s3gr3do')
    expect(tool.summarize!(input)).toContain('SENHA')
    expect(tool.summarize!(input)).not.toContain('s3gr3do')
  })

  it('a listagem filtra por nome e situação e não expõe o caminho no host', async () => {
    mocks.listResources.mockResolvedValue([
      { id: '1', name: 'alfa', description: null, scopeLabel: 'Global', origin: 'file', source: null, path: '/home/u/a', enabled: true, builtin: false, editable: true, version: null, tags: [] },
      { id: '2', name: 'beta', description: null, scopeLabel: 'Global', origin: 'package', source: 'p', path: null, enabled: false, builtin: false, editable: false, version: { installed: '1', available: '2', outdated: true }, tags: [] },
    ])
    const out = (await run('list_opencode_resources', { kind: 'plugin', status: 'outdated' })) as { nome: string }[]
    expect(out.map((item) => item.nome)).toEqual(['beta'])
    expect(JSON.stringify(await run('list_opencode_resources', { kind: 'skill', query: 'alf' }))).not.toContain('/home/u')
  })
})
