import { describe, expect, it } from 'vitest'
import { adversarialReviewListQuerySchema } from '@/features/adversarial-agent/schemas'
import { mentorRunListQuerySchema } from '@/features/adversarial-agent/mentor/schemas'
import { buildAdversarialReviewListFilter } from '@/features/adversarial-agent/server/list-query'
import { buildMentorRunListFilter } from '@/features/adversarial-agent/server/mentor/list-query'

const CENTRAL = '0123456789abcdef01234567'

describe('lista do Agente Adversário: query da API', () => {
  it('converte CSV em listas e aplica página e limite padrão', () => {
    const query = adversarialReviewListQuerySchema.parse({ states: 'done,failed', decisions: 'approved', levels: 'strict', centrals: CENTRAL })
    expect(query).toMatchObject({ q: '', states: ['done', 'failed'], decisions: ['approved'], levels: ['strict'], centrals: [CENTRAL], page: 1, limit: 20 })
  })

  it('rejeita situação/decisão desconhecida, central malformada, data inválida e limite acima de 100', () => {
    expect(adversarialReviewListQuerySchema.safeParse({ states: 'xyz' }).success).toBe(false)
    expect(adversarialReviewListQuerySchema.safeParse({ decisions: 'talvez' }).success).toBe(false)
    expect(adversarialReviewListQuerySchema.safeParse({ centrals: 'c1' }).success).toBe(false)
    expect(adversarialReviewListQuerySchema.safeParse({ from: 'ontem' }).success).toBe(false)
    expect(adversarialReviewListQuerySchema.safeParse({ limit: '101' }).success).toBe(false)
  })
})

describe('lista do Agente Adversário: filtro do Mongo', () => {
  const none = { q: '', states: [], decisions: [], levels: [], centrals: [] }

  it('sem filtros, tudo', () => {
    expect(buildAdversarialReviewListFilter(none)).toEqual({})
  })

  it('combina busca (código ou título, escapada), situação, decisão, criticidade, central e período', () => {
    const filter = buildAdversarialReviewListFilter({ ...none, q: ' OPE-9 (x) ', states: ['done'], decisions: ['approved', 'skipped'], levels: ['balanced'], centrals: [CENTRAL], from: '2026-10-01T03:00:00.000Z', to: '2026-10-02T02:59:59.999Z' })
    expect(filter).toEqual({
      $or: [{ taskCode: { $regex: 'OPE-9 \\(x\\)', $options: 'i' } }, { taskTitle: { $regex: 'OPE-9 \\(x\\)', $options: 'i' } }],
      state: { $in: ['done'] },
      decision: { $in: ['approved', 'skipped'] },
      level: { $in: ['balanced'] },
      centralId: { $in: [CENTRAL] },
      createdAt: { $gte: new Date('2026-10-01T03:00:00.000Z'), $lte: new Date('2026-10-02T02:59:59.999Z') },
    })
  })
})

describe('lista do Agente Mentor: query e filtro do Mongo', () => {
  const none = { q: '', statuses: [], sources: [], triggers: [], centrals: [] }

  it('converte CSV em listas, rejeita valores fora do vocabulário', () => {
    expect(mentorRunListQuerySchema.parse({ statuses: 'suggested', sources: 'user,ai', triggers: 'pr_feedback' })).toMatchObject({ statuses: ['suggested'], sources: ['user', 'ai'], triggers: ['pr_feedback'], centrals: [], page: 1, limit: 20 })
    expect(mentorRunListQuerySchema.safeParse({ statuses: 'pronta' }).success).toBe(false)
    expect(mentorRunListQuerySchema.safeParse({ sources: 'email' }).success).toBe(false)
    expect(mentorRunListQuerySchema.safeParse({ centrals: 'nao-e-id' }).success).toBe(false)
  })

  it('origem é uma lista na execução: `$in` casa quem tem ao menos uma; só período de início', () => {
    expect(buildMentorRunListFilter(none)).toEqual({})
    expect(buildMentorRunListFilter({ ...none, statuses: ['created', 'updated'], sources: ['developer'], triggers: ['reopen'], from: '2026-10-01T03:00:00.000Z' })).toEqual({
      status: { $in: ['created', 'updated'] },
      sources: { $in: ['developer'] },
      trigger: { $in: ['reopen'] },
      createdAt: { $gte: new Date('2026-10-01T03:00:00.000Z') },
    })
  })
})
