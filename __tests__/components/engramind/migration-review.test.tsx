/** @vitest-environment happy-dom */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { framerMotionMock } from '../../helpers/framer-motion'

/** OPE-104: revisão da migração — aceitar um descarte não importa; migrar uma descartada é ação explícita. */

vi.mock('framer-motion', () => framerMotionMock())

import { ReviewItem } from '@/features/engramind/components/integration/migration/ReviewItem'
import type { MigrationItemDto } from '@/features/engramind/types'

const item = (decisao: NonNullable<MigrationItemDto['decision']>['decisao']): MigrationItemDto => ({
  id: 'x1',
  list: 'opex-owner',
  listTitle: 'Memórias do dono',
  centralId: null,
  texto: 'Regra antiga.',
  resumo: 'Regra',
  origem: 'Mentor · OPE-1',
  ownerProtected: false,
  channel: 'agentes/opex/dono',
  criadaEm: '2026-01-01T00:00:00.000Z',
  decision: { decisao, motivo: 'Duplicada da m_1', textoProposto: null, categoriaProposta: 'PROJECT_RULES', canalDestino: 'agentes/opex/dono', duplicataDe: null, confianca: 0.8 },
  review: { status: 'pendente', texto: null, categoria: null },
  final: { texto: 'Regra antiga.', categoria: 'PROJECT_RULES' },
  needsAttention: decisao === 'descartar' || decisao === 'revisar_dono',
  imported: null,
})
const mount = (decisao: Parameters<typeof item>[0], onDecide = vi.fn()) => {
  render(
    <ul>
      <ReviewItem item={item(decisao)} categories={[{ key: 'PROJECT_RULES', label: 'Regras' }]} textMax={4000} onDecide={onDecide} />
    </ul>,
  )
  return onDecide
}

afterEach(cleanup)

describe('item da revisão', () => {
  it('descartar: "Aceitar descarte" não importa e "Migrar mesmo assim" é a ação explícita de importar', () => {
    const onDecide = mount('descartar')
    expect(screen.queryByRole('button', { name: /^Aprovar$/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Aceitar descarte/ }))
    expect(onDecide).toHaveBeenLastCalledWith({ status: 'rejeitada' })
    fireEvent.click(screen.getByRole('button', { name: /Migrar mesmo assim/ }))
    expect(onDecide).toHaveBeenLastCalledWith({ status: 'aprovada' })
  })

  it('migrar: Aprovar e Rejeitar de sempre', () => {
    mount('migrar')
    expect(screen.getByRole('button', { name: /^Aprovar$/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Rejeitar$/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Migrar mesmo assim/ })).toBeNull()
  })
})
