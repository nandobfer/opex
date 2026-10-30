/** @vitest-environment happy-dom */

import React from 'react'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useForm } from 'react-hook-form'

/** Cor do projeto na aba Geral da central e seletor de cores compartilhado (OPE-100, port do MT-31). */

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())

import { CentralColorField } from '@/features/agentic/components/central/CentralColorField'
import type { CentralForm } from '@/features/agentic/components/central/form'
import { ColumnColorPicker } from '@/features/tasks/components/ColumnColorPicker'
import { defaultCentralConfig, type CentralConfig, type CentralConfigInput } from '@/features/agentic/schemas'
import type { ColumnColor } from '@/features/tasks/board'

afterEach(() => cleanup())

const latest: { current: CentralForm | null } = { current: null }

function Harness({ color }: { color: ColumnColor | null }) {
  const form = useForm<CentralConfigInput, unknown, CentralConfig>({ defaultValues: { ...defaultCentralConfig('/repo'), color } })
  React.useEffect(() => {
    latest.current = form
  })
  return <CentralColorField form={form} label="nandobfer/opex" />
}

const radio = (name: string) => screen.getByRole('radio', { name })

describe('CentralColorField', () => {
  it('central antiga (sem cor) começa em "Sem cor" com a prévia neutra', () => {
    render(<Harness color={null} />)
    expect(screen.getByRole('radiogroup', { name: 'Cor do projeto' })).toBeTruthy()
    expect(radio('Sem cor (neutra)').getAttribute('aria-checked')).toBe('true')
    const preview = screen.getByTestId('central-color-preview')
    expect(preview.textContent).toBe('nandobfer/opex')
    expect(preview.classList.contains('text-muted-foreground')).toBe(true)
  })

  it('escolher uma cor muda o formulário e a prévia; "Sem cor" volta a neutra', () => {
    render(<Harness color={null} />)
    fireEvent.click(radio('Verde'))
    expect(latest.current?.getValues('color')).toBe('emerald')
    expect(radio('Verde').getAttribute('aria-checked')).toBe('true')
    expect(screen.getByTestId('central-color-preview').classList.contains('text-emerald-400')).toBe(true)
    fireEvent.click(radio('Sem cor (neutra)'))
    expect(latest.current?.getValues('color')).toBeNull()
    expect(screen.getByTestId('central-color-preview').classList.contains('text-muted-foreground')).toBe(true)
  })
})

describe('ColumnColorPicker (cor da coluna de Tarefas)', () => {
  it('sem allowNone não oferece "Sem cor" e marca a cor escolhida', () => {
    const onChange = vi.fn()
    render(<ColumnColorPicker aria-label="Cor" value="sky" onChange={onChange} />)
    expect(screen.queryByRole('radio', { name: 'Sem cor (neutra)' })).toBeNull()
    expect(radio('Azul').getAttribute('aria-checked')).toBe('true')
    fireEvent.click(radio('Âmbar'))
    expect(onChange).toHaveBeenCalledWith('amber')
  })
})

describe('controles do tema nas telas da central (estático)', () => {
  it('as pastas central e dev-center não usam select nem checkbox nativos', () => {
    const dirs = ['src/features/agentic/components/central', 'src/features/agentic/components/dev-center']
    for (const dir of dirs) {
      for (const file of readdirSync(join(process.cwd(), dir)).filter((name) => name.endsWith('.tsx'))) {
        const source = readFileSync(join(process.cwd(), dir, file), 'utf8')
        expect(source, `${dir}/${file}`).not.toMatch(/<select[\s>]/)
        expect(source, `${dir}/${file}`).not.toMatch(/type=["']checkbox["']/)
      }
    }
  })
})
