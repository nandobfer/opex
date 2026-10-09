import { describe, it, expect } from 'vitest'
import { snapshotForAudit } from '@/lib/db/utils/auditSnapshot'

describe('snapshotForAudit', () => {
    it('retorna undefined para null ou undefined', () => {
        expect(snapshotForAudit(null)).toBeUndefined()
        expect(snapshotForAudit(undefined)).toBeUndefined()
    })

    it('exclui campos não-domínio do snapshot (lean object)', () => {
        const doc = {
            _id: 'abc',
            __v: 0,
            _auditContext: { userId: 'u1' },
            createdBy: 'u1',
            createdAt: new Date('2026-01-01'),
            updatedBy: 'u2',
            updatedAt: new Date('2026-01-02'),
            id: 'virtual-abc',
            product: 'SOJA',
            value: 42,
        }

        const snap = snapshotForAudit(doc)

        expect(snap).toEqual({ product: 'SOJA', value: 42 })
    })

    it('preserva todos os campos de domínio (lean object com vários campos)', () => {
        const doc = {
            _id: 'x',
            branchId: 'b1',
            premiumId: 'p1',
            product: 'SOJA',
            contractType: 'CIF',
            elevation: 10,
            railwayCost: 5,
            externalCosts: 3,
            targetMargin: 2,
            freightOrigin: 100,
            suggestedPrice: 250,
        }

        const snap = snapshotForAudit(doc)

        expect(snap).toMatchObject({
            branchId: 'b1',
            premiumId: 'p1',
            product: 'SOJA',
            contractType: 'CIF',
            elevation: 10,
            railwayCost: 5,
            externalCosts: 3,
            targetMargin: 2,
            freightOrigin: 100,
            suggestedPrice: 250,
        })
        expect(snap).not.toHaveProperty('_id')
    })

    it('chama toObject quando documento é hydrated (Mongoose-like)', () => {
        const doc = {
            toObject: () => ({ _id: 'h1', product: 'MILHO', value: 7, createdBy: 'u' }),
        }

        const snap = snapshotForAudit(doc as never)

        expect(snap).toEqual({ product: 'MILHO', value: 7 })
    })

    it('respeita allowList quando fornecida', () => {
        const doc = { product: 'SOJA', value: 10, extra: 'noise', createdBy: 'u' }

        const snap = snapshotForAudit(doc, ['product', 'value'])

        expect(snap).toEqual({ product: 'SOJA', value: 10 })
    })

    it('allowList ignora campos ausentes no doc', () => {
        const doc = { product: 'SOJA' }

        const snap = snapshotForAudit(doc, ['product', 'value'])

        expect(snap).toEqual({ product: 'SOJA' })
    })
})
