/** @vitest-environment jsdom */
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { EnvironmentSection } from '@/features/agentic/components/central/EnvironmentSection'
import { centralConfigSchema, defaultCentralConfig, type CentralConfigInput, type CentralConfig } from '@/features/agentic/schemas'

vi.mock('framer-motion', async () => (await import('../../helpers/framer-motion')).framerMotionMock())

const refetch = vi.fn()
type BuildersQuery = { data?: unknown; isPending: boolean; isError: boolean; isFetching: boolean; error: unknown; refetch: typeof refetch }
const ready: BuildersQuery = {
  data: {
    current: 'limit-builder',
    builders: [
      { name: 'limit-builder', driver: 'docker-container', status: 'running', current: true, loadsImages: true },
      { name: 'remote', driver: 'docker-container', status: 'inactive', current: false, loadsImages: false },
    ],
  },
  isPending: false,
  isError: false,
  isFetching: false,
  error: null,
  refetch,
}
let buildersQuery: BuildersQuery = ready
vi.mock('@/features/agentic/hooks/useAgentic', () => ({ useDockerBuilders: () => buildersQuery }))

function Harness({ dockerBuilder = '' }: { dockerBuilder?: string }) {
  const base = defaultCentralConfig('/home/u/app')
  const form = useForm<CentralConfigInput, unknown, CentralConfig>({ resolver: zodResolver(centralConfigSchema), mode: 'onChange', defaultValues: { ...base, environment: { ...base.environment, dockerBuilder } } })
  return <EnvironmentSection form={form} centralId="c1" />
}
function BackupHarness() {
  const form = useForm<CentralConfigInput, unknown, CentralConfig>({ resolver: zodResolver(centralConfigSchema), mode: 'onChange', defaultValues: defaultCentralConfig('/home/u/app') })
  const backup = useWatch({ control: form.control, name: 'environment.backupDatabase' })
  return (
    <>
      <EnvironmentSection form={form} centralId="c1" />
      <output data-testid="backup-value">{String(backup)}</output>
    </>
  )
}
afterEach(() => { cleanup(); buildersQuery = ready; refetch.mockReset() })
describe('método da prévia por central', () => {
  it('inicia Local e exibe configuração remota somente ao selecionar GitHub Action', () => {
    render(<Harness />)
    expect(screen.getByRole('radio', { name: 'Local' }).getAttribute('aria-checked')).toBe('true')
    expect(screen.queryByLabelText('Workflow do GitHub')).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: 'GitHub Action' }))
    expect((screen.getByLabelText('Workflow do GitHub') as HTMLInputElement).value).toBe('preview.yml')
    expect((screen.getByLabelText('Serviço do Compose') as HTMLInputElement).value).toBe('app')
    expect(screen.queryByLabelText('Builder do Docker')).toBeNull()
    expect(screen.getByText(/builder é definido pelo workflow do runner/)).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'Local' }))
    expect(screen.queryByLabelText('Workflow do GitHub')).toBeNull()
  })
  it('configuração antiga continua Local', () => {
    const old = defaultCentralConfig('/home/u/app')
    const environment: Partial<typeof old.environment> = { ...old.environment }
    delete environment.previewMethod
    delete environment.githubWorkflow
    delete environment.previewService
    expect(centralConfigSchema.parse({ ...old, environment }).environment.previewMethod).toBe('local')
  })
})

describe('backup do banco de dados (OPE-72)', () => {
  it('nasce ligado e o desligar chega ao valor do formulário', () => {
    render(<BackupHarness />)
    const toggle = screen.getByRole('switch')
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(screen.getByTestId('backup-value').textContent).toBe('true')

    fireEvent.click(toggle)

    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(screen.getByTestId('backup-value').textContent).toBe('false')
    expect(screen.getByTestId('central-env-backup-status').textContent).toBe('Desativado')
  })

  it('configuração antiga (sem o campo) continua com o backup ligado', () => {
    const old = defaultCentralConfig('/home/u/app')
    const environment: Partial<typeof old.environment> = { ...old.environment }
    delete environment.backupDatabase
    expect(centralConfigSchema.parse({ ...old, environment }).environment.backupDatabase).toBe(true)
  })
})

describe('builder do Docker', () => {
  it('lista os builders reais e mantém padrão do host', () => {
    render(<Harness />)
    const trigger = screen.getByLabelText('Builder do Docker')
    expect(trigger.textContent).toContain('Padrão do host')
    fireEvent.click(trigger)
    expect(screen.getByText('hoje: limit-builder')).toBeTruthy()
    expect(screen.getByText('remote')).toBeTruthy()
  })

  it('seleção é incluída no comando sem alterar padrão do host', () => {
    render(<Harness dockerBuilder="remote" />)
    expect(document.body.textContent).toContain('BUILDX_BUILDER=remote PORT=')
    expect(document.body.textContent).toContain('não carrega as imagens no Docker local')
  })

  it('erro ao listar oferece tentar novamente sem perder seleção', () => {
    buildersQuery = { ...ready, data: undefined, isError: true, error: new Error('docker buildx ausente') }
    render(<Harness dockerBuilder="limit-builder" />)
    expect(screen.getByLabelText('Builder do Docker').textContent).toContain('limit-builder')
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    expect(refetch).toHaveBeenCalled()
  })
})
