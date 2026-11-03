/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

/** OPE-117: adoção visível no card do agente (gravações 7d, última gravação, último contexto lido e a última entrega). */

vi.mock('framer-motion', () => framerMotionMock())

import { AgentMemoryActivity } from '@/features/ai/components/memories/AgentMemoryActivity'
import type { AgentActivityDto } from '@/features/engramind/agent-activity'

const row = (extra: Partial<AgentActivityDto> = {}): AgentActivityDto => ({ agent: 'opex', total: 0, last7d: 0, lastWriteAt: null, delivery: null, selfMemory: true, stale: false, ...extra })

afterEach(cleanup)

describe('adoção no card do agente', () => {
  it('zeros explícitos: 0 gravadas e "Nunca" para gravação e contexto', () => {
    render(<AgentMemoryActivity agent="opex" activity={row()} loading={false} />)
    expect(screen.getByTestId('activity-7d').textContent).toContain('0')
    expect(screen.getByTestId('activity-last-write').textContent).toBe('Nunca')
    expect(screen.getByTestId('activity-last-context').textContent).toBe('Nunca')
    expect(screen.queryByTestId('activity-stale')).toBeNull()
  })

  it('mostra o recorte de 7 dias e o total, e o aviso discreto quando não grava há 14 dias', () => {
    render(<AgentMemoryActivity agent="opex" activity={row({ total: 12, last7d: 3, lastWriteAt: new Date(Date.now() - 20 * 86400_000).toISOString(), stale: true })} loading={false} />)
    expect(screen.getByTestId('activity-7d').textContent).toContain('3')
    expect(screen.getByTestId('activity-7d').textContent).toContain('de 12 no total')
    expect(screen.getByTestId('activity-last-write').textContent).toContain('há')
    expect(screen.getByTestId('activity-stale').textContent).toContain('14 dias')
  })

  it('"Última entrega": ids por faixa, canais e version, sem texto; sem entrega, avisa', () => {
    const { rerender } = render(<AgentMemoryActivity agent="opex" activity={row()} loading={false} />)
    fireEvent.click(screen.getByRole('button', { name: /Última entrega/ }))
    expect(screen.getByText('Nenhuma entrega registrada.')).toBeTruthy()
    rerender(
      <AgentMemoryActivity
        agent="opex"
        activity={row({ delivery: { fullIds: ['m_1', 'm_2'], titleIds: ['m_3'], overflow: 4, counts: { full: 2, titles: 1, overflow: 4 }, channels: ['opex', 'agentes/opex/dono'], delivered: ['opex'], version: 'cv_9', focusMode: 'hybrid', source: 'live', at: new Date().toISOString() } })}
        loading={false}
      />,
    )
    const details = screen.getByTestId('delivery-details').textContent!
    expect(details).toContain('2 com texto · 1 só título · 4 fora do bloco')
    expect(details).toContain('m_1, m_2')
    expect(details).toContain('m_3')
    expect(details).toContain('agentes/opex/dono')
    expect(details).toContain('cv_9')
    expect(screen.getByTestId('activity-last-context').textContent).toContain('há')
  })

  it('carregando: skeleton com a mesma grade do resultado', () => {
    render(<AgentMemoryActivity agent="opex" activity={undefined} loading />)
    const skeleton = screen.getByTestId('agent-activity-skeleton')
    expect(skeleton.querySelector('.grid')!.className).toContain('sm:grid-cols-3')
    expect(skeleton.querySelectorAll('.min-h-\\[3\\.25rem\\]').length).toBe(3)
  })
})
