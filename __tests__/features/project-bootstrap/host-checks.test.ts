import { describe, expect, it } from 'vitest'
import { classifyDirectory, describeMissing, missingDeliverables, verificationCommand } from '@/features/project-bootstrap/host-checks'
import { parseBootstrapResult } from '@/features/project-bootstrap/result'

describe('classifyDirectory', () => {
    it('pasta inexistente ou vazia segue', () => {
        expect(classifyDirectory('STATE=absent', 'org/app').kind).toBe('free')
        expect(classifyDirectory('STATE=empty', 'org/app').kind).toBe('free')
    })

    it('clone do mesmo repositório é reaproveitado', () => {
        expect(classifyDirectory('STATE=git\nORIGIN=git@github.com:Org/App.git', 'org/app').kind).toBe('clone')
    })

    it('outro conteúdo, outro repositório ou saída desconhecida bloqueia com o motivo', () => {
        expect(classifyDirectory('STATE=other', 'org/app')).toMatchObject({ kind: 'blocked', reason: 'A pasta já tem outros arquivos.' })
        expect(classifyDirectory('STATE=git\nORIGIN=https://github.com/org/outro', 'org/app')).toMatchObject({ kind: 'blocked', reason: expect.stringContaining('org/outro') })
        expect(classifyDirectory('', 'org/app').kind).toBe('blocked')
    })
})

describe('conferência do fim da etapa 2', () => {
    const ALL_OK = 'GIT=ok\nORIGIN=git@github.com:Org/App.git\nPUSH=ok\nCLEAN=ok\nENV=ok\nENVIGNORED=ok\nCOMPOSE=ok\nPORT=ok\nPORTFREE=ok'

    it('tudo entregue = nada faltando', () => {
        expect(missingDeliverables(ALL_OK, 'org/app')).toEqual([])
    })

    it('lista cada entrega que faltou (marcador ausente conta como faltando)', () => {
        const output = ALL_OK.replace('PUSH=ok', 'PUSH=missing').replace('PORT=ok', 'PORT=missing').replace('ENV=ok\n', '')
        expect(missingDeliverables(output, 'org/app')).toEqual(['push', 'env', 'port'])
        expect(describeMissing(['port'])).toEqual(['a porta anotada em /home/used_ports com o nome deste projeto (`<porta> -> <repositório>`)'])
    })

    it('remoto de outro repositório (ou sem remoto) não passa', () => {
        expect(missingDeliverables(ALL_OK.replace('Org/App', 'org/outro'), 'org/app')).toEqual(['origin'])
        expect(missingDeliverables(ALL_OK.replace('ORIGIN=git@github.com:Org/App.git', 'ORIGIN='), 'org/app')).toEqual(['origin'])
    })

    it('porta ocupada por outro container ou processo não passa', () => {
        expect(missingDeliverables(ALL_OK.replace('PORTFREE=ok', 'PORTFREE=missing'), 'org/app')).toEqual(['portFree'])
    })

    it('o comando exige a reserva com o nome do projeto, confere quem escuta na porta, tira credenciais do remoto e nunca imprime o .env', () => {
        const command = verificationCommand({ directory: '/home/u/code/app', branch: 'main', port: 4014, project: 'my.app' })
        expect(command).toContain('refs/heads/main')
        // Reserva da porta com o rótulo exato (ponto escapado): uma linha de outro projeto não conta.
        expect(command).toContain("'^[[:space:]]*4014[[:space:]]*->[[:space:]]*my\\.app([[:space:]]|$)'")
        expect(command).toContain('docker ps')
        expect(command).toContain('ss -ltnH')
        expect(command).toContain("sed -E 's#//[^@/]*@#//#'")
        expect(command).not.toMatch(/cat .*\.env/)
    })
})

describe('parseBootstrapResult', () => {
    it('lê o último bloco válido', () => {
        const text = 'feito\n```json bootstrap-result\n{"port":4014,"healthPath":"/api/health","hasServer":true,"usesMongo":false,"branch":"main"}\n```'
        expect(parseBootstrapResult(text)).toEqual({ ok: true, result: { port: 4014, healthPath: '/api/health', hasServer: true, usesMongo: false, branch: 'main' } })
    })

    it('sem bloco = ausente; bloco quebrado = inválido', () => {
        expect(parseBootstrapResult('Qual banco você prefere?')).toEqual({ ok: false, reason: 'missing' })
        expect(parseBootstrapResult('```json bootstrap-result\n{port: 1}\n```')).toMatchObject({ ok: false, reason: 'invalid' })
        expect(parseBootstrapResult('```json bootstrap-result\n{"port":80,"healthPath":"/","hasServer":true,"usesMongo":false,"branch":"main"}\n```')).toMatchObject({ ok: false, reason: 'invalid' })
    })
})
