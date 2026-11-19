# Plugins (OPE-172)

O Opex é estendido **em tempo de execução**, sem build nem deploy do app, por **plugins versionados
no MongoDB**. A inspiração é o "Creator Mode" do DeepSeek Harness. Uma tarefa do **tipo Plugin**
passa pela mesa de `/desenvolvimento`, que escreve o plugin, compila, publica a prévia ao vivo, roda
os testes do plugin e consolida a versão. Não há PR, imagem nem deploy.

| Escopo | Onde roda | O que pode |
|---|---|---|
| `owner` (dono) | App do dono | Código de servidor no **kernel Cordis** (rotas, ferramentas dos agentes, crons, eventos, chave-valor) e interface (slots, páginas, menu) |
| `client` (cliente) | Portal de **um** cliente (`/cliente`) | **Só interface** (decisão do dono), com os dados das APIs do portal que o usuário já acessa |

Código: `src/features/plugins/` (regras puras na raiz, servidor em `server/`, navegador em `client/`,
telas em `components/`). Modelos em `src/lib/db/models/Plugin.ts`. SDK de autoria em `plugin-sdk/`
(na raiz do repositório e copiado para a imagem Docker).

## Dados

| Coleção | Conteúdo |
|---|---|
| `plugins` | `pluginId` (slug único), nome, descrição, escopo, `clientId`, `apiVersion`, `active`, `archivedAt` + `archivedBy` (arquivado), `stableVersionId`, `previewVersionId`, `previewWorkbenchId` (a mesa dona da prévia), `runtimeError` (`{ channel, versionId, message, at }`) |
| `plugin_versions` | `number` (sequencial por plugin), `state` (`draft` → `preview` → `stable`, a estável anterior vira `archived`), `files` (fontes), `manifest`, `artifacts.server`/`artifacts.client` (`{ code, hash, css, cssHash }`), `tests`, `compileLog`, `baseVersionId`, `source` (`taskId`, `taskCode`, `workbenchId`), `promotedAt`, `changeSummary` + `changeSummarySource` (`agent`/`ai`: o descritivo da mudança para a versão anterior) |
| `plugin_kv` | Chave-valor de cada plugin (`ctx.kv`) |
| `plugin_logs` | Logs de debug do plugin (48 h, TTL): `pluginId`, `channel`, `level`, `message`, `data`, `ts`, `instance` |

Os índices (inclusive o TTL de `plugin_logs`) são criados pela migração idempotente `ensure-plugin-indexes`. Versão publicada não muda:
o rollback só move `stableVersionId`.

**Limites de uma versão:** 200 arquivos, 256 KB por arquivo, caminho no padrão (sem `..`, sem espaço) e 2 MB no total. `pluginManifestIssues` confere cada arquivo com `pluginSourceFileSchema` e devolve o problema com o caminho (ex.: `client/dump.json: Arquivo maior que o limite de 256 KB`); a versão não é gravada.

## Manifesto (`plugin.json`, `manifest.ts`)

O manifesto é o contrato da versão, validado por Zod (`pluginManifestSchema`) e pelas regras de escopo
(`pluginManifestIssues`). É **restritivo**: o kernel recusa registrar rota, ferramenta ou cron que não
estejam declarados, e a ativação falha.

| Campo | Conteúdo |
|---|---|
| `id` | Slug (`PLUGIN_ID_PATTERN`), igual ao do plugin cadastrado |
| `name`, `description` | Nome e descrição |
| `apiVersion` | `MAJOR.MINOR`. **Major diferente do núcleo** (`PLUGIN_API_VERSION = "1.0"`) recusa; minor maior só avisa |
| `scope` | `owner` ou `client`, igual ao do plugin |
| `entries` | `client` e/ou `server` |
| `slots` | `{ slot, export, title, order }` |
| `pages` | `{ path, title, export }` |
| `nav` | `{ label, page, icon, slot? }` — `slot` é o menu onde o item entra (ex.: `sidebar.nav.agentes`); sem ele, o menu padrão do escopo |
| `routes` | `{ method, path }` |
| `tools`, `crons`, `services` | Nomes declarados |

**Plugin de cliente:** a validação recusa `entries.server`, `routes`, `crons`, `tools`, `services`,
`nav` e a pasta `server/` (mensagem "Plugin de cliente é só interface; remova: …").

