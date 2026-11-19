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
| `plugins` | `pluginId` (slug único), nome, descrição, escopo, `clientId`, `apiVersion`, `active`, `stableVersionId`, `previewVersionId`, `previewWorkbenchId` (a mesa dona da prévia), `runtimeError` (`{ channel, versionId, message, at }`) |
| `plugin_versions` | `number` (sequencial por plugin), `state` (`draft` → `preview` → `stable`, a estável anterior vira `archived`), `files` (fontes), `manifest`, `artifacts.server`/`artifacts.client` (`{ code, hash, css, cssHash }`), `tests`, `compileLog`, `baseVersionId`, `source` (`taskId`, `taskCode`, `workbenchId`), `promotedAt` |
| `plugin_kv` | Chave-valor de cada plugin (`ctx.kv`) |

Os índices são criados pela migração idempotente `ensure-plugin-indexes`. Versão publicada não muda:
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
| `nav` | `{ label, page, icon }` |
| `routes` | `{ method, path }` |
| `tools`, `crons`, `services` | Nomes declarados |

**Plugin de cliente:** a validação recusa `entries.server`, `routes`, `crons`, `tools`, `services`,
`nav` e a pasta `server/` (mensagem "Plugin de cliente é só interface; remova: …").

**Slots:**

| Escopo | Slots |
|---|---|
| Dono | `dashboard.widgets` e `task.panel` (aba da página da tarefa). `sidebar.nav` vem da lista `nav` |
| Cliente | `portal.dashboard.widgets` |

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
registrados com `scheduled: false`. Só aceita agendamento em minutos ou mais.

**Ferramentas:** ganham o nome `plugin_{id}_{nome}` (o `-` do id vira `_`), o grupo `plugin-tools`
e a política do dono:

- `allOpexTools()` e `enabledOpexTools(disabled, previewPlugins)` juntam as estáticas às dos plugins;
- `findOpexTool` usa o mesmo catálogo;
- o MCP do dono (`opex_app` e tokens) usa `OPEX_TOOLS` + `pluginToolList()`;
- `disabledTools` e `confirmationOverrides` aceitam nomes de plugin mesmo com o plugin descarregado.

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
   `shared-registry.ts` (mesma lista de `shared-modules.ts`, conferida por teste).
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
- slot sem contribuição não renderiza nada.

**Pontos de extensão:**

| Slot | Onde |
|---|---|
| `dashboard.widgets` | Fim do Dashboard |
| `task.panel` | Abas extras `plugin:{id}:{export}` em `TaskDetailTabs` |
| `portal.dashboard.widgets` | Fim do Dashboard do portal |
| Menu | Seção "Plugins" da barra lateral (`useNavWithPlugins`, ícones de `nav-icons.ts`) |

**Páginas coringa:** `src/app/(app)/x/[...path]` e `src/app/cliente/(portal)/x/[...path]`, com
`PluginPageHost` e `error.tsx` próprio.

## Prévia por navegador

O cookie `opex_plugin_preview` é **assinado** (HMAC com `AUTH_SECRET`; valor adulterado vale como
nenhuma prévia), tem 7 dias e traz a lista de ids com a prévia ligada.

- Liga e desliga em `POST /api/plugins/[id]/preview { on }` e no equivalente do portal (admin).
- O botão "Ligar prévia" (`PluginPreviewToggle`) aparece na mesa, no detalhe do plugin e no portal.
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

- lista com busca e escopo na URL (`filters.ts`), versões, cliente, ativo e erro de runtime;
- `/plugins/[id]` mostra o detalhe: ativo (desativar pede confirmação), card da prévia com "Ligar
  prévia", versões com link para a tarefa, "Diferença" (diff unificado por arquivo,
  `diffPluginFiles`) e "Rollback" (só em versão já consolidada, com confirmação), e o runtime no
  servidor (só plugin do dono).

**Portal `/cliente/plugins`** (só admin; item "Plugins" no menu do admin):

- mesma lista e detalhe, pelos mesmos componentes (`PluginPages.tsx`);
- o detalhe tem o botão **"Aprovar prévia"** (`POST /api/cliente/plugins/[id]/approve`), que chama o
  `approve` da mesa dona da prévia: segue para os testes do plugin e a consolidação, sem novo passo
  do dono (decisão do dono no planejamento da OPE-172: o admin do cliente aprova a versão em prévia e
  isso consolida). O que protege o dono é a regra acima: plugin de cliente só roda na sessão dele com
  a prévia ligada por ele;
- o admin também liga a prévia, faz rollback e ativa ou desativa;
- a origem da versão aparece só como código, sem link para o app do dono.

Plugins de cliente nascem de tarefas Plugin criadas pelo dono ou pelos agentes (Agente Opex e
Maddox, com `create_task` e `taskType: "plugin"` + `pluginTarget`). No portal não há seletor de tipo.

## Tempo real

| Evento | Canal | Payload | Efeito |
|---|---|---|---|
| `plugin-updated` | `private-app` (sempre) e `private-client-{clientId}` (plugin de cliente) | `{ id, version, channel }` | `usePluginsRealtime` invalida lista, detalhe e manifesto de runtime |
| `plugin-event` | `private-app` | `{ pluginId, event, data }` | Publicado por `ctx.realtime.publish`; o plugin escuta com `usePluginEvent` |

## Ferramentas dos agentes (grupo `plugins`)

| Ferramenta | Tipo |
|---|---|
| `list_plugins`, `get_plugin`, `read_plugin_source`, `diff_plugin_versions`, `inspect_plugin_runtime` | Leitura |
| `set_plugin_active`, `rollback_plugin` | `destructive` (pedem confirmação por padrão) |

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
| `__tests__/scripts/plugin-runtime-check` | O script do build da imagem passa na árvore completa e falha sem o binário do Rolldown ou sem o CSS do Tailwind |
| `plugin-slot` | Slot, erro isolado e troca ao vivo |
| `plugins-pages` | Telas do dono e do portal |

Também:

- `__tests__/features/agentic/workflow-plugin-flow.test.ts` e `plugin-workbench.test.tsx` (mesa Plugin);
- `__tests__/features/tasks/task-plugin-target.test.tsx` (formulário e schema);
- telas com slot mockam os hooks com `__tests__/helpers/plugins.ts`.
