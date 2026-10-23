import { describe, expect, it } from 'vitest'
import { DomainError } from '@/lib/api/route'
import { DEFAULT_OPEX_AGENT_SETTINGS, opexAgentSettingsSchema } from '@/features/opex-agent/schemas'
import { normalizeOpexSettings, withDefaults } from '@/features/opex-agent/server/settings'
import {
  buildOpexToolTree,
  defaultToolConfirms,
  disabledOpexToolNames,
  enabledOpexToolNames,
  migrateLegacyToolSettings,
  nextConfirmationOverrides,
  toolConfirms,
  type OpexToolMetaDto,
} from '@/features/opex-agent/tool-tree'

const tool = (name: string, group: OpexToolMetaDto['group'], risk: OpexToolMetaDto['risk']): OpexToolMetaDto => ({ name, group, label: name, description: `d ${name}`, risk, alwaysOn: group === 'context' })
const TOOLS = [
  tool('get_app_overview', 'context', 'read'),
  tool('list_tasks', 'tasks', 'read'),
  tool('create_task', 'tasks', 'write'),
  tool('delete_task', 'tasks', 'destructive'),
  tool('create_service', 'services', 'write'),
]

describe('seleção e confirmação por ferramenta', () => {
  it('padrão: só as destrutivas pedem confirmação; o ajuste vence e some quando volta ao padrão', () => {
    expect(defaultToolConfirms({ risk: 'destructive' })).toBe(true)
    expect(defaultToolConfirms({ risk: 'write' })).toBe(false)
    expect(toolConfirms(TOOLS[3]!, {})).toBe(true)
    expect(toolConfirms(TOOLS[3]!, { delete_task: false })).toBe(false)
    const on = nextConfirmationOverrides({}, TOOLS[2]!, true)
    expect(on).toEqual({ create_task: true })
    expect(nextConfirmationOverrides(on, TOOLS[2]!, false)).toEqual({})
    expect(nextConfirmationOverrides({}, TOOLS[3]!, false)).toEqual({ delete_task: false })
  })

  it('confirmação: escrita com confirmByDefault pede por padrão e desligar vira ajuste', () => {
    const gated: OpexToolMetaDto = { name: 'write_repo_file', group: 'github', label: 'Gravar', description: 'grava', risk: 'write', confirmByDefault: true, alwaysOn: false }
    expect(toolConfirms(gated)).toBe(true)
    const overrides = nextConfirmationOverrides({}, gated, false)
    expect(overrides).toEqual({ write_repo_file: false })
    expect(toolConfirms(gated, overrides)).toBe(false)
    expect(nextConfirmationOverrides(overrides, gated, true)).toEqual({})
  })

  it('ligadas/desligadas: as sempre ligadas nunca saem', () => {
    expect(enabledOpexToolNames(TOOLS, ['list_tasks', 'get_app_overview'])).toEqual(['get_app_overview', 'create_task', 'delete_task', 'create_service'])
    expect(disabledOpexToolNames(TOOLS, ['create_task'])).toEqual(['list_tasks', 'delete_task', 'create_service'])
  })

  it('a árvore tem um módulo por grupo com ferramentas, e as destrutivas são sensíveis', () => {
    const tree = buildOpexToolTree(TOOLS)
    expect(tree.map((branch) => branch.id)).toEqual(['tools_context', 'tools_tasks', 'tools_services'])
    expect(tree[1]!.children).toContainEqual({ key: 'delete_task', label: 'delete_task', description: 'd delete_task', sensitive: true })
  })
})

describe('migração da configuração antiga', () => {
  it('grupo desligado vira as ferramentas dele desligadas; "Toda alteração" liga a confirmação das que alteram', () => {
    const legacy = { ...DEFAULT_OPEX_AGENT_SETTINGS, toolGroups: { tasks: false, context: false, services: true }, confirmation: 'writes' } as Record<string, unknown>
    delete legacy.disabledTools
    delete legacy.confirmationOverrides
    const migrated = migrateLegacyToolSettings(legacy, TOOLS)
    expect(migrated).not.toHaveProperty('toolGroups')
    expect(migrated).not.toHaveProperty('confirmation')
    expect(migrated.disabledTools).toEqual(['list_tasks', 'create_task', 'delete_task'])
    expect(migrated.confirmationOverrides).toEqual({ create_task: true, create_service: true })
  })

  it('withDefaults deixa a configuração antiga válida no schema novo (política "Só destrutivas" = sem ajustes)', () => {
    const legacy = { ...DEFAULT_OPEX_AGENT_SETTINGS, instructions: 'Minhas', toolGroups: { services: false }, confirmation: 'destructive' } as Record<string, unknown>
    delete legacy.disabledTools
    delete legacy.confirmationOverrides
    const parsed = opexAgentSettingsSchema.parse(withDefaults(legacy, TOOLS))
    expect(parsed).toMatchObject({ instructions: 'Minhas', disabledTools: ['create_service'], confirmationOverrides: {} })
  })

  it('configuração já no formato novo não muda', () => {
    const current = { ...DEFAULT_OPEX_AGENT_SETTINGS, disabledTools: ['list_tasks'], confirmationOverrides: { delete_task: false } }
    expect(migrateLegacyToolSettings(current, TOOLS)).toBe(current)
  })

  it('ao salvar, ferramenta desconhecida é recusada e as sempre ligadas saem das desligadas', () => {
    const normalized = normalizeOpexSettings({ ...DEFAULT_OPEX_AGENT_SETTINGS, disabledTools: ['get_app_overview', 'list_tasks', 'list_tasks'] }, TOOLS)
    expect(normalized.disabledTools).toEqual(['list_tasks'])
    expect(() => normalizeOpexSettings({ ...DEFAULT_OPEX_AGENT_SETTINGS, confirmationOverrides: { nao_existe: true } }, TOOLS)).toThrow(DomainError)
  })
})
