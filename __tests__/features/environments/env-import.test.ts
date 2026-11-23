import { describe, expect, it } from 'vitest'
import { importSummary, parseEnvText, upsertEnvVars } from '@/features/environments/env-import'

/** Ambientes: importar variáveis (.env ou texto) no formulário — leitura e upsert (OPE-175). */

describe('leitura do conteúdo .env', () => {
  it('CHAVE=VALOR por linha; brancos e comentários ignorados sem contar; # no meio do valor é conteúdo', () => {
    const text = ['# Banco', '   # comentário com espaços', '', 'DATABASE_URL=postgres://u:p@db:5432/app?x=1#frag', '  PORT = 3000  ', 'MSG=olá mundo # não é comentário'].join('\r\n')
    expect(parseEnvText(text)).toEqual({
      entries: [
        { key: 'DATABASE_URL', value: 'postgres://u:p@db:5432/app?x=1#frag' },
        { key: 'PORT', value: '3000' },
        { key: 'MSG', value: 'olá mundo # não é comentário' },
      ],
      ignored: 0,
    })
  })

  it('aspas externas saem e o miolo fica literal; valor vazio é aceito', () => {
    expect(parseEnvText(`A="abc def"\nB='x=$HOME'\nC="sem fim\nD=`).entries).toEqual([
      { key: 'A', value: 'abc def' },
      { key: 'B', value: 'x=$HOME' },
      { key: 'C', value: '"sem fim' },
      { key: 'D', value: '' },
    ])
  })

  it('linha sem = e chave fora do formato do campo Nome contam como ignoradas', () => {
    expect(parseEnvText('SEM_IGUAL\n1ABC=x\nCOM-HIFEN=y\nexport X=1\n=vazio\nOK=1')).toEqual({ entries: [{ key: 'OK', value: '1' }], ignored: 5 })
  })

  it('conteúdo sem nenhuma linha aproveitável', () => {
    expect(parseEnvText('# só comentário\n\n')).toEqual({ entries: [], ignored: 0 })
  })
})

describe('upsert no formulário', () => {
  it('acrescenta as novas, atualiza as existentes e não remove nenhuma', () => {
    const result = upsertEnvVars([{ key: 'TOKEN', value: 'velho' }, { key: 'FICA', value: '1' }], [{ key: 'TOKEN', value: 'novo' }, { key: 'NOVA', value: 'x' }])
    expect(result).toEqual({ next: [{ key: 'TOKEN', value: 'novo' }, { key: 'FICA', value: '1' }, { key: 'NOVA', value: 'x' }], added: 1, updated: 1 })
  })

  it('chave repetida no conteúdo: vale a última e conta como atualizada', () => {
    expect(upsertEnvVars([], parseEnvText('A=1\nA=2').entries)).toEqual({ next: [{ key: 'A', value: '2' }], added: 1, updated: 1 })
  })

  it('importar o mesmo conteúdo duas vezes não duplica (a segunda só atualiza)', () => {
    const { entries } = parseEnvText('A=1\nB=2')
    const first = upsertEnvVars([], entries)
    const second = upsertEnvVars(first.next, entries)
    expect(second).toEqual({ next: first.next, added: 0, updated: 2 })
  })

  it('variável cujo valor salvo não foi lido (keep) passa a valer o importado', () => {
    expect(upsertEnvVars([{ key: 'A', value: '', keep: true }], [{ key: 'A', value: 'x' }]).next).toEqual([{ key: 'A', value: 'x' }])
  })

  it('resumo', () => {
    expect(importSummary({ added: 2, updated: 1, ignored: 3 })).toBe('2 variável(is) adicionada(s), 1 atualizada(s), 3 linha(s) ignorada(s)')
  })
})
