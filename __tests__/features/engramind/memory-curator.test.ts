import { describe, expect, it } from 'vitest'
import { INVALID_CLASSIFICATION_REASON, applyCuratorRules, parseCuratorAnswer, type CuratorSourceItem } from '@/features/engramind/memory-curator'

/** OPE-104: regras do Opex sobre a resposta do curador da migração (100% das memórias recebem decisão). */

const C = 'a'.repeat(24)
const item = (overrides: Partial<CuratorSourceItem> = {}): CuratorSourceItem => ({
  id: 'x1',
  list: 'opex-owner',
  centralId: null,
  texto: 'Responda em pt-BR.',
  resumo: 'pt-BR',
  origin: null,
  createdBy: 'local',
  createdAt: '2026-01-01T00:00:00.000Z',
  ownerProtected: true,
  ...overrides,
})
const context = { categories: [{ key: 'PROJECT_RULES' }, { key: 'NAMING' }], textMax: 50 }

describe('regras do curador', () => {
  it('memória do dono nunca é descartada: vira revisar_dono com o motivo do curador', () => {
    const decision = applyCuratorRules([item()], [{ id: 'x1', decisao: 'descartar', motivo: 'Obsoleta' }], context).get('x1')!
    expect(decision).toMatchObject({ decisao: 'revisar_dono', motivo: 'Memória do dono: o curador sugeriu descartar (Obsoleta)' })
  })

  it('a do Mentor pode receber descartar (passa pela revisão do dono)', () => {
    const mentor = item({ ownerProtected: false, origin: { source: 'mentor', label: 'Mentor · OPE-1' } })
    expect(applyCuratorRules([mentor], [{ id: 'x1', decisao: 'descartar', motivo: 'Duplicada' }], context).get('x1')!.decisao).toBe('descartar')
  })

  it('sem classificação (ausente ou inválida) vira revisar_dono com o motivo exato', () => {
    const answers = parseCuratorAnswer('```json\n[{"id":"x2","decisao":"inventada","motivo":"?"}]\n```')
    expect(answers).toEqual([])
    const decisions = applyCuratorRules([item(), item({ id: 'x2' })], answers, context)
    expect(decisions.get('x1')).toMatchObject({ decisao: 'revisar_dono', motivo: INVALID_CLASSIFICATION_REASON, categoriaProposta: 'PROJECT_RULES', canalDestino: 'agentes/opex/dono' })
    expect(decisions.get('x2')!.motivo).toBe('Sem classificação válida do curador')
  })

  it('texto acima do text_max sempre vai para revisar_dono (com a reescrita proposta)', () => {
    const long = item({ texto: 'x'.repeat(51), ownerProtected: false })
    const decision = applyCuratorRules([long], [{ id: 'x1', decisao: 'migrar_reescrevendo', motivo: 'Longa', textoProposto: 'Curta.' }], context).get('x1')!
    expect(decision).toMatchObject({ decisao: 'revisar_dono', textoProposto: 'Curta.' })
    expect(decision.motivo).toContain('Acima de 50 caracteres')
  })

  it('o destino é sempre a lista de origem: troca de lista sugerida (mesmo para as Memórias do Opex) só aparece no motivo', () => {
    const decisions = applyCuratorRules(
      [item(), item({ id: 'x2', list: 'developer-central', centralId: C, ownerProtected: false })],
      [
        { id: 'x1', decisao: 'migrar', motivo: 'Vale para todos', canalDestino: 'opex' },
        { id: 'x2', decisao: 'migrar', motivo: 'Geral', canalDestino: 'agentes/desenvolvedor/global' },
      ],
      context,
    )
    expect(decisions.get('x1')).toMatchObject({ canalDestino: 'agentes/opex/dono' })
    expect(decisions.get('x1')!.motivo).toContain('o curador sugeriu mover para opex')
    expect(decisions.get('x2')).toMatchObject({ canalDestino: `agentes/desenvolvedor/central/${C}` })
  })

  it('categoria fora da lista vira a primeira; duplicataDe só vale dentro da lista', () => {
    const decision = applyCuratorRules([item()], [{ id: 'x1', decisao: 'migrar', motivo: 'ok', categoriaProposta: 'NAO_EXISTE', duplicataDe: 'outra' }], context).get('x1')!
    expect(decision).toMatchObject({ categoriaProposta: 'PROJECT_RULES', duplicataDe: null })
  })
})