**Slots aninhados (árvore, `slot-tree.ts`, módulo puro):** os slots ficam numa árvore por escopo
(`PLUGIN_SLOT_TREE`). Cada nó é uma **área** (só agrupa, id `area:…`, não é slot) ou um **slot**. Os ids
dos slots não mudaram desde a primeira rodada (`apiVersion` continua 1.0). A árvore alimenta a validação,
o filtro da lista (`slotFilterNodes`; escolher uma área cobre todos os slots abaixo dela,
`expandSlotSelection`), os selos com o caminho completo (`slotPathLabel`, ex.: "Casca do app › Barra
lateral › Menu Agentes") e o SDK (`plugin-sdk/slots.json`, gerado da mesma árvore).

| Área (dono) | Slots |
|---|---|
| Casca do app › Barra lateral | `sidebar.nav` (seção Plugins), `sidebar.nav.agentes`, `sidebar.nav.contabil`, `sidebar.nav.configuracoes` (itens **dentro** desses menus), `topbar.actions` |
| Dashboards | `dashboard.widgets` (fim da página), `dashboard.section.tarefas`, `dashboard.section.financeiro`, `dashboard.section.horas`, `dashboard.section.central` (fim de cada seção) |
| Tarefas | `tasks.header`; Página da tarefa: `task.panel` (aba), `task.sidebar` (coluna lateral) |
| Central de desenvolvimento | `workbench.panel` |
| Contábil | `financeiro.widgets`, `horas.widgets` (topo de `/tarefas/horas`) |

| Área (portal) | Slots |
|---|---|
| (raiz) | `portal.nav`, `portal.dashboard.widgets` |
| Tarefas | `portal.tasks.header` (topo da lista), `portal.task.panel` (aba da tarefa) |

O manifesto recusa, em pt-BR: área no lugar de slot ("… é uma área (Dashboards), não um slot"), slot
desconhecido, slot de outro escopo, slot de menu em `slots` (menus vêm de `nav`) e `nav[].slot` que não é
um menu do escopo (`PLUGIN_NAV_SLOTS_BY_SCOPE`; o cliente só tem `portal.nav`).

## Compilação (`server/compiler/`)

O compilador é o **Rolldown** (decisão do dono, no lugar do esbuild), fixado em `1.3.3`. Ele lê as
fontes de um sistema de arquivos virtual (`virtual-fs.ts`, sem disco) e gera ESM.

| Alvo | Regras de import |
|---|---|
| Cliente | Os módulos do shell (`shared-modules.ts`) ficam **externos**, reescritos para `opex-shared:<id>`. Especificador `@opex/*` fora da tabela gera "Módulo do Opex inexistente". Qualquer outra dependência npm gera "Dependência não permitida no plugin" (não há instalação de pacote na v1) |
| Servidor (só dono) | Só `node:*` é externo. `@opex/plugin-sdk/server` é um módulo virtual (`definePlugin`). O resto gera "Import não permitido no servidor do plugin" |

**CSS:** o Tailwind 4 do app só gera as classes que existiam no build. Por isso
`compiler/tailwind.ts` usa o `compile` do próprio `tailwindcss` (dependência de produção) para gerar,
uma vez por versão, **só as utilidades usadas nas fontes**. O tema usado é `plugin-sdk/theme.css`,
que o `globals.css` também importa (fonte única dos tokens), sem preflight.

**Artefatos:** são guardados na versão, com `hash` sha256 de 16 caracteres.

Erros de manifesto ou de compilação **não gravam versão**: voltam em pt-BR para a mesa, que pede a
correção ao agente.

**Compilador indisponível** (`compiler/unavailable.ts`): se o Rolldown não carregar (binário nativo
ausente) ou o Tailwind não achar as folhas de estilo dele, a compilação rejeita com 503
`PLUGIN_COMPILER_UNAVAILABLE` ("O compilador de plugins não está disponível neste servidor (…). Não é
um problema do plugin: atualize a imagem do Opex e use Tentar novamente."). Isso é falha da instalação,
nunca um "problema do plugin": não vai para o agente corrigir.

**Na imagem Docker:** o rastreamento do Next leva ao standalone o JS do Rolldown e do Tailwind, mas não
o binário nativo `@rolldown/binding-*` (dependência opcional carregada por `require` dinâmico) nem os
`.css` do Tailwind (`theme.css`, `utilities.css`, lidos do disco). O `Dockerfile` copia os dois depois
do `next build` e roda `node scripts/plugin-runtime-check.mjs .next/standalone`, que compila um JSX
mínimo e gera `bg-primary` com o tema do app **na própria árvore do standalone**. Se faltar algo, o
build da imagem falha ali ("Compilador de plugins indisponível na imagem: …"), e não na mesa.

## Kernel do servidor (`server/kernel/`)

| Arquivo | Papel |
|---|---|
| `cordis.ts` | **Único** arquivo que importa o `cordis` (`4.0.0-rc.13`, fixado; se a API do RC mudar, só ele muda) |
| `kernel.ts` | Instância única em `globalThis.__opexPluginKernel`, iniciada por `startPluginKernel()` (`server/boot.ts`), chamado no `register()` do `instrumentation.ts` depois do agendador e sem bloquear o boot. A subida sincroniza todos os plugins ativos do dono (`syncAllPluginServers`) |
| `services.ts` | Serviços do núcleo como `Service` do Cordis |
| `identity.ts` | Liga cada fiber ao plugin, ao canal e ao manifesto |

Serviços disponíveis para o plugin (`ctx.*`):

| Serviço | O que faz |
|---|---|
| `db` | `connect()` com as migrações, `mongoose` e `model()` |
| `log` | Pino com o plugin |
| `audit` | `recordAudit` com entidade `plugin:{id}` |
| `realtime` | Evento `plugin-event` `{ pluginId, event, data }` em `private-app` |
| `integrations` | Configuração resolvida de uma integração |
| `ai` | `streamAi` (`text`/`stream`) |
| `tools` | Registro de ferramentas |
| `cron` | Registro de crons |
| `routes` | Registro de rotas |
| `kv` | `plugin_kv` |
| `sdk` | `z`, `dateFns`, `ptBR` |

Tudo o que é registrado vira `fiber.effect(...)`, e o `dispose` da fiber desfaz. Os registros
(`registries.ts`, também em `globalThis`) são **pilhas por chave**: a versão nova empilha por cima, e
o dispose da antiga remove só a própria entrada. Assim não há janela em que a ferramenta some, nem
resíduo.

**Canais:** cada plugin do dono tem até duas fibers, `stable` e `preview` (a prévia de uma mesa).

**Ativação (`activatePluginServer`):** é **transacional** e serializada por plugin.

1. Grava o artefato em `os.tmpdir()/opex-plugins/{id}-{hash}.mjs` e o importa fora do bundler (`?channel=` separa o estado de módulo).
2. Ativa o componente numa fiber nova, com teto de 30 s.
3. Só depois do sucesso descarta a fiber anterior.

Em qualquer falha a fiber nova é descartada, a anterior continua e o erro volta como `runtimeError`.
A mesma versão com o mesmo hash não é recarregada (`unchanged`). O `inject` do plugin só aceita
serviços que existem (`PLUGIN_SERVICES`) e que estão declarados em `services` no manifesto; fora
disso a ativação falha.

**Instância de prévia do app** (`OPEX_PREVIEW=1`, que usa o mesmo Mongo da produção): o kernel sobe
em `mode: "preview-instance"` e **não ativa código de servidor de plugin**, para não duplicar crons e
efeitos. Os artefatos de interface continuam servidos.

**Fotografia do runtime:** `inspectPluginRuntime()` devolve modo, SDK, serviços, fibers com efeitos,
ferramentas, rotas e crons. É exposta em `GET /api/plugins/kernel` e na ferramenta
`inspect_plugin_runtime`.

**Rotas:** `src/app/api/p/[pluginId]/[[...path]]/route.ts` (`withRoute` + `requireAdminSession`). O
despacho (`server/dispatch.ts`) usa a fiber `preview` quando o navegador está com a prévia do plugin
ligada **e** ela existe; senão usa a `stable`. Sem rota, responde 404 `PLUGIN_ROUTE_NOT_FOUND`. Um
valor devolvido vira `{ success: true, data }`.

**Crons:** `runPluginCrons` (`server/crons.ts`) roda no tick de minuto do agendador
(`runSchedulerTick`, que já não roda em instância de prévia), com lease por cron em `CronJobState`
(`jobId` = `plugin:{id}:{nome}`). Só os crons da fiber `stable` agendam; os da prévia ficam
registrados com `scheduled: false`. Só aceita agendamento em minutos ou mais. Cada execução tem teto de
`PLUGIN_CRON_TIMEOUT_MS` (10 min, abaixo do lease de 15 min): passou, fecha como erro ("Tempo esgotado") e
o tick segue para o próximo cron. O fim da execução só libera o próprio lease (mesmo `lockedBy` e
`lockedUntil`), nunca o de uma reivindicação posterior.

**Ferramentas:** ganham o nome `plugin_{id}_{nome}` (o `-` do id vira `_`), o grupo `plugin-tools`
e a política do dono:

- `allOpexTools()` e `enabledOpexTools(disabled, previewPlugins)` juntam as estáticas às dos plugins;
- `findOpexTool` usa o mesmo catálogo;
- o MCP do dono (`opex_app` e tokens) usa `OPEX_TOOLS` + `pluginToolList()`;
- `disabledTools` e `confirmationOverrides` aceitam nomes de plugin mesmo com o plugin descarregado.
- **Risco decidido pelo Opex, não pelo plugin** (`pluginToolRisk`): `risk: "read"` ou omitido vale como
  `"write"` e toda ferramenta de plugin é `confirmByDefault` — pede Confirmar/Cancelar no chat e, no MCP,
  exige `mcp:owner:destructive` (`toolNeedsDestructiveScope`). Só o dono libera, ferramenta a ferramenta,
  no ajuste de confirmação do Agente Opex (`confirmationOverrides`).

Num turno do Agente Opex disparado com a prévia do plugin ligada (cookie lido em
`POST /api/opex/sessions/[id]/messages` → `scope.previewPlugins`), valem as ferramentas da versão
`preview`.

## Ciclo das versões (`server/service.ts`)

Todas as transições abaixo gravam auditoria (`entidade: "plugin"`) e publicam `plugin-updated`.

| Operação | Função | Efeito |
|---|---|---|
| Criar versão | `createDraftVersion` | Normaliza as fontes (tira `.opex-sdk/`, `node_modules/`, `.git/` e os arquivos de ambiente), valida manifesto e escopo, compila e grava `draft` |
| Publicar prévia | `publishPreviewVersion` | Ativa a fiber `preview` e grava `previewVersionId`/`previewWorkbenchId`. A prévia é de **uma mesa só**: com prévia de outra mesa, 409 `PLUGIN_PREVIEW_BUSY` ("O plugin já tem uma prévia da tarefa X (vN). Aguarde ela ser consolidada ou descartada") |
| Consolidar | `consolidateVersion` | A `preview` vira `stable`, com ativação da `stable` **antes** de gravar. Se a ativação falhar: 409 `PLUGIN_ACTIVATION_FAILED`, "A versão estável anterior continua ativa", e `runtimeError` gravado |
| Base da versão | prévia e consolidação | A versão precisa ter partido da estável **atual** (`baseVersionId` = `stableVersionId`); senão, 409 `PLUGIN_BASE_OUTDATED` ("A versão vN partiu da estável vX, mas a estável agora é vY. Refaça a alteração a partir da estável atual"), para uma mesa não apagar o que outra consolidou |
| Rollback | `rollbackPlugin` | Volta a `stable` para uma versão com `promotedAt` (já consolidada antes), arquivando a atual. É transacional como a consolidação |
| Ativar/desativar | `setPluginActive` | Desativar desfaz as fibers e tira a interface das telas |
| Descartar prévia | `discardPreview` | Usado na conclusão manual e na exclusão da mesa dona da prévia |

## Interface no navegador (`client/`)

**Manifesto de runtime** (`GET /api/plugins/runtime` no dono, `GET /api/cliente/plugins/runtime` no
portal; `server/runtime-manifest.ts`):

- traz, por plugin ativo do ator, a versão vigente (`resolvePluginVersion`: `preview` se a prévia
  daquele plugin está ligada neste navegador, senão `stable`);
- cada entrada tem `revision`, `bundleUrl`/`cssUrl` imutáveis (hash no nome), slots, páginas e menu
  (o menu só no dono);
- os bundles saem de `GET /api/plugins/bundles/[versionId]/[hash].js|css` e do equivalente do portal,
  com `Cache-Control: immutable`;
- o portal só lê versões de plugins do próprio cliente; o dono, só as do escopo `owner`.

**Carregador** (`loader.ts`):

1. Busca o bundle pelo axios do contexto.
2. Para cada marcador `opex-shared:<id>`, cria um shim ESM (blob URL) que reexporta a instância
   **única** do shell, guardada em `globalThis.__OPEX_SHARED__` e carregada de
   `shared-registry.ts` (mesma lista de `shared-modules.ts`, conferida por teste). A variável local do
   shim é `__opexSharedModule__` (nunca um nome que um módulo exporte: o framer-motion exporta `m`, e o
   shim antigo com `const m` quebrava com "Identifier 'm' has already been declared"); palavras
   reservadas ficam fora do `export const { … }`. O teste importa o shim de cada módulo real.
3. Importa o bundle com `webpackIgnore`/`turbopackIgnore`.

Há uma carga por revisão. O CSS entra num `<style id="opex-plugin-css-{id}">` trocado por revisão.
`@opex/api` é o axios do contexto: o do dono ou o do portal (`x-client-id`).

**Fonte dos dados:** `PluginSourceContext` define de onde a tela lê.

| Contexto | API | Canal |
|---|---|---|
| Dono (padrão) | `/api/plugins` | `private-app` |
| Portal (`ClientPluginSourceProvider` no `ClientePortalShell`) | `/api/cliente/plugins` | `private-client-{id}` |

**Contribuições** (`PluginSlot`, `PluginContribution`):

- cada contribuição tem `PluginErrorBoundary` próprio (um plugin que falha mostra "O plugin X falhou"
  no slot), `PluginHostProvider` (`usePluginHost`) e animação de entrada e saída;
- a `key` é a revisão, então consolidação, prévia ou rollback trocam o componente **sem recarregar a
  página**;
- na prévia aparece o selo "Prévia vN";
- slot sem contribuição não renderiza nada;
- erro de carregamento do módulo ou de render vai para o debug do plugin (`report-error.ts`:
  `POST /api/plugins/[id]/logs` no dono, `POST /api/cliente/plugins/[id]/logs` no portal, uma vez por
  revisão e mensagem, até 4 KB).

**Pontos de extensão:**

| Slot | Escopo | Onde | Props |
|---|---|---|---|
| `dashboard.widgets` | dono | Fim do Dashboard | `{}` |
| `task.panel` | dono | Abas extras `plugin:{id}:{export}` em `TaskDetailTabs` | `{ task }` |
| `topbar.actions` | dono | Ações da casca: no desktop (sem barra no topo), o rodapé do menu — que no desktop é a barra recolhida de ícones, então o slot monta sempre, empilhado e centralizado; no celular, as ações do `MobileAppHeader` | `{}` |
| `workbench.panel` | dono | Aba extra na mesa (`WorkbenchView`) | `{ workbenchId, taskId }` |
| `tasks.header` | dono | Bloco acima do quadro em `/tarefas` (`TasksPage`) | `{}` |
| `financeiro.widgets` | dono | Cards no topo de `/financeiro` (`FinancePage`) | `{}` |
| `sidebar.nav` | dono | Seção "Plugins" da barra lateral (`useNavWithPlugins`, ícones de `nav-icons.ts`), da lista `nav` | — |
| `sidebar.nav.agentes` / `.contabil` / `.configuracoes` | dono | Itens `nav` com esse `slot` entram **dentro** do grupo do `APP_NAV` (`PLUGIN_NAV_GROUP_BY_SLOT`, `navWithPluginItems`) | — |
| `dashboard.section.*` | dono | Fim de cada seção do Dashboard (`TasksOverviewSection`, `FinanceSection`, `AgenticHoursSection`, `DevCenterSection`) | `{}` |
| `task.sidebar` | dono | Cards abaixo dos da coluna lateral da tarefa (`TaskDetailSidebar`) | `{ task }` |
| `horas.widgets` | dono | Cards no topo de `/tarefas/horas` (`TimeLogsPage`) | `{}` |
| `portal.tasks.header` | cliente | Bloco no topo da lista de tarefas do portal (`ClienteTasksPage`) | `{ clientId }` |
| `portal.dashboard.widgets` | cliente | Fim do Dashboard do portal | `{ clientId }` |
| `portal.task.panel` | cliente | Aba extra na tarefa do portal (`ClienteTaskTabs`) | `{ taskId, clientId }` |
| `portal.nav` | cliente | Seção "Plugins" do menu do portal (`/cliente/x/{id}/{página}`), da lista `nav`, para todos os usuários do cliente | — |

As abas de slot usam `usePluginSlotTabs(slot)`. Plugin de cliente pode declarar `nav` (vira o
`portal.nav`); os slots de menu nunca entram em `slots` (recusado pelo manifesto). `pluginSlotsOf`
lista os slots de um manifesto (filtro da lista) e `pluginPreviewPath` dá a tela de cada slot para o
"Ver prévia".

**Páginas coringa:** `src/app/(app)/x/[...path]` e `src/app/cliente/(portal)/x/[...path]`, com
`PluginPageHost` e `error.tsx` próprio.

## Prévia por navegador

O cookie `opex_plugin_preview` é **assinado** (HMAC com `AUTH_SECRET`; valor adulterado vale como
nenhuma prévia), tem 7 dias e traz a lista de ids com a prévia ligada.

- Liga e desliga em `POST /api/plugins/[id]/preview { on }` e no equivalente do portal (admin).
- O switch "Ligar prévia" (`PluginPreviewToggle`) fica **só na mesa**. Na página do plugin (dono e
  portal), a linha da versão em prévia tem **"Ver prévia"** (liga a prévia neste navegador e abre a tela
  da versão, `previewPath`) e **"Aprovar prévia"**.
- Só aquele navegador vê a `preview`; o resto continua na `stable`.
- A chave mostra a lista do cookie que o ator enxerga (`previewOn` do runtime): no app do dono, os
  plugins de **qualquer** escopo (o dono também gerencia os de cliente); no portal, os do cliente. Ao
  ligar, a resposta do POST já atualiza a chave e o link "Ver prévia".

**Plugin de cliente na sessão do dono.** O código do plugin roda no mesmo origin, com a sessão de quem
abriu a página. Por isso, na pré-visualização do portal pelo dono (sessão `admin` com `x-client-id`,
`actor.preview`), o runtime e o bundle do portal **só entregam o plugin de cliente cuja prévia o dono
ligou neste navegador** (`clientPluginMountable`, `buildRuntimeManifest(…, { ownerPreview })`). Os
plugins do cliente, inclusive os consolidados pelo admin do cliente, nunca rodam por padrão com a sessão
do dono: ele revisa as fontes e a diferença em `/plugins/[id]` e só então liga a prévia daquele
plugin. Para o usuário do cliente nada muda.

## Telas

**`/plugins`** (Configurações › Plugins):

- lista com busca, escopo, **slot** e **Arquivados** na URL (`filters.ts`; `PluginDto.slots` vem da
  estável ou, sem ela, da prévia), versões, cliente, selos dos slots (com o caminho completo) e erro de
  runtime;
- Escopo e Slot usam o `CadastroSearchPicker` (busca + seleção múltipla). O Slot é a árvore: sem termo,
  as opções aparecem recuadas por nível; com termo, cada resultado aparece no caminho dele (ancestrais
  visíveis) e mostra o caminho por extenso. No dono, a raiz tem "Dono" e "Portal do cliente";
- **Arquivados: Mostrar** (`FilterSwitch`, `showArchived`): desligado, os arquivados ficam fora; ligado,
  aparecem com o selo "Arquivado" e o switch Ativo desabilitado;
- o **nome é o link** para a página do plugin (`ItemNameLink`, padrão do projeto); à direita, o ícone de
  **debug** (modal de logs, `PluginDebugDialog`, igual ao de `/integracoes`) e o **switch Ativo**
  (`PluginActiveSwitch`: ligar é direto, desligar pede confirmação; resposta otimista com reversão);
- esqueleto no formato da linha (`PluginRowsSkeleton`).

**`/plugins/[id]`** (detalhe):

- cabeçalho com o ícone de **debug** (abre a coluna de logs à direita, como na página da integração;
  abaixo de `xl`, o modal) e o switch Ativo — não há switch de prévia nem cards de diferença ou de
  prévia;
- **Versões** no `ActiveItemRow` (o das contas do OpenCode e das chaves de IA): a estável é "Em uso";
  clicar numa versão já consolidada (estável anterior ou arquivada) a põe em uso para todos (rollback,
  com confirmação); a versão em prévia e os rascunhos não são clicáveis (chegam a "Em uso" pela mesa);
- cada versão mostra data, tarefa de origem (link no dono), testes e o **descritivo da mudança** em
  linguagem natural; sem descritivo, "Sem descritivo desta mudança" e, no dono, **"Gerar descritivo"**;
- runtime no servidor (só plugin do dono).

**Arquivar** (`setPluginArchived`, `POST /api/plugins/[id]/archive` e `POST /api/cliente/plugins/[id]/archive`
para o admin do próprio cliente, `{ archived }`; ferramenta `archive_plugin`, destrutiva):

- botão de ícone **Arquivar/Desarquivar** no cabeçalho da página do plugin, com confirmação; o
  cabeçalho mostra o selo "Arquivado";
- arquivar **desliga** o plugin (`active: false`): sai das telas e do kernel. É recusado com 409
  (`PLUGIN_PREVIEW_BUSY`) se houver uma prévia de mesa ("O plugin tem uma prévia da tarefa X. Conclua ou
  descarte antes de arquivar");
- desarquivar traz de volta **desligado** (como nos agentes rotineiros);
- arquivado não liga, não publica prévia, não consolida, não faz rollback nem aprova a prévia (409
  `PLUGIN_ARCHIVED`, "O plugin X está arquivado. Desarquive-o antes"); na página, o switch fica
  desabilitado ("Desarquive para ativar") e nenhuma versão é clicável;
- tarefa Plugin com alvo num plugin arquivado é recusada com 400 (`TASK_PLUGIN_ARCHIVED`); o seletor de
  plugin do formulário da tarefa não oferece os arquivados;
- versões, logs e kv ficam intactos; auditoria e `plugin-updated` a cada mudança.

**Descritivo da mudança:** o agente da mesa termina cada implementação ou correção com um bloco JSON
`{"changeSummary": "…"}` (`PLUGIN_CHANGE_SUMMARY_REQUEST`, lido por `pluginChangeSummaryFrom`),
guardado em `plugin.changeSummary` da mesa e gravado na próxima versão com origem `agent`. "Gerar
descritivo" (`POST /api/plugins/[id]/versions/[versionId]/summary`, `server/version-summary.ts`) chama a
IA pela feature **"Descritivo de versão de plugin"** (Integrações › IA › Catalogador) com a diferença
para a versão anterior de número menor, grava com origem `ai`, audita e publica `plugin-updated`.
Nenhuma leitura gera descritivo.

## Debug (logs)

`server/logs.ts`: `pluginLog` grava em `plugin_logs`, manda para o Pino e publica `plugin-debug`
(`{ entries }`, agrupado a cada 500 ms) em `private-plugin-{id}` (só o dono). Chaves sensíveis são
mascaradas. Plugin não tem "modo debug": o log é sempre gravado.

| Origem | Linha |
|---|---|
| `ctx.log.info/warn/error/debug` | Nível correspondente (`debug` vira `step`) |
| Kernel | Versão ativada ou recarregada, falha ao ativar, código de servidor desfeito |
| Rotas `/api/p/...` | Erro do handler |
| Crons | Executado (com a duração) ou falhou |
| Ferramentas | Erro da ferramenta |
| Navegador | Erro de carregamento ou de render (`[interface] …`) |

Leitura: `GET /api/plugins/[id]/logs?after=&limit=`. Na tela, `usePluginDebugLogs` + `PluginDebugConsole`
sobre o terminal compartilhado das integrações (`DebugLogConsole`, `useDebugLogStream`,
`DebugLogsPanel`, `DebugLogsDialog`, `DebugToggleIconButton`). O admin do cliente não tem debug.

**Portal `/cliente/plugins`** (só admin; item "Plugins" no menu do admin):

- mesma lista e detalhe, pelos mesmos componentes (`PluginPages.tsx`), sem o debug e sem "Gerar
  descritivo";
- "Aprovar prévia" (`POST /api/cliente/plugins/[id]/approve`; no dono, `POST /api/plugins/[id]/approve`,
  `approvePluginPreview`) chama o `approve` da mesa dona da prévia: segue para os testes do plugin e a
  consolidação, sem novo passo do dono (decisão do dono no planejamento da OPE-172: o admin do cliente
  aprova a versão em prévia e isso consolida). O que protege o dono é a regra acima: plugin de cliente
  só roda na sessão dele com a prévia ligada por ele;
- o admin também vê a prévia, põe uma versão consolidada em uso e ativa ou desativa;
- a origem da versão aparece só como código, sem link para o app do dono.

Plugins de cliente nascem de tarefas Plugin criadas pelo dono ou pelos agentes (Agente Opex e
Maddox, com `create_task` e `taskType: "plugin"` + `pluginTarget`). No portal não há seletor de tipo.

## Tempo real

| Evento | Canal | Payload | Efeito |
|---|---|---|---|
| `plugin-updated` | `private-app` (sempre) e `private-client-{clientId}` (plugin de cliente) | `{ id, version, channel }` | `usePluginsRealtime` invalida lista, detalhe e manifesto de runtime |
| `plugin-event` | `private-app` | `{ pluginId, event, data }` | Publicado por `ctx.realtime.publish`; o plugin escuta com `usePluginEvent` |
| `plugin-debug` | `private-plugin-{id}` (só o dono) | `{ entries }` (linhas de log) | Terminal de debug do plugin |

## Ferramentas dos agentes (grupo `plugins`)

| Ferramenta | Tipo |
|---|---|
| `list_plugins`, `get_plugin`, `read_plugin_source`, `diff_plugin_versions`, `inspect_plugin_runtime` | Leitura |
| `set_plugin_active`, `archive_plugin`, `rollback_plugin` | `destructive` (pedem confirmação por padrão) |

Criar ou alterar um plugin é sempre pela mesa: uma tarefa do tipo Plugin.

## Mesa Plugin

O fluxo da mesa está em `agentic-dev.md`, "Mesa Plugin (OPE-172)".

## SDK de autoria (`plugin-sdk/`)

| Pasta ou arquivo | Conteúdo |
|---|---|
| `types/server.d.ts` | `definePlugin`, `PluginContext` |
| `types/client.d.ts` | `usePluginHost`, `usePluginEvent`, `definePluginClient` e `@opex/plugin-sdk/testing` |
| `types/opex-modules.d.ts` | Gerado de `shared-exports.json` |
| `shared-exports.json` | Exports de cada módulo `@opex/*` |
| `slots.json` | Árvore de slots (`PLUGIN_SLOT_TREE`), para o agente da mesa; o teste `logic.test.ts` confere que bate com a do núcleo |
| `theme.css` | Tokens do tema; o `globals.css` importa |
| `testing/` | Plugin Vite que troca os módulos do Opex por stubs `data-opex="<Nome>"`, axios falso (`mockApi`), host falso e `createPluginTestContext(manifest)`, com as mesmas regras de declaração do kernel |
| `template/` | `package.json`, `tsconfig.json`, `vitest.config.mts` e `gitignore` (sem ponto no repositório) |
| `skeleton/owner` e `skeleton/client` | Esqueletos com testes |
| `GUIA.md` | Contrato completo para o agente |

Fica fora do `tsconfig` e do ESLint do app.

## Testes

Em `__tests__/features/plugins/`:

| Arquivo | Cobre |
|---|---|
| `manifest` | Manifesto e escopo |
| `logic` | Regras puras |
| `compiler` | Rolldown e Tailwind reais |
| `compiler-unavailable` | Rolldown sem binário e Tailwind sem CSS rejeitam com `PLUGIN_COMPILER_UNAVAILABLE`; erro de código continua problema do plugin |
| `kernel` | Cordis real: ativação, recarga transacional, dispose, manifesto restritivo, prévia, instância de prévia |
| `registries` | Pilhas por chave |
| `shared-modules` | Listas do compilador, do navegador e do SDK batem |
| `service` | Ciclo de versões, rollback, acesso do portal, eventos |
| `runtime` | Manifesto de runtime, bundle, cookie assinado |
| `crons` | Crons de plugin |
| `agent-tools` | Catálogo dos agentes |
| `loader` | Carregador |
| `plugin-routes` | `/api/p/...` despacha na preview só com o cookie válido e a fiber de prévia; a chave grava e limpa o cookie; aprovação do portal só pelo admin do próprio cliente; a rota de mensagens leva a prévia ao turno |
| `plugin-preview-toggle` | A chave reflete o cookie também para plugin de cliente no app do dono |
| `__tests__/scripts/plugin-runtime-check` | O script do build da imagem passa na árvore completa e falha sem o binário do Rolldown ou sem o CSS do Tailwind |
| `plugin-slot` | Slot, erro isolado, troca ao vivo e erro (render ou carga) enviado ao debug |
| `plugins-pages` | Lista (link no nome, debug, switch com confirmação, filtro Slot, esqueleto) e detalhe (Em uso, versão clicável com confirmação, Ver/Aprovar prévia, descritivo, Gerar descritivo, coluna de logs) no dono e no portal |
| `plugin-logs` | `plugin_logs`, mascaramento, canal `private-plugin-{id}`, leitura com `after`, erro de interface em 4 KB |
| `version-summary` | Descritivo do agente e "Gerar descritivo" (diferença para a anterior, origem `ai`, 409 sem a feature, 502 no erro) |
| `plugin-new-slots` | Aba `portal.task.panel` e menu `portal.nav` |

Também:

- cada tela com slot tem um teste com um plugin vigente (`pluginTestRuntime`, `pluginTestEntry` e
  `pluginContributionMock` de `__tests__/helpers/plugins.ts`) que prova o ponto de montagem e as props:
  Dashboard, Dashboard do portal, aba da tarefa, mesa, `/tarefas`, Financeiro, rodapé do menu e menu do
  dono e do portal;
- `__tests__/features/agentic/workflow-plugin-flow.test.ts` e `plugin-workbench.test.tsx` (mesa Plugin);
- `__tests__/features/tasks/task-plugin-target.test.tsx` (formulário e schema);
- telas com slot mockam os hooks com `__tests__/helpers/plugins.ts`.
