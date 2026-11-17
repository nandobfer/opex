import { z } from "zod"

/**
 * Respostas da API do Console do OpenCode Go (interna, não documentada): só os campos usados. O `z.object`
 * descarta o resto — inclusive os dados de pagamento do `go/status` (`subscriberUserId`, `paymentMethodId`,
 * `paymentMethodKind`, `upgradePrice`, `teamsUpgradePrice`, `nextPeriodPaid`, `useBalance`…).
 * Os valores em micro-cents chegam como string.
 */

const micro = z.coerce.number().finite().nonnegative()
const instant = z.iso.datetime({ offset: true })

const meterSchema = z.object({
    resetsAt: instant.nullish(),
    limitMicroCents: z.coerce.number().finite().positive(),
    usedMicroCents: micro,
})

export const goStatusSchema = z.object({
    product: z.string().min(1),
    access: z.object({
        startsAt: instant,
        endsAt: instant,
        meters: z.object({ fiveHour: meterSchema, week: meterSchema, month: meterSchema }),
    }),
})
export type GoStatus = z.infer<typeof goStatusSchema>

export const goModelsPageSchema = z.object({
    items: z.array(z.object({ model: z.string().min(1), totalCostMicroCents: micro })),
    pageInfo: z.object({ page: z.coerce.number(), pageCount: z.coerce.number() }).optional(),
})

export const goCostByDaySchema = z.array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), totalCostMicroCents: micro }))
