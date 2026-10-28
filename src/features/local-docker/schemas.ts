import { z } from "zod"

/** Nomes de usuário, host, contexto, builder, rede e apelidos entram em comandos: só caracteres seguros. */
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const HOST = /^[A-Za-z0-9][A-Za-z0-9.-]*$/
const SSH_HOST = /^[A-Za-z0-9][A-Za-z0-9._@-]*$/
/** Caminho absoluto de arquivo no PC (entra em comandos e no override do compose). */
const ABSOLUTE_PATH = /^\/[A-Za-z0-9._/-]+$/

const port = (label: string) =>
    z
        .number({ error: "Informe um número" })
        .int("Use um número inteiro")
        .min(1, `${label}: mínimo 1`)
        .max(65535, `${label}: máximo 65535`)

const safeName = (label: string) => z.string().trim().min(1, `Informe ${label}`).max(64, "Máximo de 64 caracteres").regex(SAFE_NAME, "Use letras, números, ponto, hífen ou sublinhado")

/** Limite opcional (vazio = sem limite): número positivo com até `max`. */
const optionalLimit = (label: string, max: number) =>
    z
        .number({ error: "Informe um número" })
        .positive(`${label}: maior que zero`)
        .max(max, `${label}: máximo ${max}`)
        .nullable()

export const LOCAL_DOCKER_MODES = ["reverse", "direct"] as const
export type LocalDockerMode = (typeof LOCAL_DOCKER_MODES)[number]

export const localDockerAliasSchema = z.object({
    name: safeName("o nome do apelido"),
    port: port("Porta"),
})
export type LocalDockerAlias = z.infer<typeof localDockerAliasSchema>

export const localDockerSettingsSchema = z
    .object({
        /** Túnel aberto = as prévias vão para o PC (cada central pode sobrescrever). */
        useWhenOpen: z.boolean(),
        /** `reverse`: pelo túnel de controle que o PC mantém aberto; `direct`: pelo IP do PC. */
        mode: z.enum(LOCAL_DOCKER_MODES),
        pcHost: z.string().trim().max(200).refine((value) => value === "" || HOST.test(value), "Informe só o IP ou o nome do PC"),
        pcSshPort: port("Porta SSH do PC"),
        pcUser: z.string().trim().min(1, "Informe o usuário do WSL (ex.: alfredopetri)").max(64).refine((value) => value === "" || SAFE_NAME.test(value), "Informe só o usuário (ex.: alfredopetri)"),
        /** Porta do servidor em que o túnel de controle publica o SSH do PC. */
        controlPort: port("Porta do túnel de controle").min(1024, "Porta do túnel de controle: mínimo 1024"),
        /** Como o PC chama o servidor no SSH (alias do `~/.ssh/config` do WSL ou usuário@host). */
        serverSshHost: z.string().trim().max(200).refine((value) => value === "" || SSH_HOST.test(value), "Use o alias do ~/.ssh/config (ex.: dev-server) ou usuário@host"),
        /** Endereço do servidor visto pelo PC (destino dos apelidos de rede). */
        serverAddress: z.string().trim().max(200).refine((value) => value === "" || HOST.test(value), "Informe só o IP ou o nome do servidor"),
        contextName: safeName("o nome do contexto"),
        builderName: safeName("o nome do builder"),
        /** Memória máxima do builder dedicado, em GiB (`null` = sem limite). */
        builderMemoryGb: optionalLimit("Memória do builder", 512),
        /** CPUs do builder dedicado (fração permitida, ex.: 2.5; `null` = sem limite). */
        builderCpus: optionalLimit("CPUs do builder", 256),
        /** Teto do cache do builder mantido pela rotina de limpeza, em GB. */
        builderCacheKeepGb: z.number({ error: "Informe um número" }).int("Use um número inteiro").min(1, "Cache do builder: mínimo 1 GB").max(2048, "Cache do builder: máximo 2048 GB"),
        network: safeName("a rede"),
        /** Prefixo do nome dos containers dos apelidos no PC (ex.: `opex-alias-` → `opex-alias-devteam-mongo`). */
        aliasPrefix: z.string().trim().min(1, "Informe o prefixo").max(40, "Máximo de 40 caracteres").regex(SAFE_NAME, "Use letras, números, ponto, hífen ou sublinhado"),
        aliases: z.array(localDockerAliasSchema).max(20, "Até 20 apelidos"),
        /** Monta o bundle de CAs do PC nas prévias (redes com inspeção TLS, ex.: FortiGate). */
        trustPcCertificates: z.boolean(),
        /** Bundle de CAs no PC (WSL) montado nas prévias. */
        pcCaBundlePath: z.string().trim().min(1, "Informe o caminho do bundle de CAs").max(300, "Máximo de 300 caracteres").regex(ABSOLUTE_PATH, "Use um caminho absoluto (ex.: /etc/ssl/certs/ca-certificates.crt)"),
    })
    .superRefine((value, ctx) => {
        if (value.mode === "direct" && !value.pcHost) ctx.addIssue({ code: "custom", path: ["pcHost"], message: "Informe o IP do PC para a conexão direta" })
        if (value.mode === "reverse" && !value.serverSshHost) ctx.addIssue({ code: "custom", path: ["serverSshHost"], message: "Informe como o PC acessa o servidor" })
        if (value.aliases.length > 0 && !value.serverAddress) ctx.addIssue({ code: "custom", path: ["serverAddress"], message: "Informe o endereço do servidor (destino dos apelidos de rede)" })
        const seen = new Set<string>()
        value.aliases.forEach((alias, index) => {
            if (seen.has(alias.name)) ctx.addIssue({ code: "custom", path: ["aliases", index, "name"], message: "Apelido repetido" })
            seen.add(alias.name)
        })
    })
