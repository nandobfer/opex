/** @vitest-environment happy-dom */

import React from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())

import { UsageBar } from '@/components/metrics/UsageBar'
import { UsageBars } from '@/components/metrics/UsageBars'
import { USAGE_BAR_COMPACT_TRACK_ROW_CLASS } from '@/components/metrics/usage-bar-layout'

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

  it('sem compact o detalhe continua visível (quota e Servidor)', () => {
    const { container } = render(<UsageBar label="RAM" percent={50} ariaLabel="RAM" detail="4 GiB de 8 GiB" />)
    expect(container.textContent).toContain('4 GiB de 8 GiB')
    expect(container.firstElementChild!.hasAttribute('data-compact')).toBe(false)
  })

  it('compact: só rótulo e %; o detalhe vai para o title e a trilha fica na faixa de altura fixa (OPE-218)', () => {
    const { container } = render(<UsageBar compact label="RAM" percent={50} ariaLabel="RAM: 50% (4 GiB de 8 GiB)" detail="4 GiB de 8 GiB" detailTitle="4 GiB de 8 GiB · lido às 10:00" />)
    const root = container.firstElementChild as HTMLElement
    expect(root.getAttribute('data-compact')).toBe('true')
    expect(root.textContent).toContain('RAM')
    expect(root.textContent).toContain('50%')
    expect(root.textContent).not.toContain('4 GiB de 8 GiB')
    expect(root.getAttribute('title')).toBe('4 GiB de 8 GiB · lido às 10:00')
    const progressbar = container.querySelector('[role="progressbar"]')!
    expect(progressbar.getAttribute('aria-valuenow')).toBe('50')
    expect(progressbar.getAttribute('aria-label')).toContain('4 GiB de 8 GiB')
    expect(progressbar.parentElement!.className).toBe(USAGE_BAR_COMPACT_TRACK_ROW_CLASS)
  })

  it('compact sem detailTitle usa o detalhe em texto no title', () => {
    const { container } = render(<UsageBar compact label="CPU" percent={10} ariaLabel="CPU" detail="0,2 de 2 CPUs" />)
    expect(container.firstElementChild!.getAttribute('title')).toBe('0,2 de 2 CPUs')
  })
})

describe('UsageBars', () => {
  const items = [
    { key: 'cpu', label: 'CPU', percent: 20, ariaLabel: 'CPU', detail: '0,4 de 2 CPUs', dataAttributes: { 'data-usage-metric': 'cpu' } },
    { key: 'swap', label: 'Swap', emptyText: 'Sem swap', dataAttributes: { 'data-usage-metric': 'swap' } },
  ] as const

  it('compact: o item sem valor vira célula com rótulo e o texto na faixa da trilha, com os data-*', () => {
    const { container } = render(<UsageBars compact items={items} />)
    const swap = container.querySelector('[data-usage-metric="swap"]') as HTMLElement
    expect(swap.getAttribute('data-compact')).toBe('true')
    expect(swap.textContent).toContain('Swap')
    const trackRow = swap.children[1] as HTMLElement
    expect(trackRow.className).toBe(USAGE_BAR_COMPACT_TRACK_ROW_CLASS)
    expect(trackRow.textContent).toBe('Sem swap')
    expect(swap.getAttribute('title')).toBe('Swap: Sem swap')
    const cpu = container.querySelector('[data-usage-metric="cpu"]') as HTMLElement
    expect(cpu.getAttribute('data-compact')).toBe('true')
    expect(cpu.textContent).not.toContain('0,4 de 2 CPUs')
  })

  it('sem compact mantém a linha "rótulo … texto" e o detalhe visível', () => {
    const { container } = render(<UsageBars items={items} />)
    expect(container.querySelector('[data-usage-metric="swap"]')!.hasAttribute('data-compact')).toBe(false)
    expect(container.querySelector('[data-usage-metric="cpu"]')!.textContent).toContain('0,4 de 2 CPUs')
  })
})
