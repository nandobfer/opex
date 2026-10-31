/** @vitest-environment happy-dom */

import React from 'react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

/** Seletor de provedor compartilhado pelas telas de IA, agentes e Engramind (regra: extrair, nunca copiar). */

import { AiProviderTabs } from '@/features/ai/components/AiProviderTabs'

const providers = [
  { id: 'gemini', integrationId: 'ai_gemini', name: 'Gemini', configured: true, connected: true },
  { id: 'openai', integrationId: 'ai_openai', name: 'OpenAI', configured: false, connected: false },
] as const

describe('AiProviderTabs', () => {
  it('desconectado fica desabilitado com "X: não conectado"; opções extras antes e depois', () => {
    const onChange = vi.fn()
    render(<AiProviderTabs id="p" providers={[...providers]} allowed={['gemini', 'openai']} value="gemini" onChange={onChange} extraOptions={[{ value: 'local', label: 'Local' }, { value: 'off', label: 'Desligado', position: 'end' }]} />)
    const radios = screen.getAllByRole('radio')
    expect(radios.map((radio) => radio.textContent)).toEqual(['Local', 'Gemini', 'OpenAI', 'Desligado'])
    const openai = radios.find((radio) => radio.textContent === 'OpenAI')!
    expect(openai.hasAttribute('disabled')).toBe(true)
    expect(openai.getAttribute('title')).toBe('OpenAI: não conectado')
    fireEvent.click(radios.find((radio) => radio.textContent === 'Local')!)
    expect(onChange).toHaveBeenCalledWith('local')
  })

  it('nenhum permitido conectado e sem opção extra: estado vazio', () => {
    render(<AiProviderTabs id="p" providers={[...providers]} allowed={['openai']} value={null} onChange={vi.fn()} emptyText="Nenhum provedor conectado" />)
    expect(screen.getByText('Nenhum provedor conectado')).toBeTruthy()
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
  })

  it('as telas de IA, do Agente Opex, do Agente Mentor e do Engramind usam o componente, sem OptionTabs próprio', () => {
    const files = [
      'src/features/ai/components/understand-task/ProviderModelCard.tsx',
      'src/features/opex-agent/components/settings/OpexModelCard.tsx',
      'src/features/adversarial-agent/components/mentor/MentorModelFields.tsx',
      'src/features/engramind/components/integration/providers/opex-ai/RedatorSourceSection.tsx',
      'src/features/engramind/components/integration/providers/opex-ai/EmbeddingSourceSection.tsx',
    ]
    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), 'utf8')
      expect(source, file).toMatch(/<AiProviderTabs/)
      expect(source, file).not.toMatch(/from "@\/components\/ui\/option-tabs"/)
    }
  })
})

describe('TemperatureInput', () => {
  it('vazio vira null (padrão do modelo) e número vira número; 0 a 2 com passo 0,1', async () => {
    const { TemperatureInput, temperatureFromText } = await import('@/features/ai/components/TemperatureInput')
    expect(temperatureFromText('')).toBeNull()
    expect(temperatureFromText('  ')).toBeNull()
    expect(temperatureFromText('0.7')).toBe(0.7)
    const onChange = vi.fn()
    render(<TemperatureInput id="t" value={null} onChange={onChange} />)
    const input = document.getElementById('t') as HTMLInputElement
    expect([input.min, input.max, input.step, input.placeholder]).toEqual(['0', '2', '0.1', 'Padrão do modelo'])
    fireEvent.change(input, { target: { value: '1.2' } })
    expect(onChange).toHaveBeenLastCalledWith(1.2)
  })

  it('as telas de IA, dos agentes e do Engramind usam o campo compartilhado (sem Input de temperatura próprio)', () => {
    const files = [
      'src/features/opex-agent/components/settings/OpexModelCard.tsx',
      'src/features/ai/components/task-tags/TaskTagsTab.tsx',
      'src/features/ai/components/task-summary/SummaryPromptCard.tsx',
      'src/features/ai/components/estimate-hours/EstimateHoursTab.tsx',
      'src/features/ai/components/budget-preview/BudgetPreviewTab.tsx',
      'src/features/ai/components/understand-task/ResponseCard.tsx',
      'src/features/engramind/components/integration/providers/opex-ai/RedatorSourceSection.tsx',
    ]
    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), 'utf8')
      expect(source, file).toMatch(/<TemperatureInput/)
      expect(source, file).not.toMatch(/step="0\.1"/)
    }
  })
})
