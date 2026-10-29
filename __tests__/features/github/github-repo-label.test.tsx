/** @vitest-environment happy-dom */

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { GithubRepoLabel } from '@/features/github/components/shared'

describe('GithubRepoLabel', () => {
  it('mostra o avatar real, o nome completo, a descrição e o cadeado quando privado', () => {
    const { container } = render(
      <GithubRepoLabel repo={{ fullName: 'o/portal', ownerAvatarUrl: 'https://avatars.githubusercontent.com/u/1?v=4', description: 'Portal interno', private: true }} />,
    )
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://avatars.githubusercontent.com/u/1?v=4')
    expect(screen.getByText('o/portal')).toBeTruthy()
    expect(screen.getByText('Portal interno')).toBeTruthy()
    expect(screen.getByLabelText('Privado')).toBeTruthy()
  })

  it('sem URL do avatar, mantém a inicial do repositório (fallback)', () => {
    const { container } = render(<GithubRepoLabel repo={{ fullName: 'o/portal', ownerAvatarUrl: null, description: null, private: false }} />)
    expect(container.querySelector('img')).toBeNull()
    expect(screen.getByText('o')).toBeTruthy()
    expect(screen.getByText('o/portal')).toBeTruthy()
  })
})
