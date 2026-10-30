import { describe, expect, it } from 'vitest'
import { parseUrlFilters } from '@/hooks/useUrlFilters'
import { ADVERSARIAL_REVIEW_FILTER_SCHEMA, DEFAULT_ADVERSARIAL_REVIEW_FILTERS, hasAdversarialReviewFilters, toAdversarialReviewListParams } from '@/features/adversarial-agent/filters'
import { DEFAULT_MENTOR_RUN_FILTERS, hasMentorRunFilters, MENTOR_RUN_FILTER_SCHEMA, toMentorRunListParams } from '@/features/adversarial-agent/mentor/filters'

const CENTRAL = '0123456789abcdef01234567'

describe('filtros da página Agente Adversário (URL)', () => {
  it('lê a URL e descarta valores inválidos (link antigo ou editado à mão)', () => {
    const filters = parseUrlFilters(`?q=login&states=done,xyz&decisions=approved&levels=strict&centrals=${CENTRAL},ruim&from=2026-10-01&to=2026-13-40`, DEFAULT_ADVERSARIAL_REVIEW_FILTERS, ADVERSARIAL_REVIEW_FILTER_SCHEMA)
    expect(filters).toEqual({ q: 'login', states: ['done'], decisions: ['approved'], levels: ['strict'], centrals: [CENTRAL], from: '2026-10-01', to: '' })
    expect(hasAdversarialReviewFilters(filters)).toBe(true)
    expect(hasAdversarialReviewFilters(DEFAULT_ADVERSARIAL_REVIEW_FILTERS)).toBe(false)
  })

  it('vira os parâmetros da API (CSV e o dia inteiro em ISO)', () => {
    const params = toAdversarialReviewListParams({ ...DEFAULT_ADVERSARIAL_REVIEW_FILTERS, q: '  OPE-1 ', decisions: ['approved', 'skipped'], centrals: [CENTRAL], from: '2026-10-01', to: '2026-10-01' })
    expect(params).toMatchObject({ q: 'OPE-1', decisions: 'approved,skipped', centrals: CENTRAL })
    expect(new Date(params.from!).getHours()).toBe(0)
    expect(new Date(params.to!).getHours()).toBe(23)
    expect(toAdversarialReviewListParams(DEFAULT_ADVERSARIAL_REVIEW_FILTERS)).toEqual({})
  })
})

describe('filtros da página Agente Mentor (URL)', () => {
  it('lê a URL, descarta o inválido e vira os parâmetros da API', () => {
    const filters = parseUrlFilters('?statuses=suggested,nada&sources=user&triggers=reopen,xx', DEFAULT_MENTOR_RUN_FILTERS, MENTOR_RUN_FILTER_SCHEMA)
    expect(filters).toMatchObject({ statuses: ['suggested'], sources: ['user'], triggers: ['reopen'], centrals: [] })
    expect(hasMentorRunFilters(filters)).toBe(true)
    expect(toMentorRunListParams(filters)).toEqual({ statuses: 'suggested', sources: 'user', triggers: 'reopen' })
    expect(hasMentorRunFilters(DEFAULT_MENTOR_RUN_FILTERS)).toBe(false)
  })
})
