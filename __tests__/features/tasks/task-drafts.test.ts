import { describe, expect, it } from 'vitest'
import { bulkMoveUrlNeed, planBulkArchive, planBulkDiscard, planBulkMove } from '@/features/tasks/bulk-items'
import { draftAcceptsColumn, draftMongoId, draftTaskId, isDraftTaskId } from '@/features/tasks/drafts'
import { bulkTasksSchema } from '@/features/tasks/schemas'
import type { TaskDto } from '@/features/tasks/types'

const ID = 'a'.repeat(24)
const task = (id: string, overrides: Partial<TaskDto> = {}): TaskDto => ({
  id, code: `GO-DEV-${id}`, title: id, status: 'development', order: 0, taskType: 'feature', priority: 'medium', product: null, workPackage: null,
  assignee: null, commitUrl: null, pullRequestUrl: null, archived: false, createdAt: null, updatedAt: null, localColumn: null, localOrder: null, ...overrides,
})
const draft = (n: number) => task(draftTaskId(String(n).padStart(24, '0')), { code: `app#${n}`, status: 'backlog', localColumn: 'custom-entrada01', draft: { id: String(n).padStart(24, '0'), repo: 'sipal/app', number: n, issueClosed: false } })

describe('rascunhos no quadro (regras puras)', () => {
  it('id `draft-…` e colunas aceitas (pessoais + criáveis no Go! Sipal)', () => {
    expect(isDraftTaskId(draftTaskId(ID))).toBe(true)
    expect(isDraftTaskId(ID)).toBe(false)
    expect(draftMongoId(draftTaskId(ID))).toBe(ID)
    expect(['custom-abcdef', 'backlog', 'prioritized', 'specification', 'development'].every(draftAcceptsColumn)).toBe(true)
    expect(['validation', 'awaiting_production', 'in_production'].some(draftAcceptsColumn)).toBe(false)
  })

  it('lote para coluna do Go! Sipal criável envia os rascunhos (sem desfazer) e move as tarefas', () => {
    const plan = planBulkMove([task('1', { status: 'backlog' }), draft(1)], 'specification')
    expect(plan.items.map((item) => [item.task.code, item.action])).toEqual([
      ['GO-DEV-1', { type: 'move', targetStatus: 'specification', commitUrl: undefined, pullRequestUrl: undefined }],
      ['app#1', { type: 'move', targetStatus: 'specification' }],
    ])
    expect(plan.items[1]!.undo).toBeNull()
  })

  it('lote para Validação ignora rascunhos (aviso) e eles não pedem URL', () => {
    const plan = planBulkMove([draft(1), draft(2)], 'validation')
    expect(plan.items).toHaveLength(0)
    expect(plan.note).toContain('2 rascunho(s) ignorado(s)')
    expect(bulkMoveUrlNeed([draft(1)], 'validation')).toBeNull()
  })

  it('descartar só rascunhos (desfazer restaura); arquivar só tarefas', () => {
    const plan = planBulkDiscard([task('1'), draft(3)])
    expect(plan.items.map((item) => [item.task.code, item.action, item.undo?.action])).toEqual([['app#3', { type: 'discard' }, { type: 'restore' }]])
    expect(planBulkArchive([task('1'), draft(3)], true).items.map((item) => item.task.code)).toEqual(['GO-DEV-1'])
  })

  it('o lote aceita ids de rascunho e as ações de descartar/restaurar', () => {
    expect(bulkTasksSchema.safeParse({ items: [{ id: draftTaskId(ID), action: { type: 'discard' } }, { id: ID, action: { type: 'priority', priority: 'high' } }] }).success).toBe(true)
    expect(bulkTasksSchema.safeParse({ items: [{ id: 'draft-x', action: { type: 'discard' } }] }).success).toBe(false)
  })
})
