/** @vitest-environment happy-dom */

import React from 'react'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { framerMotionMock } from '../../helpers/framer-motion'

/**
 * Telas do Engramind: campo de configuração gerado do metadado, escopos só com as combinações válidas,
 * o token do próprio Opex protegido, variáveis sensíveis só como configurada/não e o "Ver token".
 */

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), reveal: (async () => ({ secret: '', title: '' })) as (id: string) => Promise<{ secret: string; title: string }> }))

vi.mock('framer-motion', () => framerMotionMock())
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))
vi.mock('@/features/engramind/hooks/useEngramind', async (original) => ({
  ...(await original<object>()),
  useEngramindMutation: () => ({ mutate: mocks.mutate, mutateAsync: mocks.mutate, isPending: false }),
}))
vi.mock('@/features/opex-agent/hooks/useSecretReveal', () => ({ useSecretReveal: () => ({ mutateAsync: (id: string) => mocks.reveal(id), isPending: false }) }))

import { SettingField } from '@/features/engramind/components/integration/settings/SettingField'
import { ScopePicker } from '@/features/engramind/components/shared/ScopePicker'
import { TokensCard } from '@/features/engramind/components/integration/identities/TokensCard'
import { EnvVarField } from '@/features/engramind/components/integration/env/EnvVarField'
import { ToolResultAction } from '@/features/opex-agent/components/chat/ToolResultAction'
import type { EngramindToken } from '@/features/engramind/types'

const meta = { key: 'limits.rate_per_minute', type: 'integer', min: 1, max: 100000, default: 600, description: 'x', updated_at: '2026-10-30T12:00:00Z', updated_by_app: 'opex' }

