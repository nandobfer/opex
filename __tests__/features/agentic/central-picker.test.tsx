/** @vitest-environment jsdom */

import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('next/link', () => ({ default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => <a href={href} {...props}>{children}</a> }))

import { CentralPicker, centralRepoLabel } from '@/features/agentic/components/dev-center/CentralPicker'
import type { CentralDto } from '@/features/agentic/types'
import type { GithubRepoOption } from '@/features/github/types'
import { ALL_CENTRALS_ID } from '@/features/agentic/dev-center-central'

const central = (id: string, patch: Partial<CentralDto> = {}): CentralDto =>
  ({ id, projectId: `p-${id}`, projectName: `Projeto ${id}`, sigla: id.toUpperCase(), repo: `org/${id}`, ...patch }) as unknown as CentralDto

const repo = (fullName: string, patch: Partial<GithubRepoOption> = {}): GithubRepoOption => ({ fullName, htmlUrl: '', description: null, private: false, ownerAvatarUrl: null, ...patch })
const index = (repos: GithubRepoOption[]): Map<string, GithubRepoOption> => new Map(repos.map((item) => [item.fullName, item]))

describe('centralRepoLabel', () => {
  it('usa o repositório do GitHub quando há repo; cai no nome do projeto sem repo', () => {
    const map = index([repo('org/app', { ownerAvatarUrl: 'https://x/a.png', private: true, description: 'App' })])
    expect(centralRepoLabel(central('app'), map)).toMatchObject({ fullName: 'org/app', ownerAvatarUrl: 'https://x/a.png', description: 'App', private: true })
    expect(centralRepoLabel(central('x', { repo: null }), map)).toEqual({ fullName: 'Projeto x', ownerAvatarUrl: null, description: null, private: false })
  })
})

describe('CentralPicker', () => {
  it('campo: mostra owner/repo no gatilho e escolhe a central pela busca', async () => {
    const onSelect = vi.fn()
    const zipped = central('zip', { projectName: 'Compactado', repo: 'org/zip' })
    render(<CentralPicker centrals={[central('app'), zipped]} active={central('app')} index={index([repo('org/app'), repo('org/zip')])} onSelect={onSelect} />)
    expect(screen.getByText('org/app')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'org/app' }))
    fireEvent.click(await screen.findByRole('option', { name: 'org/zip' }))
    expect(onSelect).toHaveBeenCalledWith('zip')
  })

  it('oferece "Todos os projetos" no topo e mostra a opção no gatilho quando escolhida', async () => {
    const onSelect = vi.fn()
    const { rerender } = render(<CentralPicker centrals={[central('app')]} active={central('app')} index={new Map()} onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: /org\/app/ }))
    const options = await screen.findAllByRole('option')
    expect(options[0]!.textContent).toContain('Todos os projetos')
    fireEvent.click(options[0]!)
    expect(onSelect).toHaveBeenCalledWith(ALL_CENTRALS_ID)

    rerender(<CentralPicker centrals={[central('app')]} active={null} index={new Map()} onSelect={onSelect} />)
    expect(screen.getByRole('button', { name: /Todos os projetos/ })).toBeTruthy()
  })
})
