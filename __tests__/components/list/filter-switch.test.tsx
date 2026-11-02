/** @vitest-environment happy-dom */

import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Archive } from 'lucide-react'
import { FilterSwitch } from '@/components/list/FilterSwitch'

/** OPE-113: o switch de filtro de `/tarefas` virou componente compartilhado (também na rede do Engramind). */

afterEach(() => cleanup())

describe('FilterSwitch', () => {
  it('mostra o texto, alterna pelo nome acessível e destaca o ícone quando ligado', () => {
    const onChange = vi.fn()
    const { rerender, container } = render(<FilterSwitch icon={Archive} text="Mostrar" ariaLabel="Mostrar arquivados" checked={false} onCheckedChange={onChange} />)
    expect(screen.getByText('Mostrar')).toBeTruthy()
    expect(container.querySelector('svg')!.getAttribute('class')).toContain('text-muted-foreground')
    fireEvent.click(screen.getByLabelText('Mostrar arquivados'))
    expect(onChange).toHaveBeenCalledWith(true)
    rerender(<FilterSwitch icon={Archive} text="Mostrar" ariaLabel="Mostrar arquivados" checked onCheckedChange={onChange} />)
    expect(container.querySelector('svg')!.getAttribute('class')).toContain('text-primary')
    expect(container.firstElementChild!.className).toContain('bg-transparent')
  })
})