export type LocalDockerSettings = z.infer<typeof localDockerSettingsSchema>

export const DEFAULT_LOCAL_DOCKER_SETTINGS: LocalDockerSettings = {
    useWhenOpen: true,
    mode: "reverse",
    pcHost: "",
    pcSshPort: 22,
    pcUser: "",
    controlPort: 2222,
    serverSshHost: "dev-server",
    serverAddress: "",
    contextName: "opex-local",
    builderName: "opex-local-builder",
    builderMemoryGb: null,
    builderCpus: null,
    builderCacheKeepGb: 20,
    network: "docker_default",
    aliasPrefix: "opex-alias-",
    aliases: [
        { name: "devteam-mongo", port: 27017 },
        { name: "devteam-soketi", port: 6001 },
    ],
    trustPcCertificates: true,
    pcCaBundlePath: "/etc/ssl/certs/ca-certificates.crt",
}

export const localDockerTunnelActionSchema = z.object({
    action: z.enum(["open", "close"]),
    /** Fechar com prévias no ar no PC exige confirmação explícita. */
    confirm: z.boolean().optional(),
})
export type LocalDockerTunnelAction = z.infer<typeof localDockerTunnelActionSchema>

export const LOCAL_DOCKER_MACHINE_ACTIONS = ["test", "prepare"] as const
export const localDockerMachineActionSchema = z.object({ action: z.enum(LOCAL_DOCKER_MACHINE_ACTIONS) })
export type LocalDockerMachineAction = (typeof LOCAL_DOCKER_MACHINE_ACTIONS)[number]

/** Chave do servidor: gerar uma nova no host ou colar uma chave privada OpenSSH existente. */
export const localDockerKeyActionSchema = z.discriminatedUnion("action", [
    z.object({ action: z.literal("generate") }),
    z.object({
        action: z.literal("import"),
        privateKey: z
            .string()
            .trim()
            .min(1, "Cole a chave privada")
            .max(20_000, "Chave grande demais")
            .refine((value) => /^-----BEGIN (OPENSSH|RSA|EC) PRIVATE KEY-----[\s\S]+-----END (OPENSSH|RSA|EC) PRIVATE KEY-----$/.test(value), "Cole a chave privada completa (de -----BEGIN … PRIVATE KEY----- até -----END … PRIVATE KEY-----)"),
    }),
])
export type LocalDockerKeyAction = z.infer<typeof localDockerKeyActionSchema>

/** Ações por container (aba Túnel): levantar, derrubar, recriar e apagar com o ambiente. */
export const LOCAL_DOCKER_CONTAINER_ACTIONS = ["start", "stop", "recreate", "delete"] as const
export type LocalDockerContainerAction = (typeof LOCAL_DOCKER_CONTAINER_ACTIONS)[number]
export const localDockerContainerActionSchema = z.object({
    action: z.enum(LOCAL_DOCKER_CONTAINER_ACTIONS),
    /** Apagar é destrutivo: exige confirmação explícita. */
    confirm: z.boolean().optional(),
})

export const LOCAL_DOCKER_OVERRIDE_MODES = ["inherit", "on", "off"] as const
export type LocalDockerOverrideMode = (typeof LOCAL_DOCKER_OVERRIDE_MODES)[number]
export const localDockerOverrideSchema = z.object({ mode: z.enum(LOCAL_DOCKER_OVERRIDE_MODES) })

export const localDockerBootstrapQuerySchema = z.object({
    /** Inclui no script o networking espelhado do WSL (necessário na conexão direta pelo IP). */
    mirrored: z.enum(["0", "1"]).optional(),
})
