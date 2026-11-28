import { BOOTSTRAP_DEPLOY_LOG_TAIL, USED_PORTS_FILE } from "./constants"
import { BOOTSTRAP_RESULT_EXAMPLE } from "./result"

/**
 * Textos enviados ao Agente de Bootstrap (módulo puro): as instruções duráveis da sessão e os prompts
 * de cada momento (início, nova tentativa, conferência com pendências e deploy com falha).
 */

export interface BootstrapPromptInput {
    repo: string
    owner: string
    name: string
    visibility: "private" | "public"
    mode: "new" | "existing"
    /** Branch do push: a padrão do repositório existente ou `main`. */
    branch: string
    directory: string
    context: string
    technologies: readonly { name: string; group: string }[]
    skills: readonly string[]
    instructions: string
}

export function buildBootstrapInstructions(input: BootstrapPromptInput): string {
    const repoLine =
        input.mode === "new"
            ? `- Crie o repositório ${input.owner}/${input.name} no GitHub como ${input.visibility === "private" ? "PRIVADO" : "PÚBLICO"} (\`gh repo create ${input.owner}/${input.name} --${input.visibility}\`) e use a branch \`main\`.`
            : `- O repositório ${input.owner}/${input.name} JÁ EXISTE no GitHub: use-o (não crie outro) e trabalhe na branch padrão \`${input.branch}\`. Mantenha o que já existe, crie só o que falta e PERGUNTE antes de alterar qualquer arquivo existente.`
    const skills = input.skills.length ? input.skills.map((skill) => `\`${skill}\``).join(", ") : null
    return [
        "Você é o Agente de Bootstrap do Opex. Seu trabalho é provisionar, do zero, o ambiente de um projeto novo NESTE host, usando a infraestrutura local de containers (Docker rootless, bancos e serviços compartilhados).",
        "Escreva em português do Brasil. Seja direto e mostre o que está fazendo.",
        "",
        ...projectSection(input),
        "## Repositório e pasta",
        `- Repositório: ${input.owner}/${input.name} (${input.mode === "new" ? "novo" : "existente"}).`,
        `- Diretório no host: \`${input.directory}\` (crie-o se não existir; se já for um clone deste repositório, reaproveite).`,
        repoLine,
        "",
        "## Antes de começar",
        "- Rode `gh auth status`: a conta precisa poder criar e enviar para o repositório acima. Se for outra conta ou faltar permissão na organização, PERGUNTE ao dono antes de seguir.",
        "- Confira os containers em execução (`docker ps`) para descobrir os bancos e serviços compartilhados (MongoDB, PostgreSQL, MySQL, Redis, MinIO, Soketi, Gotenberg…) e as redes Docker deles. Proponha os que o projeto vai usar e CONFIRME com o dono.",
        "- Pergunte o que faltar de informação usando a ferramenta de perguntas (formulário). Não invente requisitos.",
        skills ? `- Use as skills ${skills}: carregue cada uma quando chegar a parte correspondente e siga o que ela manda.` : "",
        "",
        "## Entregas (literalmente só o bootstrap)",
        "1. `AGENTS.md`, `README.md` e o diretório `aicontext/` com os primeiros arquivos de contexto padrão.",
        "2. O primeiro bloco de código, só o suficiente para estar \"no ar\": no servidor, apenas uma rota de health check; no frontend, apenas a página de entrada.",
        "3. `Dockerfile`, `docker-compose.yml` (na raiz, com as redes mínimas dos serviços compartilhados usados) e o manifesto da linguagem (`package.json`, `Cargo.toml`…).",
        `4. Uma porta livre: confira ${USED_PORTS_FILE}, as portas escutando e as publicadas pelo Docker; anote a escolhida em ${USED_PORTS_FILE} no formato \`<porta> -> <projeto>\`.`,
        "5. `.env` inicial (ignorado pelo git no `.gitignore`) e `.env.example` (sem segredos).",
        "6. Os usuários/bancos exclusivos do projeto nos serviços compartilhados, quando precisar, já configurados no `.env`.",
        `7. Commit de tudo e push na branch \`${input.branch}\` (a árvore do git deve terminar limpa).`,
        "",
        "## Regras",
        "- Nunca mostre o conteúdo do `.env`, senhas ou tokens na conversa.",
        "- Não suba o ambiente com `docker compose up`: o Opex faz o deploy depois que você terminar.",
        "- O Opex confere no host, ao fim: o push na branch, a árvore limpa, o `.env` (e que ele é ignorado), o `docker-compose.yml` e a porta anotada.",
        "",
        "## Resumo final (obrigatório)",
        "Só quando TODAS as entregas estiverem prontas e enviadas, termine a resposta com este bloco (JSON válido, sem comentários):",
        BOOTSTRAP_RESULT_EXAMPLE,
        "- `port`: a porta anotada; `healthPath`: a rota de health check (ou `/` quando só há frontend); `hasServer`: se há servidor; `usesMongo`: se o projeto usa MongoDB; `branch`: a branch do push.",
        "- Se precisar de uma resposta do dono, pergunte e encerre o turno SEM o bloco.",
        input.instructions.trim() ? `\n## Instruções adicionais do dono\n${input.instructions.trim()}` : "",
    ]
        .filter((line, index, all) => line !== "" || all[index - 1] !== "")
        .join("\n")
}

