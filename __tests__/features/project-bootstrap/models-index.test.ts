import { describe, expect, it } from 'vitest'
import { ProjectBootstrap } from '@/features/project-bootstrap/server/models'

describe('ProjectBootstrap: trava de um bootstrap aberto por repositório', () => {
    it('declara o índice único parcial em activeRepo (só valores string contam)', () => {
        const index = ProjectBootstrap.schema.indexes().find(([fields]) => 'activeRepo' in fields)
        expect(index).toEqual([{ activeRepo: 1 }, expect.objectContaining({ unique: true, partialFilterExpression: { activeRepo: { $type: 'string' } } })])
    })
})
