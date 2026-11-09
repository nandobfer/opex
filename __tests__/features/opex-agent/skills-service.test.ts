import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FakeCollection } from '../../helpers/fake-collection'

/**
 * Serviço das skills do Agente Opex (OPE-153): criar (nome único, limite técnico sem gravação parcial),
 * instalar várias skills de um repositório (D7), "Com atualização" pelo hash da pasta, atualizar
 * (sobrescreve edições; GitHub fora mantém a versão) e remover desvinculando os rotineiros (D6).
 * GitHub sempre simulado.
 */

const holder = vi.hoisted(() => ({
  skills: null as unknown as FakeCollection,
  agents: null as unknown as FakeCollection,
  audit: [] as { entidade: string; entidadeId: string; acao: string; antes?: unknown; depois?: unknown }[],
  events: [] as { event: string; payload: Record<string, unknown> }[],
  repo: {} as Record<string, unknown>,
  githubDown: false,
}))

vi.mock('@/lib/db/models/Opex', async () => {
  const { createFakeCollection } = await import('../../helpers/fake-collection')
  holder.skills = createFakeCollection(() => ({ enabled: true, extra: {}, files: [], hash: null }))
  return { OpexSkill: holder.skills }
})
vi.mock('@/lib/db/models/RoutineAgent', async () => {
  const { createFakeCollection } = await import('../../helpers/fake-collection')
  holder.agents = createFakeCollection()
  return { RoutineAgent: holder.agents }
})
vi.mock('@/lib/db', () => ({
  dbConnect: async () => {},
  recordAudit: async (entry: (typeof holder.audit)[number]) => void holder.audit.push(entry),
  AcaoAuditoria: { CRIAR: 'CRIAR', ATUALIZAR: 'ATUALIZAR', EXCLUIR: 'EXCLUIR' },
}))
vi.mock('@/lib/pusher/channels', () => ({ publishAppEvent: async (event: string, payload: Record<string, unknown>) => void holder.events.push({ event, payload }) }))
vi.mock('@/features/github/client', async (original) => {
  const actual = await original<typeof import('@/features/github/client')>()
  return {
    ...actual,
    githubGetWithPublicFallback: async (path: string) => {
      if (holder.githubDown) throw new actual.GithubError('Não foi possível conectar ao GitHub', 'UNAVAILABLE')
      if (!(path in holder.repo)) throw new actual.GithubError('Não encontrado no GitHub (ou o token não tem acesso)', 'NOT_FOUND', 404)
      return holder.repo[path]
    },
  }
})

import { DomainError } from '@/lib/api/route'
import {
  applyFileChanges,
  createOpexSkill,
  deleteOpexSkill,
  discoverOpexSkills,
  getOpexSkill,
  installOpexSkills,
  listOpexSkills,
  opexSkillUsage,
  readOpexSkillFile,
  setOpexSkillEnabled,
  updateOpexSkill,
  updateOpexSkills,
} from '@/features/opex-agent/server/skills/service'
import { clearSkillTreeCache } from '@/features/opex-agent/server/skills/github'

const b64 = (text: string) => Buffer.from(text).toString('base64')
const skillMd = (name: string, description = `Use para ${name}`, body = `Instruções de ${name}`) => `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`

function seedRepo(hashA = 'ta1', bodyA = 'Revise o diff') {
  const files: Record<string, string> = {
    'skills/revisar-pr/SKILL.md': skillMd('revisar-pr', 'Use ao revisar PR', bodyA),
    'skills/revisar-pr/references/guia.md': '# Guia',
    'skills/duplicada/SKILL.md': skillMd('existente'),
    'skills/quebrada/SKILL.md': '---\nname: quebrada\n---\nsem descrição',
  }
  const entries = [
    { path: 'skills', type: 'tree', sha: 't0' },
    { path: 'skills/revisar-pr', type: 'tree', sha: hashA },
    { path: 'skills/duplicada', type: 'tree', sha: 'td' },
    { path: 'skills/quebrada', type: 'tree', sha: 'tq' },
    ...Object.keys(files).map((path, index) => ({ path, type: 'blob', sha: `blob${index}-${hashA}` })),
  ]
  holder.repo = { '/repos/dono/skills/git/trees/HEAD?recursive=1': { sha: 'raiz', tree: entries } }
  Object.entries(files).forEach(([, content], index) => (holder.repo[`/repos/dono/skills/git/blobs/blob${index}-${hashA}`] = { content: b64(content), encoding: 'base64' }))
}

const actor = 'local'

beforeEach(() => {
  holder.skills.docs.splice(0)
  holder.agents.docs.splice(0)
  holder.audit = []
  holder.events = []
  holder.githubDown = false
  clearSkillTreeCache()
  seedRepo()
})