const techLines = (technologies: BootstrapPromptInput["technologies"]) => (technologies.length ? technologies.map((tech) => `- ${tech.name} (${tech.group})`).join("\n") : "- (nenhuma reconhecida no texto: deduza do contexto e confirme)")

/**
 * Contexto do dono e tecnologias reconhecidas: vão nas instruções duráveis da sessão (valem em toda
 * tentativa, inclusive numa sessão nova depois de um primeiro turno que nem chegou ao agente).
 */
function projectSection(input: Pick<BootstrapPromptInput, "context" | "technologies">): string[] {
    return ["## Contexto do projeto (escrito pelo dono)", input.context.trim() || "(sem contexto)", "", "## Tecnologias reconhecidas", techLines(input.technologies), ""]
}

export function buildBootstrapPrompt(input: Pick<BootstrapPromptInput, "owner" | "name" | "context" | "technologies">): string {
    return [`Provisione o projeto ${input.owner}/${input.name}.`, "", ...projectSection(input), "Comece pelas conferências de \"Antes de começar\"."].join("\n")
}

export function buildMissingPrompt(missing: readonly string[]): string {
    return ["A conferência do Opex no host encontrou pendências:", ...missing.map((item) => `- falta ${item}`), "", "Complete o que faltou, faça o push e termine com o bloco `bootstrap-result`."].join("\n")
}

export function buildResumePrompt(error: string | null): string {
    return [
        "Continue o bootstrap de onde parou, na mesma conversa.",
        error ? `A última tentativa terminou com: ${error}` : "",
        "Quando todas as entregas estiverem prontas e enviadas, termine com o bloco `bootstrap-result`.",
    ]
        .filter(Boolean)
        .join("\n")
}

export function buildCompletePrompt(): string {
    return "Você encerrou o turno sem o bloco `bootstrap-result`. Se ainda falta algo, conclua as entregas; se já terminou, confira o push e termine com o bloco."
}

/** Fim do log, sem quebrar no meio de uma linha. */
export function tailLog(log: string, max = BOOTSTRAP_DEPLOY_LOG_TAIL): string {
    if (log.length <= max) return log
    const cut = log.slice(-max)
    const newline = cut.indexOf("\n")
    return newline >= 0 && newline < cut.length - 1 ? cut.slice(newline + 1) : cut
}

export function buildDeployFailedPrompt(input: { attempt: number; error: string | null; log: string }): string {
    return [
        `O deploy do ambiente pelo Opex FALHOU (tentativa ${input.attempt - 1}). Corrija o projeto para o build e o deploy passarem.`,
        input.error ? `Erro: ${input.error}` : "",
        "",
        "Fim do log do deploy:",
        "```",
        tailLog(input.log).trim() || "(sem log)",
        "```",
        "",
        "Depois de corrigir, faça commit e push e termine com o bloco `bootstrap-result` (o Opex confere de novo e refaz o deploy).",
    ]
        .filter((line, index) => line !== "" || index > 0)
        .join("\n")
}
