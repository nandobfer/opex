import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Uso das skills pelo agente (OPE-153, item B): só as ligadas no chat do dono (e conferidas de novo ao
 * carregar), a seleção do rotineiro (ligadas ou não, D2) e "skill indisponível" sem quebrar (D6).
 */

const holder = vi.hoisted(() => ({
  skills: [] as { name: string; description: string; enabled: boolean; body: string; files: { path: string; content: Buffer; binary: boolean; size: number }[] }[],
  catalogCalls: [] as unknown[],
}))

vi.mock('@/features/opex-agent/server/skills/service', () => ({
  loadSkillCatalog: async (filter: { names?: string[]; onlyEnabled?: boolean }) => {
    holder.catalogCalls.push(filter)
    return holder.skills.filter((skill) => (!filter.names || filter.names.includes(skill.name)) && (!filter.onlyEnabled || skill.enabled)).map(({ name, description }) => ({ name, description }))
  },
  loadSkillByName: async (name: string) => holder.skills.find((skill) => skill.name === name) ?? null,
}))

import { ownerSkillsForTurn, routineSkillsForRun, skillTurnTools } from '@/features/opex-agent/server/skills/turn'
import type { OpexTool } from '@/features/opex-agent/server/tools/define'

const ctx = { sessionId: 's', actorId: 'local' }
const run = (tools: OpexTool[], name: string, input: unknown) => tools.find((tool) => tool.name === name)!.execute(input, ctx) as Promise<Record<string, unknown>>

beforeEach(() => {
  holder.catalogCalls = []
  holder.skills = [
    { name: 'ligada', description: 'Use quando X', enabled: true, body: 'Passo 1\nPasso 2', files: [{ path: 'ref/guia.md', content: Buffer.from('linha 1\nlinha 2'), binary: false, size: 15 }, { path: 'logo.png', content: Buffer.from([0, 1]), binary: true, size: 2 }] },
    { name: 'desligada', description: 'Use quando Y', enabled: false, body: 'Corpo Y', files: [] },
  ]
})

describe('Agente Opex do dono', () => {
  it('só as ligadas entram no catálogo e nas ferramentas', async () => {
    const { catalog, tools } = await ownerSkillsForTurn()
    expect(catalog).toEqual([{ name: 'ligada', description: 'Use quando X' }])
    expect(tools.map((tool) => tool.name)).toEqual(['load_opex_skill', 'read_opex_skill_file'])
    expect(tools.every((tool) => tool.risk === 'read' && tool.group === 'opex-skills')).toBe(true)
  })

  it('carrega o corpo e a lista de arquivos sob demanda; desligada não pode ser carregada', async () => {
    const { tools } = await ownerSkillsForTurn()
    expect(await run(tools, 'load_opex_skill', { name: 'ligada' })).toMatchObject({ available: true, instructions: '1: Passo 1\n2: Passo 2', truncated: false, files: [{ path: 'ref/guia.md' }, { path: 'logo.png', binary: true }] })
    expect(await run(tools, 'load_opex_skill', { name: 'desligada' })).toMatchObject({ available: false })
  })

  it('desligar no meio do turno vale na hora de carregar', async () => {
    const { tools } = await ownerSkillsForTurn()
    holder.skills[0]!.enabled = false
    expect(await run(tools, 'load_opex_skill', { name: 'ligada' })).toMatchObject({ available: false, message: expect.stringContaining('indisponível') })
  })

  it('lê arquivo de apoio em janelas; binário só com o tamanho; arquivo inexistente lista os que há', async () => {
    const { tools } = await ownerSkillsForTurn()
    expect(await run(tools, 'read_opex_skill_file', { name: 'ligada', path: 'ref/guia.md', startLine: 2 })).toMatchObject({ content: '2: linha 2', totalLines: 2 })
    expect(await run(tools, 'read_opex_skill_file', { name: 'ligada', path: 'logo.png' })).toMatchObject({ binary: true, size: 2 })
    expect(await run(tools, 'read_opex_skill_file', { name: 'ligada', path: 'nao.md' })).toMatchObject({ found: false, message: expect.stringContaining('ref/guia.md') })
  })

  it('sem skill ligada, nenhuma ferramenta', async () => {
    holder.skills.forEach((skill) => (skill.enabled = false))
    expect((await ownerSkillsForTurn()).tools).toEqual([])
  })
})

describe('agente rotineiro do motor Opex', () => {
  it('a seleção vale mesmo desligada no Agente Opex (D2); skill fora da seleção não é carregada; a que sumiu volta em missing', async () => {
    const { catalog, tools, missing } = await routineSkillsForRun(['desligada', 'apagada'])
    expect(catalog).toEqual([{ name: 'desligada', description: 'Use quando Y' }])
    expect(missing).toEqual(['apagada'])
    expect(await run(tools, 'load_opex_skill', { name: 'desligada' })).toMatchObject({ available: true })
    expect(await run(tools, 'load_opex_skill', { name: 'ligada' })).toMatchObject({ available: false })
  })

  it('skill removida durante a execução: aviso de indisponível, sem lançar erro', async () => {
    const tools = skillTurnTools({ allowed: ['ligada'], requireEnabled: false })
    holder.skills = []
    await expect(run(tools, 'load_opex_skill', { name: 'ligada' })).resolves.toMatchObject({ available: false })
  })

  it('sem seleção: nada carregado nem oferecido', async () => {
    const result = await routineSkillsForRun([])
    expect(result.tools).toEqual([])
    expect(result.catalog).toEqual([])
  })
})
