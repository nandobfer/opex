/** @vitest-environment happy-dom */

import React from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())

import { UsageBar } from '@/components/metrics/UsageBar'

afterEach(cleanup)

describe('UsageBar', () => {
  it('mostra o % inteiro por padrão (contrato da quota e do servidor)', () => {
    const { container } = render(<UsageBar label="5h" percent={43.9} ariaLabel="5h" />)
    expect(container.textContent).toContain('44%')
  })

  it('com fractionDigits mostra as casas em pt-BR (assinatura OpenCode Go)', () => {
    const { container } = render(<UsageBar label="Mensal" percent={43.9} ariaLabel="Mensal" fractionDigits={1} />)
    expect(container.textContent).toContain('43,9%')
    expect(container.querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow')).toBe('44')
  })
})