describe('criar com texto', () => {
  it('grava, audita sem conteúdo e publica o evento; a lista não traz o corpo', async () => {
    const created = await createOpexSkill({ name: 'resumir', description: 'Use para resumir', body: 'Resuma em 3 frases', files: [{ path: 'ref/exemplo.md', content: 'Exemplo' }] }, actor)
    expect(created).toMatchObject({ name: 'resumir', enabled: true, sourceLabel: 'Criada no Opex', version: null, body: 'Resuma em 3 frases', files: [{ path: 'ref/exemplo.md', binary: false }] })
    expect(holder.audit[0]).toMatchObject({ entidade: 'SkillOpex', acao: 'CRIAR' })
    expect(JSON.stringify(holder.audit)).not.toContain('Resuma em 3 frases')
    expect(holder.events).toEqual([{ event: 'opex-skills-updated', payload: { id: created.id, action: 'created' } }])
    const [row] = await listOpexSkills()
    expect(row).not.toHaveProperty('body')
    expect(row).toMatchObject({ fileCount: 1 })
    expect(await readOpexSkillFile(created.id, 'ref/exemplo.md')).toMatchObject({ content: 'Exemplo' })
  })

  it('nome que já existe é recusado (409)', async () => {
    await createOpexSkill({ name: 'resumir', description: 'x', body: 'y' }, actor)
    await expect(createOpexSkill({ name: 'resumir', description: 'x', body: 'y' }, actor)).rejects.toMatchObject({ status: 409, code: 'OPEX_SKILL_NAME_TAKEN' })
  })

  it('acima do limite técnico do banco: erro claro (413) e nada gravado', async () => {
    const huge = 'a'.repeat(17 * 1024 * 1024)
    await expect(createOpexSkill({ name: 'gigante', description: 'x', body: huge }, actor)).rejects.toMatchObject({ status: 413, code: 'OPEX_SKILL_TOO_LARGE' })
    expect(holder.skills.docs).toHaveLength(0)
    expect(holder.events).toEqual([])
  })

  it('editar acima do limite mantém a versão anterior', async () => {
    const created = await createOpexSkill({ name: 'resumir', description: 'x', body: 'original' }, actor)
    await expect(updateOpexSkill(created.id, { description: 'x', body: 'a'.repeat(17 * 1024 * 1024) }, actor)).rejects.toMatchObject({ code: 'OPEX_SKILL_TOO_LARGE' })
    expect((await getOpexSkill(created.id)).body).toBe('original')
  })
})

describe('instalar do GitHub (D7)', () => {
  it('descobre as skills do repositório com o motivo das que não podem ser instaladas', async () => {
    await createOpexSkill({ name: 'existente', description: 'x', body: 'y' }, actor)
    const discovery = await discoverOpexSkills('dono/skills')
    expect(discovery.repo).toBe('dono/skills')
    expect(discovery.skills).toEqual([
      { path: 'skills/duplicada', name: 'existente', description: 'Use para existente', exists: true, error: 'Já existe uma skill com o nome "existente" no Opex' },
      { path: 'skills/quebrada', name: null, description: null, exists: false, error: expect.stringContaining('description') },
      { path: 'skills/revisar-pr', name: 'revisar-pr', description: 'Use ao revisar PR', exists: false, error: null },
    ])
  })

  it('instala as marcadas; nome duplicado é recusado sem impedir as demais; resultado por skill', async () => {
    await createOpexSkill({ name: 'existente', description: 'x', body: 'y' }, actor)
    const { results } = await installOpexSkills({ source: 'https://github.com/dono/skills', paths: ['skills/revisar-pr', 'skills/duplicada'] }, actor)
    expect(results).toEqual([
      expect.objectContaining({ key: 'skills/revisar-pr', name: 'revisar-pr', ok: true }),
      expect.objectContaining({ key: 'skills/duplicada', ok: false, message: 'Já existe uma skill com o nome "existente" no Opex' }),
    ])
    const installed = await getOpexSkill(results[0]!.id!)
    expect(installed).toMatchObject({ sourceLabel: 'dono/skills/skills/revisar-pr', body: expect.stringContaining('Revise o diff'), files: [{ path: 'references/guia.md', binary: false }], enabled: true })
    expect(installed.version).toMatchObject({ installed: 'ta1', outdated: false })
  })

  it('repositório inexistente/sem acesso e repositório sem SKILL.md geram mensagens claras', async () => {
    await expect(discoverOpexSkills('dono/nao-existe')).rejects.toMatchObject({ status: 404, code: 'GITHUB_NOT_FOUND' })
    holder.repo['/repos/dono/vazio/git/trees/HEAD?recursive=1'] = { sha: 'r', tree: [{ path: 'README.md', type: 'blob', sha: 'x' }] }
    await expect(discoverOpexSkills('dono/vazio')).rejects.toMatchObject({ code: 'OPEX_SKILL_NO_SKILL_MD' })
    await expect(discoverOpexSkills('@escopo/pacote')).rejects.toBeInstanceOf(DomainError)
  })
})

