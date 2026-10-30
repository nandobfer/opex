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
  (o Opex usa `@opencode/client` 2.x). Uma major nova (3.x+) aparece como botão próprio e exige
  confirmação extra (`allowMajor`) sobre possível incompatibilidade. Roda em segundo plano.
- **Operações** (`opencode_service_operations`, modelo `OpencodeServiceOperation`): uma por vez (409
  `OPENCODE_OPERATION_RUNNING`), com ação, situação (`running`/`succeeded`/`failed`/`interrupted`),
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
lista o que muda e pede confirmação. Com alterações não salvas na Configuração, pede para salvar.

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
- **Segredos dos MCPs**: valores de `environment`/`headers` nunca saem do servidor (DTO só com os
  nomes; tela mostra "••••"). No formulário, valor vazio numa variável existente mantém o atual;
  remover a linha apaga. Auditoria, logs e eventos sem valores.
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
| `PUT .../resources/mcp/[id]/secrets` | `{ environment?, headers? }` (`value: null` remove) |
| `GET /api/ai/providers/opencode/backups`, `POST .../backups/[id]/restore` | Backups e restauração |

## Testes

`__tests__/features/opencode-resources/` (módulos puros, formulários, fachada com host simulado num
`$HOME` temporário, rotas e telas) e `__tests__/features/opencode-service/` (trava da 2.x, comandos,
ações por SSH, confiança na chave, aba Controles). Ferramentas do agente em
`__tests__/features/opex-agent/opencode-tools.test.ts`.
