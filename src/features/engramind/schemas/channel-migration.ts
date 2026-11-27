import { z } from "zod"

/** Início/retomada da migração dos nomes dos canais (OPE-206): a direção e, opcionalmente, o script de export do host. */
export const channelMigrationStartSchema = z.object({
    direction: z.enum(["forward", "revert"]),
    scriptPath: z
        .string()
        .trim()
        .max(500)
        .regex(/^\/[A-Za-z0-9._/-]+$/, "Use um caminho absoluto no host, sem espaços nem aspas (ex.: /home/usuario/linux-scripts/export-engramind-memories.mjs)")
        .optional(),
})
export type ChannelMigrationStartInput = z.infer<typeof channelMigrationStartSchema>
