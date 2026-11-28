# Módulo: Serviço e recursos do OpenCode (OPE-95)

Gerencia o servidor OpenCode pela página do provedor (`/integracoes/ia/opencode`) e pelo Agente Opex:
a aba **Controles** cuida do serviço (status, logs, iniciar/parar/reiniciar/atualizar, backups) e as
abas **Skills**, **Agentes**, **Comandos**, **Plugins** e **MCPs** cuidam dos recursos. Código em
`src/features/opencode-service/` (serviço) e `src/features/opencode-resources/` (recursos).

## Onde as coisas rodam

- O servidor do app roda num container **sem o disco do host**. Arquivos do host são lidos e gravados
  pela API do OpenCode (`file.read`/`file.write`, caminhos absolutos) e os comandos (`find`, `mv`,
  `tar`, `npx skills`, inspector de MCP) vão pelo `shell` do OpenCode (`createHostRunner`, debug na
  integração `ai_opencode`). Comandos vêm só de funções puras (`opencode-resources/commands.ts`,
  `opencode-service/commands.ts`) com todo valor variável entre aspas (`quote`); nunca texto livre.
- **⚠️ Exceção arquitetural (SSH)**: o ciclo de vida do serviço (iniciar, parar, reiniciar, atualizar,
  status com o serviço parado e logs) usa **SSH do servidor do app até o host** (`ssh2`,
  `opencode-service/server/ssh.ts`), porque com o serviço parado o shell do OpenCode não existe. Só
  comandos fixos (`opencode service start|stop|restart`, `opencode upgrade <versão> && service restart`,
  `pgrep`, `ps`, `tail` do log). A chave do host **sempre** é conferida pela impressão digital
  confiada (`sshHostFingerprint`); chave diferente → 409 `OPENCODE_SSH_HOST_KEY_MISMATCH`.
  Chave privada que o `ssh2` não consegue ler (mal formatada ou protegida por senha) → 422
  `OPENCODE_SSH_KEY_INVALID` ("Chave privada SSH inválida ou protegida por senha: … Use uma chave sem
  senha na integração OpenCode"; OPE-141, porte do my-tasks), em vez de uma falha sem explicação.

## Configuração (aba Configuração do OpenCode)

Campos da integração `ai_opencode` (sem `env`): **Host SSH** (vazio = host da URL), **Porta SSH**
(22), **Usuário SSH**, **Executável do opencode** (vazio = detectado com `command -v opencode` pelo
shell do OpenCode enquanto ele está no ar e gravado no campo) e **Impressão digital do host SSH**
(gravada pelo "Confiar"; limpar para confiar de novo). Segredo **Chave privada SSH** (`multiline`:
área de texto mascarada; OpenSSH/PEM sem senha).

## Aba Controles (`OpencodeControlsTab`)

- **Serviço do OpenCode**: estado (Em execução / Parado / Sem resposta / Indisponível), versão, porta,
  tempo no ar (`ps -o etimes`), PID, versão disponível e a última operação. Estado: API no ar
  (`server.info`) → em execução; senão, com SSH confiado, `pgrep` decide entre parado e sem resposta.
- **Ações** (por SSH, só com o acesso confiado): **Iniciar**, **Parar**, **Reiniciar serviço** e
  **Atualizar OpenCode**. Parar, reiniciar e atualizar pedem confirmação, com o **impacto**: mesas
  (`agentic_workbenches.runState = running`) e refinamentos (`task_refinements.runState = running`)
  que serão interrompidos.
- **Atualizar**: versão disponível pelo npm (`@opencode/cli`). Sem pedido vai para a **última 2.x**
  (o Opex usa `@opencode/client` 2.x; desde a OPE-216, host e cliente na **2.4.2**, que trazem a API de jobs
  `experimental.job` usada para esperar subagentes e comandos em segundo plano — ver
  `modules/agentic-dev.md`, "Subagentes e trabalho em segundo plano"). Uma major nova (3.x+) aparece como botão próprio e exige
  confirmação extra (`allowMajor`) sobre possível incompatibilidade. Roda em segundo plano. Sem
  resposta do npm, o botão continua visível e desabilitado, com o motivo.
- **Operações** (`opencode_service_operations`, modelo `OpencodeServiceOperation`): uma por vez (409
  `OPENCODE_OPERATION_RUNNING`; a vaga é reservada em memória antes de qualquer consulta, então duas
  chamadas simultâneas — duplo clique, tela e agente — nunca passam juntas), com ação, situação (`running`/`succeeded`/`failed`/`interrupted`),
  versões de/para, fim da saída, erro, origem (`ui`/`opex-agent`) e sessão do agente. Depois do
  comando, espera a API voltar (ou parar) por até 45 s. A operação `running` que não é deste processo
  (o Opex reiniciou) vira **interrompida** na próxima leitura. A tela consulta a cada 3 s enquanto há
  operação em andamento.
- **Acesso SSH ao host**: mostra usuário@host:porta, executável e a impressão digital confiada; sem
  ela, **Ler chave do host** mostra a impressão digital apresentada e **Confiar** grava (o servidor
  confere de novo que é a mesma).
- **Logs recentes**: 50/200/300 linhas do fim de `~/.local/share/opencode/log/opencode.log` (por SSH;
  sem SSH, pelo shell do OpenCode), sem cores ANSI e com linhas que parecem segredo omitidas;
  Atualizar e Copiar.
- **Backups da configuração**: lista e **Restaurar** (confirmação).

## Recursos (abas Skills, Agentes, Comandos, Plugins e MCPs)

Esqueleto único (`OpencodeResourceCard` + `OpencodeResourceTab`): **escopo** (Global ou o diretório
das sessões de cada **central**), busca por nome (fuse.js), filtro Todos/Ligados/Desligados/Com
atualização, lista virtualizada acima de 50 (`VirtualizedRows`), linha com selos (origem, situação do
MCP, versão instalada → disponível), **Switch** de ligar/desligar (otimista, reversão com toast) e menu
(Editar, Atualizar, Testar conexão, Excluir/Desinstalar/Remover com confirmação). "Atualizar todos (N)"
lista o que muda e pede confirmação; em massa entram só os itens **ligados** e desatualizados (os
desligados ficam como estão), e o resultado informa só o que foi de fato atualizado. Com alterações não salvas na Configuração, pede para salvar.

**Referência para as Skills do Agente Opex (OPE-153).** As peças genéricas da aba foram extraídas para
`src/components/resources/` e esta aba passou a usá-las: `ResourceListCard` (cabeçalho, busca, filtro,
lista virtualizada e estados; o escopo entra pelo `toolbar`), `ResourceListSkeleton`, `ResourceRowFrame`
(+ `ResourceVersionText`; o `ResourceRow` monta selos e ações), `MarkdownResourceFields` (nome, descrição
e corpo; o `MarkdownResourceForm` acrescenta os campos de agente/comando) e `ResourceSourceField` (origem
da instalação). A seção Skills do Agente Opex (`aicontext/modules/opex-agent.md`, "Skills") é montada com
as mesmas peças. O helper de leitura do GitHub com o modo anônimo (`githubGetWithPublicFallback`,
`src/features/github/client.ts`) é o mesmo da verificação de hash das skills daqui (`versions.ts`, com
fallback em qualquer erro) e da instalação de skills do Opex (fallback só sem token cadastrado).

**Reuso da listagem do host.** O editor do agente rotineiro (motor OpenCode) lista as skills
selecionáveis pela mesma `listResources("skill", "global")` desta aba (`GET
/api/routine-agents/opencode-options`, campo `skills`: globais ligadas + nativas, com `native`), e a
execução bloqueia as não selecionadas pela permissão `skill` da sessão (`aicontext/modules/routine-agents.md`).

| Tipo | Lista | Criar/editar | Ligar/desligar | Instalar / atualizar |
|---|---|---|---|---|
| Skills | Pastas com `SKILL.md` em `~/.agents/skills`, `~/.config/opencode/skills`… (projeto: `<dir>/.agents/skills`, `<dir>/.opencode/skills`) + nativas (`/builtin`, só leitura) | Frontmatter `name` (= pasta) + `description` e o corpo; criadas em `~/.agents/skills/<nome>` | Pasta movida para `.opex-disabled` | `npx skills add <repo> -s … -g -y` (projeto: no diretório) / `npx skills update`; versão = `skillFolderHash` do lock x SHA da pasta no GitHub |
| Agentes | `.md` em `agents/` (ou `agent/`) + `agents.<nome>` do JSON + nativos/de plugins (só leitura) | Frontmatter (`description`, `mode`, `model`…) + prompt; os do JSON pelo editor de JSON | Arquivo movido / entrada guardada no manifesto | — |
| Comandos | `.md` em `commands/` + `commands.<nome>` do JSON + nativos/de plugins | Frontmatter (`description`, `agent`, `model`, `subtask`) + template | Igual aos agentes | — |
| Plugins | Lista `plugins` (ou `plugin`) do JSON + locais (só leitura) | — | Entrada guardada no manifesto | Entra na lista / `plugin.update`; versão por `plugin.check` + npm. **Vale depois de reiniciar o serviço** (`restartRequired`) |
| MCPs | `mcp.servers.<nome>` (ou `mcp.<nome>`, 1.x) + situação por `mcp.list` | Local (comando, diretório, variáveis) ou remoto (URL, cabeçalhos) | Campo `disabled`/`enabled` do próprio OpenCode | Pacote npm (versão mais recente fixada: `npx -y pkg@x.y.z`) ou `github:dono/repo`; atualizar reescreve a versão fixada |

- **Validação antes de salvar**: schemas Zod de `schemas.ts` (os mesmos na tela, nas rotas e nas
  ferramentas): frontmatter com YAML válido, campos do tipo e `name` da skill igual à pasta; JSON do
  config pelo schema do tipo; JSONC lido com `jsonc-parser` (erro com linha e coluna → 422
  `OPENCODE_CONFIG_INVALID`). Chaves desconhecidas do frontmatter são preservadas.
- **Gravação**: `opencode.jsonc` editado com `jsonc-parser` (comentários preservados) no formato que o
  arquivo já usa (1.x ou 2.x). Depois de gravar, `config.get` confere; se o OpenCode recusar, a
  alteração é **desfeita pelo backup** (422 `OPENCODE_CONFIG_REJECTED`). Então `location.reload`,
  cache do catálogo limpo (agentes e skills, também usado pelo Refinar tarefa), auditoria e Pusher.
- **Ligar/desligar sem remover**: o manifesto `~/.config/opencode/.opex-disabled/manifest.json` (no
  host) guarda o caminho original ou a entrada do JSON removida; sobrevive à perda do banco do Opex.
- **Editores**: sempre abrem com o conteúdo atual do host (o detalhe não fica em cache; o carregando
  aparece só até a primeira busca ao abrir — buscas seguintes, como depois de um salvar recusado,
  mantêm o formulário e o que foi digitado). Se o detalhe falhar, o diálogo mostra o erro com Tentar novamente
  e nenhum formulário (abrir vazio sobrescreveria o item salvo). No MCP, o comando é exibido com aspas
  duplas quando preciso (`\"` e `\\` escapados) e lido de volta igual; o `timeout` do arquivo, que o
  formulário não edita, é mantido ao salvar (também pelo Agente Opex).
- **Origem da instalação**: sem espaços nem caracteres especiais e começando por letra, número, `@` ou
  `.` (nunca `-`, que viraria opção do `npx`/`skills add`) — o mesmo schema na tela, na rota e na
  ferramenta do agente.
- **Segredos dos MCPs**: valores de `environment`/`headers` nunca saem do servidor (DTO só com os
  nomes; tela mostra "••••"). No formulário, valor vazio numa variável existente mantém o atual;
  remover a linha apaga. Auditoria, logs e eventos sem valores.
- **OAuth dos MCPs remotos (OPE-176)**: o editor do MCP remoto escolhe a **Autenticação** (`OptionTabs`):
  - **Nenhuma** / **Cabeçalhos**: sem a chave `oauth` (padrão do OpenCode, que tenta OAuth sozinho quando
    o servidor responde 401); a caixa **"Não tentar OAuth automaticamente"** grava `oauth: false` (um
    `oauth: false` já existente é mantido). A lista de cabeçalhos vale em Cabeçalhos e em OAuth; "Nenhuma" grava a entrada sem cabeçalhos.
  - **OAuth**: grava a chave `oauth` do OpenCode 2.x (`client_id`, `client_secret`, `scope`,
    `callback_port`, `redirect_uri`, `auth_server_metadata_url`); campo vazio fica fora (padrão do
    OpenCode: descoberta, registro do cliente por CIMD/registro dinâmico e PKCE). O `client_secret` é
    segredo (`secrets.oauthClientSecret`: ausente mantém, `null` remove; o DTO só traz
    `hasClientSecret`). Cabeçalhos extras continuam valendo junto com o OAuth (o OpenCode aceita os dois; a
    lista aparece como "Cabeçalhos HTTP extras") — só "Nenhuma" tira os cabeçalhos. Chamadas sem `auth` (agente, clientes
    antigos) mantêm cabeçalhos e a chave `oauth` do arquivo como estavam.
  - Credenciais **ficam no OpenCode do host** (credencial da integração do MCP), nunca no arquivo nem no
    Opex: salvar a configuração não apaga uma autorização já feita.
  - **Situação** na linha (selo `OAuth · Precisa autorizar | Autorizado | Erro`, `OauthStatusBadge`
    compartilhado com o Agente Opex), calculada por `mcp.list` (`needs_auth`/`failed` + erro) e pelas
    credenciais OAuth da integração do MCP (`integrationID` do `mcp.list`, `integration.get`).
  - **Autorizar** (menu do MCP; `McpAuthorizeDialog`): `integration.oauth.connect({ integrationID,
    methodID: integrationID })` devolve a URL do provedor; a tela abre a página e consulta a tentativa a
    cada 2 s. No 2.2.1 a tentativa é `mode: "auto"` e o retorno vai para um servidor temporário do
    OpenCode em `http://127.0.0.1:<porta>/callback` **no host**: de outra máquina essa página não abre, e
    o dono cola a URL da barra de endereço — o Opex confere host de loopback, porta, caminho e `state` da
    tentativa (`forwardableCallback`, `mcp-oauth.ts`) e repassa só `code`/`state`/`iss`/`error` ao
    loopback pelo shell do host (`curl`, `forwardOauthCallbackCommand`; a URL não vai para log). Modo
    `code` usa `integration.oauth.complete({ code })`. Ao concluir, credenciais OAuth antigas do mesmo
    MCP são removidas, o MCP reconecta, há auditoria (`acao: "autorizar"`, sem código nem token) e o
    evento `opencode-resources-updated`.
  - **Desconectar** (com confirmação): `credential.remove` das credenciais OAuth do MCP + reconexão.
  - Teste de conexão de MCP com OAuth não usa o inspector (ele não tem o token): mostra a situação do
    OpenCode.
- **Teste de MCP**: `mcp.disconnect` + `mcp.connect` + `mcp.list` (situação e erro) e a lista de
  ferramentas pelo inspector (`npx -y @modelcontextprotocol/inspector --cli … --method tools/list`,
  `MCP_INSPECTOR_SECRET_STORE=memory`) com um arquivo de configuração temporário (0600) apagado no fim
  e reduzido no host a nome + descrição. Até 2 min.
- **Backup automático**: antes de cada alteração, `tar.gz` dos caminhos afetados em
  `~/.local/share/opencode/opex-backups/<id>.tgz` + `index.json` (ação, rótulo, caminhos, os que não
  existiam e tamanho). Mantém os **50** mais recentes. Restaurar apaga o que não existia, extrai o
  arquivo e, antes, faz um backup do estado atual. Os segredos continuam só no host.
- **Concorrência**: um lock em memória (`withConfigLock`) serializa backup → gravação → conferência
  vindos da tela e do agente.
- **Ids**: base64url de `[tipo, escopo, nome]` (`ids.ts`).

## Skills usadas pelo Agente de Bootstrap (OPE-215)

O Agente de Bootstrap (`modules/project-bootstrap.md`) usa skills do OpenCode do host (padrão `bootstrap-agents-md`,
`bootstrap-aicontext` e `bootstrap-docker`, instaladas em `~/.agents/skills`): a aba do agente só **escolhe** quais; o
conteúdo é criado, editado, ligado/desligado e removido aqui (aba Skills) ou pelas ferramentas `opencode-resources`. Renomear
ou remover uma delas faz o bootstrap falhar com o motivo e o link para esta aba. A regra das permissões (negar todas e
liberar só as escolhidas) é `skillPermissionRules` (`src/features/opencode-resources/skill-permissions.ts`), a mesma dos
agentes rotineiros (`routineSkillPermissions`).

## Tempo real e auditoria

- Eventos em `private-app`: `opencode-resources-updated` `{ kind, scope }` (restauração: `kind: "all"`),
  `opencode-backups-updated` `{}` e `opencode-service-updated` `{ status }`.
- Auditoria: `RecursoOpenCode` (CRIAR/ATUALIZAR/EXCLUIR com tipo, escopo, nome, ação, origem, backup),
  `BackupOpenCode` (restaurar) e `ServicoOpenCode` (ações do serviço e confiança na chave).

## Agente Opex

Grupos **Serviço do OpenCode** (`opencode-service`) e **Recursos do OpenCode** (`opencode-resources`)
em `src/features/opex-agent/server/tools/opencode.ts`, só no agente do dono; chamam as mesmas funções
(origem `opex-agent`). O fim de uma atualização pedida pelo agente chega à sessão como aviso
(`notice`). Lista em `modules/opex-agent.md`.

## APIs (sessão do dono)

| Rota | Descrição |
|---|---|
| `GET /api/ai/providers/opencode/service` | Status do serviço (estado, versão, porta, tempo no ar, SSH, atualização, operação, impacto) |
| `POST /api/ai/providers/opencode/service/[start\|stop\|restart\|upgrade]` | Ação por SSH; `upgrade` aceita `{ version?, allowMajor? }` e devolve a operação `running` |
| `GET /api/ai/providers/opencode/service/logs?lines=` | Fim do log (1–300) |
| `GET/POST /api/ai/providers/opencode/service/ssh-trust` | Impressão digital apresentada / confia `{ fingerprint }` |
| `GET /api/ai/providers/opencode/scopes` | Global + centrais |
| `GET/POST /api/ai/providers/opencode/resources/[kind]` | Lista (`?scope=&refresh=1`) / cria |
| `GET/PATCH/DELETE .../resources/[kind]/[id]` | Detalhe / edita / exclui |
| `POST .../resources/[kind]/[id]/toggle` | `{ enabled }` |
| `POST .../resources/[kind]/install` | `{ kind, scope, source, skills?, name?, secrets? }` |
| `POST .../resources/[kind]/update?scope=` | `{ ids }` ou `{ all: true }` |
| `POST .../resources/mcp/[id]/test` | Situação + ferramentas |
| `GET/POST/DELETE .../resources/mcp/[id]/oauth` | Situação da autorização / Autorizar (tentativa: URL, modo, `localCallback`) / Desconectar |
| `GET/DELETE .../resources/mcp/[id]/oauth/[attemptId]` | Situação da tentativa / cancelar |
| `POST .../resources/mcp/[id]/oauth/[attemptId]/complete` | `{ code }` ou `{ callbackUrl }` (URL de retorno colada, repassada ao loopback do host) |
| `PUT .../resources/mcp/[id]/secrets` | `{ environment?, headers? }` (`value: null` remove) |
| `GET /api/ai/providers/opencode/backups`, `POST .../backups/[id]/restore` | Backups e restauração |

## Testes

`__tests__/features/opencode-resources/` (módulos puros, formulários, OAuth dos MCPs em `mcp-oauth.test.ts` e
`mcp-oauth-ui.test.tsx`, fachada com host simulado num
`$HOME` temporário, rotas e telas) e `__tests__/features/opencode-service/` (trava da 2.x, comandos,
ações por SSH, confiança na chave, aba Controles). Ferramentas do agente em
`__tests__/features/opex-agent/opencode-tools.test.ts`.
