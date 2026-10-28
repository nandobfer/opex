/**
 * Builder Machine (`local-docker`): o build e o container da prévia rodam no Docker de outra máquina
 * (o PC do usuário), alcançada por SSH a partir do host do OpenCode. Configurada e ativada na
 * integração `builder_machine`. Ver `aicontext/modules/builder-machine.md`.
 */

/** Identificador da feature (logs). */
export const LOCAL_DOCKER_FEATURE_ID = "local-docker" as const

/** Integração do catálogo que hospeda a configuração (status, teste, debug e abas). */
export const LOCAL_DOCKER_INTEGRATION_ID = "builder_machine" as const

/** Abas da página da integração, nesta ordem (`?aba=`; a primeira é a padrão). */
export const BUILDER_MACHINE_TABS = ["geral", "tunel", "conexao", "preparo", "docker"] as const
export type BuilderMachineTab = (typeof BUILDER_MACHINE_TABS)[number]

/** Evento em `private-app`: configuração, túnel ou prévias da máquina local mudaram. */
export const LOCAL_DOCKER_UPDATED_EVENT = "local-docker-updated"

export const LOCAL_DOCKER_AUDIT_ENTITY = "MaquinaLocal"

export const LOCAL_DOCKER_QUERY_KEY = "local-docker" as const

/** Arquivos no host do OpenCode (relativos ao `$HOME` do usuário do processo do OpenCode). */
export const LOCAL_DOCKER_PATHS = {
    /** Chave do servidor para entrar no PC (a privada nunca sai do host). */
    key: ".ssh/opex_local_ed25519",
    knownHosts: ".ssh/opex_local_known_hosts",
    /** Socket de controle da conexão mestra do túnel (`ssh -M -S`). */
    control: ".ssh/opex-local.ctl",
    /** O Docker do PC exposto como socket no host. */
    dockerSocket: ".opex-local-docker.sock",
    /** Overrides do compose gerados por prévia no PC (CAs do PC), fora do worktree. */
    composeOverrides: ".opex-local/compose",
} as const

/** Onde o bundle de CAs do PC aparece dentro dos containers da prévia. */
export const LOCAL_DOCKER_CA_TARGET = "/etc/opex/ca-bundle.pem"

/** Variáveis que apontam o runtime (Node, OpenSSL, Python) para o bundle de CAs do PC. */
export const LOCAL_DOCKER_CA_ENV = ["NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "REQUESTS_CA_BUNDLE"] as const

/** Host HTTPS usado para detectar inspeção TLS na rede do PC (emissor do certificado). */
export const LOCAL_DOCKER_TLS_PROBE_HOST = "api.clerk.com"

/** Imagem dos apelidos de rede (repasse TCP do PC para o servidor). */
export const LOCAL_DOCKER_ALIAS_IMAGE = "alpine/socat"

/** Labels dos containers de ambiente criados pelo preparo (só eles são tocados pelo preparo). */
export const LOCAL_DOCKER_LABELS = {
    env: "opex.builder-machine",
    role: "opex.builder-machine.role",
    alias: "opex.builder-machine.alias",
    target: "opex.builder-machine.target",
    network: "opex.builder-machine.network",
} as const

/** Nome do serviço do túnel de controle no WSL. */
export const LOCAL_DOCKER_CONTROL_SERVICE = "opex-control-tunnel"

/** Intervalo mínimo entre conferências automáticas do túnel (rotina do agendador). */
export const LOCAL_DOCKER_HEALTH_INTERVAL_MS = 60_000
