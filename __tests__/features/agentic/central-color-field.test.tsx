/** @vitest-environment happy-dom */

import React from 'react'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useForm } from 'react-hook-form'

/** Cor do projeto na aba Geral da central e seletor de cores compartilhado (OPE-100, port do MT-31). */

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())
vi.mock('@/features/color-palette/hooks', () => ({
  useColorPalette: () => ({ favorites: [{ color: '#34D399', name: 'Verde' }], addFavorite: vi.fn() }),
}))

import { CentralColorField } from '@/features/agentic/components/central/CentralColorField'
import type { CentralForm } from '@/features/agentic/components/central/form'
import { defaultCentralConfig, type CentralConfig, type CentralConfigInput } from '@/features/agentic/schemas'

afterEach(() => cleanup())

const latest: { current: CentralForm | null } = { current: null }

function Harness({ color }: { color: string | null }) {
  const form = useForm<CentralConfigInput, unknown, CentralConfig>({ defaultValues: { ...defaultCentralConfig('/repo'), color } })
  React.useEffect(() => {
    latest.current = form
  })
  return <CentralColorField form={form} label="nandobfer/opex" />
}

const radio = (name: string) => screen.getByRole('radio', { name })
const openPicker = () => fireEvent.click(document.getElementById('central-color-picker')!)

describe('CentralColorField', () => {
  it('central antiga (sem cor) começa em "Sem cor" com a prévia neutra', () => {
    render(<Harness color={null} />)
    expect(document.getElementById('central-color-picker')!.textContent).toContain('Sem cor (neutra)')
    const preview = screen.getByTestId('central-color-preview')
    expect(preview.textContent).toBe('nandobfer/opex')
    expect(preview.classList.contains('text-muted-foreground')).toBe(true)
  })

  it('escolher uma cor grava o hex e pinta a prévia; "Sem cor" volta a neutra', () => {
    render(<Harness color={null} />)
    openPicker()
    fireEvent.click(radio('Verde'))
    expect(latest.current?.getValues('color')).toBe('#34D399')
    const preview = screen.getByTestId('central-color-preview')
    expect(preview.style.color).toBeTruthy()
    expect(preview.classList.contains('text-muted-foreground')).toBe(false)
    fireEvent.click(radio('Sem cor (neutra)'))
    expect(latest.current?.getValues('color')).toBeNull()
    expect(screen.getByTestId('central-color-preview').classList.contains('text-muted-foreground')).toBe(true)
  })

  it('central salva com o nome antigo da paleta mostra a cor convertida em hex', () => {
    render(<Harness color="emerald" />)
    expect(document.getElementById('central-color-picker')!.textContent).toContain('#34D399')
    expect(screen.getByTestId('central-color-preview').style.color).toBeTruthy()
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
