/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ChartTooltipContent } from '@/components/ui/chart'

afterEach(() => cleanup())

const payload = [{ name: 'Convertido', dataKey: 'valor', value: 18900, color: '#0b57c4', payload: { label: 'Londrina', valor: 18900 } }]
const show = (props: Partial<React.ComponentProps<typeof ChartTooltipContent>> = {}) => render(<ChartTooltipContent active payload={payload as never} label="Londrina" {...props} />)

describe('tooltip padrão dos gráficos', () => {
  it('mostra título, série e valor em pt-BR, com o rodapé de contexto', () => {
    show({ footer: () => '42% do total · Regional Paraná' })
    const tooltip = screen.getByRole('tooltip')
    expect(tooltip.textContent).toContain('Londrina')
    expect(tooltip.textContent).toContain('Convertido')
    expect(tooltip.textContent).toContain('18.900')
    expect(tooltip.textContent).toContain('42% do total · Regional Paraná')
  })

  it('formata o valor com o formatador do gráfico (ex.: R$)', () => {
    show({ valueFormatter: (value) => `R$ ${Number(value).toLocaleString('pt-BR')},00` })
    expect(screen.getByRole('tooltip').textContent).toContain('R$ 18.900,00')
  })

  it('inativo não renderiza nada', () => {
    show({ active: false })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})