describe('SettingField', () => {
  it('número com intervalo, erro em pt-BR fora da regra e "Voltar ao padrão" envia null', () => {
    const onChange = vi.fn()
    const { rerender } = render(<SettingField meta={meta} value={1200} dirty onChange={onChange} />)
    expect(screen.getByText('Requisições por minuto')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sobre Requisições por minuto' })).toBeTruthy()
    expect(screen.getByText(/Alterada em 30\/10\/2026/)).toBeTruthy()
    rerender(<SettingField meta={meta} value={0} dirty onChange={onChange} />)
    expect(screen.getByRole('alert').textContent).toBe('Mínimo 1')
    fireEvent.click(screen.getByRole('button', { name: /Voltar ao padrão/ }))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('booleano vira switch e enum pequeno vira abas', () => {
    render(
      <>
        <SettingField meta={{ key: 'webhooks.enabled', type: 'boolean', default: true, description: '' }} value={null} dirty={false} onChange={vi.fn()} />
        <SettingField meta={{ key: 'context.default_format', type: 'enum', choices: ['tagged', 'markdown', 'json'], default: 'tagged', description: '' }} value={null} dirty={false} onChange={vi.fn()} />
      </>,
    )
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true)
    expect(screen.getAllByRole('radio').map((radio) => radio.textContent)).toEqual(['tagged', 'markdown', 'json'])
  })
})

describe('SettingField somente leitura (aba Provedores)', () => {
  it('chaves da IA do Opex mostram o valor e o aviso, sem controle nem "Voltar ao padrão"', async () => {
    const { readOnlyNoteOf } = await import('@/features/engramind/components/integration/settings/SettingsTab')
    expect(readOnlyNoteOf('redator.base_url')).toMatch(/Definida pelo provedor/)
    expect(readOnlyNoteOf('embedding.model')).toMatch(/aba Provedores/)
    expect(readOnlyNoteOf('limits.rate_per_minute')).toBeUndefined()
    const onChange = vi.fn()
    render(<SettingField meta={{ key: 'redator.model', type: 'text', default: null, description: 'x' }} value="gpt-4o" dirty={false} onChange={onChange} readOnlyNote={readOnlyNoteOf('redator.model')} />)
    expect(screen.getByText('gpt-4o')).toBeTruthy()
    expect(screen.getByText(/Edite na aba Provedores/)).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('button', { name: /Voltar ao padrão/ })).toBeNull()
  })
})

describe('ScopePicker', () => {
  it('só as quatro combinações válidas; o token do Opex só aceita read+write+delete', () => {
    render(<ScopePicker id="s" value="read+write+delete" onChange={vi.fn()} allowed={['read+write+delete']} />)
    const radios = screen.getAllByRole('radio')
    expect(radios.map((radio) => radio.textContent)).toEqual(['read', 'read+write', 'read+delete', 'read+write+delete'])
    expect(radios.filter((radio) => radio.hasAttribute('disabled')).map((radio) => radio.textContent)).toEqual(['read', 'read+write', 'read+delete'])
  })
})

describe('TokensCard', () => {
  const token = (id: string, status: EngramindToken['status'] = 'active'): EngramindToken => ({ id, prefix: `eng.${id}`, kind: 'admin', scopes: ['read', 'write', 'delete'], app: { id: 'app_1', slug: 'opex' }, agent: null, label: 'Opex', status, created_at: '2026-10-01T00:00:00Z', expires_at: null, revoked_at: null, last_used_at: null })
  beforeEach(() => mocks.mutate.mockClear())

  it('o token do Opex aparece marcado e não pode ser revogado; os outros pedem confirmação', async () => {
    render(<TokensCard tokens={[token('tk_0e000001'), token('tk_0ther001')]} apps={[]} agents={[]} ownTokenId="tk_0e000001" />)
    expect(screen.getAllByText('Este Opex')).toHaveLength(1)
    const revoke = screen.getAllByRole('button', { name: 'Revogar token' })
    expect(revoke[0]!.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(revoke[0]!)
    expect(screen.queryByText(/Revogar o token eng.tk_0e000001/)).toBeNull()
    fireEvent.click(revoke[1]!)
    expect(await screen.findByText('Revogar o token eng.tk_0ther001?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Revogar' }))
    expect(mocks.mutate).toHaveBeenCalledWith('tk_0ther001', expect.anything())
  })

  it('vazio com ação de emitir', () => {
    render(<TokensCard tokens={[]} apps={[]} agents={[]} ownTokenId={null} />)
    expect(screen.getByText('Nenhum token')).toBeTruthy()
  })
})

describe('EnvVarField', () => {
  it('sensíveis: só leitura mostra configurada/não sem campo; só gravar mostra senha vazia', () => {
    render(
      <>
        <EnvVarField entry={{ key: 'TOKEN_PEPPER', kind: 'read-only', configured: true }} value="" dirty={false} onChange={vi.fn()} />
        <EnvVarField entry={{ key: 'LITESTREAM_SECRET_ACCESS_KEY', kind: 'write-only', configured: false }} value="" dirty={false} onChange={vi.fn()} />
      </>,
    )
    expect(document.getElementById('env-TOKEN_PEPPER')).toBeNull()
    expect(screen.getAllByText('Configurada').length).toBe(1)
    const secret = document.getElementById('env-LITESTREAM_SECRET_ACCESS_KEY') as HTMLInputElement
    expect(secret.type).toBe('password')
    expect(secret.value).toBe('')
  })

  it('valida pelo tipo e avisa das variáveis fixadas no compose e da troca de porta', () => {
    const { rerender } = render(<EnvVarField entry={{ key: 'APP_PORT', kind: 'editable', value: '8000' }} value="99999" dirty onChange={vi.fn()} />)
    expect(screen.getByRole('alert').textContent).toBe('Porta de 1 a 65535')
    expect(screen.getByText(/projeto atual é derrubado/)).toBeTruthy()
    rerender(<EnvVarField entry={{ key: 'DATABASE_PATH', kind: 'editable', value: '/data/engramind.db' }} value="/data/engramind.db" dirty={false} onChange={vi.fn()} />)
    expect(screen.getByText(/não chega ao container/)).toBeTruthy()
  })
})

describe('ToolResultAction ("Ver token")', () => {
  const action = { kind: 'reveal-secret' as const, id: 'rv_1234567890', label: 'Ver token', title: 'Token eng.tk_1', expiresAt: new Date(Date.now() + 60_000).toISOString() }

  it('mostra o segredo uma vez; fechado, o card diz que já foi exibido', async () => {
    mocks.reveal = async () => ({ secret: 'eng.tk_1.segredo', title: 'Token eng.tk_1' })
    render(<ToolResultAction action={action} />)
    fireEvent.click(screen.getByRole('button', { name: /Ver token/ }))
    expect(await screen.findByText('eng.tk_1.segredo')).toBeTruthy()
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    await waitFor(() => expect(screen.getByText('Token já exibido.')).toBeTruthy())
  })

  it('já visto ou vencido no servidor orienta revogar e emitir outro', async () => {
    mocks.reveal = async () => {
      throw new Error('Já exibido ou vencido')
    }
    render(<ToolResultAction action={action} />)
    fireEvent.click(screen.getByRole('button', { name: /Ver token/ }))
    expect(await screen.findByText(/revogue e emita outro/)).toBeTruthy()
  })
})

describe('controles do design system', () => {
  const files = (dir: string): string[] => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? files(join(dir, name)) : name.endsWith('.tsx') ? [join(dir, name)] : []))
  it('os componentes do Engramind não usam select nem checkbox nativos nem primitivos sem tema', () => {
    for (const file of files(join(process.cwd(), 'src/features/engramind/components'))) {
      const source = readFileSync(file, 'utf8')
      expect(source, file).not.toMatch(/<select[\s>]/)
      expect(source, file).not.toMatch(/type="checkbox"/)
      expect(source, file).not.toMatch(/@radix-ui\//)
    }
  })
})
