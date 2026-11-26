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

  it('tone="primary": cor primária fixa, sem faixa de consumo nem pulso, mesmo acima de 95%', () => {
    const { container } = render(<UsageBar label="Deploy" percent={97} ariaLabel="Deploy" tone="primary" />)
    const root = container.firstElementChild!
    expect(root.hasAttribute('data-level')).toBe(false)
    expect(root.getAttribute('data-tone')).toBe('primary')
    const bar = container.querySelector('[role="progressbar"] > div')!
    expect(bar.classList.contains('bg-primary')).toBe(true)
    expect(bar.classList.contains('bg-destructive')).toBe(false)
  })

  it('percent=null: indeterminada, sem % nem aria-valuenow, com o texto do valor', () => {
    const { container } = render(<UsageBar label="Deploy" percent={null} ariaLabel="Deploy" ariaValueText="01:12 decorridos" detail="há 01:12" tone="primary" />)
    const progressbar = container.querySelector('[role="progressbar"]')!
    expect(progressbar.hasAttribute('aria-valuenow')).toBe(false)
    expect(progressbar.getAttribute('aria-valuetext')).toBe('01:12 decorridos')
    expect(container.textContent).not.toMatch(/%/)
    expect(container.textContent).toContain('há 01:12')
    expect(container.querySelector('[data-indeterminate-bar]')).not.toBeNull()
  })
})