describe('atualizar', () => {
  it('"Com atualização" pelo hash da pasta; Atualizar sobrescreve a edição local e mantém o switch', async () => {
    const { results } = await installOpexSkills({ source: 'dono/skills', paths: ['skills/revisar-pr'] }, actor)
    const id = results[0]!.id!
    await updateOpexSkill(id, { description: 'Use ao revisar PR', body: 'edição local' }, actor)
    await setOpexSkillEnabled(id, false, actor)
    seedRepo('ta2', 'Versão nova do repositório')
    const listed = await listOpexSkills({ refresh: true })
    expect(listed[0]!.version).toEqual({ installed: 'ta1', available: 'ta2', outdated: true })
    const updated = await updateOpexSkills({ all: true }, actor)
    expect(updated.results).toEqual([expect.objectContaining({ id, ok: true })])
    const after = await getOpexSkill(id)
    expect(after.body).toContain('Versão nova do repositório')
    expect(after.enabled).toBe(false)
    expect(after.version).toMatchObject({ installed: 'ta2' })
  })

  it('GitHub indisponível: erro claro por skill e a versão atual é mantida', async () => {
    const { results } = await installOpexSkills({ source: 'dono/skills', paths: ['skills/revisar-pr'] }, actor)
    const id = results[0]!.id!
    holder.githubDown = true
    const updated = await updateOpexSkills({ ids: [id] }, actor)
    expect(updated.results[0]).toMatchObject({ ok: false, message: expect.stringContaining('a versão atual foi mantida') })
    expect((await getOpexSkill(id)).version).toMatchObject({ installed: 'ta1' })
    // A lista não quebra sem o GitHub: a versão disponível fica "não verificada".
    clearSkillTreeCache()
    expect((await listOpexSkills())[0]!.version).toEqual({ installed: 'ta1', available: null, outdated: false })
  })

  it('skill criada no Opex não tem Atualizar', async () => {
    const created = await createOpexSkill({ name: 'local', description: 'x', body: 'y' }, actor)
    const updated = await updateOpexSkills({ ids: [created.id] }, actor)
    expect(updated.results[0]).toMatchObject({ ok: false, message: expect.stringContaining('não tem atualização') })
  })
})

describe('arquivos de apoio', () => {
  it('binário de repositório só pode ser removido', () => {
    const binary = { path: 'img.png', content: Buffer.from([0, 1]), binary: true, size: 2 }
    expect(() => applyFileChanges([binary], [{ path: 'img.png', content: 'texto' }])).toThrow(/binário/)
    expect(applyFileChanges([binary], [{ path: 'img.png', content: null }])).toEqual([])
  })
})

describe('remover/desinstalar (D6)', () => {
  it('avisa o uso e tira a skill da seleção dos rotineiros, com auditoria e evento em cada um', async () => {
    const created = await createOpexSkill({ name: 'resumir', description: 'x', body: 'y' }, actor)
    const a1 = holder.agents.insert({ name: 'Vagas', opex: { enabledSkills: ['resumir', 'outra'] } })
    const a2 = holder.agents.insert({ name: 'Notícias', opex: { enabledSkills: ['resumir'] } })
    holder.agents.insert({ name: 'Sem skill', opex: { enabledSkills: ['outra'] } })
    expect(await opexSkillUsage(created.id)).toEqual({ count: 2, agents: [{ id: String(a2._id), name: 'Notícias' }, { id: String(a1._id), name: 'Vagas' }] })
    holder.audit = []
    holder.events = []
    expect(await deleteOpexSkill(created.id, actor)).toEqual({ deleted: true, unlinked: 2 })
    expect(holder.skills.docs).toHaveLength(0)
    expect(holder.agents.docs.map((doc) => (doc.opex as { enabledSkills: string[] }).enabledSkills)).toEqual([['outra'], [], ['outra']])
    expect(holder.audit.filter((entry) => entry.entidade === 'AgenteRotineiro')).toHaveLength(2)
    expect(holder.audit.find((entry) => entry.entidade === 'SkillOpex')).toMatchObject({ acao: 'EXCLUIR', depois: { rotineirosDesvinculados: 2 } })
    expect(holder.events.filter((item) => item.event === 'routine-agent-updated').map((item) => item.payload.id)).toEqual([String(a1._id), String(a2._id)])
    expect(holder.events).toContainEqual({ event: 'opex-skills-updated', payload: { id: created.id, action: 'deleted' } })
  })
})
