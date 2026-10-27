import { describe, expect, it } from 'vitest'
import { ADVERSARIAL_SESSION_PERMISSIONS, decidePermission, isDeniedCommand } from '@/features/adversarial-agent/permission-policy'

describe('política de permissões do agente adversário', () => {
  it('nega testes, build, typecheck, lint, instalação e escrita no git', () => {
    for (const command of ['pnpm test', 'npx vitest run a.test.ts', 'tsc --noEmit', 'eslint src', 'npm install', 'docker compose up', 'git commit -m x', 'git push', 'rm -rf src', 'cd app && pnpm run build', 'NODE_ENV=test vitest']) {
      expect(isDeniedCommand(command), command).toBe(true)
    }
  })

  it('libera a leitura do repositório', () => {
    for (const command of ['git diff origin/main...HEAD', 'git -C /w status --short', 'git log --oneline -5', 'rg "foo" src', 'cat src/a.ts', 'ls -la']) {
      expect(isDeniedCommand(command), command).toBe(false)
    }
  })

  it('decide os pedidos: escrita e comandos proibidos são negados; leitura é aprovada', () => {
    expect(decidePermission({ action: 'edit', resources: ['src/a.ts'] })).toBe('reject')
    expect(decidePermission({ action: 'task', resources: ['*'] })).toBe('reject')
    expect(decidePermission({ action: 'bash', resources: ['pnpm vitest'] })).toBe('reject')
    expect(decidePermission({ action: 'bash', resources: ['git diff HEAD'] })).toBe('once')
    expect(decidePermission({ action: 'read', resources: ['src/a.ts'] })).toBe('once')
  })

  it('regras da sessão: nega edição e subagentes; os comandos proibidos vêm depois da liberação geral', () => {
    expect(ADVERSARIAL_SESSION_PERMISSIONS.slice(0, 3)).toEqual([
      { action: 'edit', resource: '*', effect: 'deny' },
      { action: 'task', resource: '*', effect: 'deny' },
      { action: 'bash', resource: '*', effect: 'allow' },
    ])
    expect(ADVERSARIAL_SESSION_PERMISSIONS.slice(3).every((rule) => rule.action === 'bash' && rule.effect === 'deny')).toBe(true)
  })
})
