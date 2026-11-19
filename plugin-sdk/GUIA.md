# Guia de autoria de plugins do Opex (SDK 1.0)

Este guia está na pasta de trabalho da mesa em `.opex-sdk/GUIA.md`. A pasta foi exportada pelo
Opex a partir da versão base do plugin ou, num plugin novo, do esqueleto. O Opex lê as fontes daqui
de volta, compila com **Rolldown** e publica a versão `preview` ao vivo. Não há PR, build de imagem
nem deploy.

## 1. Estrutura

```
plugin.json            manifesto (contrato com o núcleo)
client/index.tsx       interface (client components): export default definePluginClient({ slots, pages })
server/index.ts        servidor (só plugin do DONO): export default definePlugin({ inject, apply })
**/*.test.ts(x)        testes Vitest (rodados pelo Opex antes de consolidar)
.opex-sdk/             SDK (tipos, helpers de teste, tema). Não edite.
```

`package.json`, `tsconfig.json`, `vitest.config.mts` e `.gitignore` são o ambiente local. Eles não
voltam para a versão. Rode `pnpm install`, `npx tsc --noEmit` e `npx vitest run`.

## 2. Manifesto (`plugin.json`)

| Campo | Regra |
|---|---|
| `id` | Slug fixo do plugin (é o segmento de `/api/p/{id}` e `/x/{id}`). Não mude. |
| `name`, `description` | Nome e descrição exibidos na tela de Plugins. |
| `apiVersion` | `"1.0"`. Major diferente do núcleo é recusado; minor maior só gera aviso. |
| `scope` | `"owner"` (app do dono) ou `"client"` (portal de um cliente). Não mude. |
| `entries` | `client` e/ou `server` (caminho do arquivo de entrada). |
| `slots` | `{ slot, export, title?, order? }`. Slots do dono: `dashboard.widgets` (Dashboard), `task.panel` (aba da tarefa), `topbar.actions` (ações da casca: rodapé do menu no desktop, cabeçalho no celular — use um botão de ícone compacto), `workbench.panel` (aba da mesa de desenvolvimento), `tasks.header` (acima do quadro de tarefas) e `financeiro.widgets` (Financeiro). Slots do cliente: `portal.dashboard.widgets` (Dashboard do portal) e `portal.task.panel` (aba da tarefa no portal). `title` é o rótulo da aba nos slots de aba. Os menus (`sidebar.nav`, `portal.nav`) vêm de `nav`, nunca de `slots`. |
| `pages` | `{ path, title, export }`: página em `/x/{id}/{path}` (dono) ou `/cliente/x/{id}/{path}` (portal). |
| `nav` | `{ label, page, icon }`: item na seção "Plugins" do menu — a barra lateral do dono (`sidebar.nav`) ou o menu do portal para todos os usuários do cliente (`portal.nav`, páginas `/cliente/x/{id}/{página}`). Ícones: BarChart3, Blocks, Bot, Calendar, ClipboardList, FileText, LayoutDashboard, ListChecks, Puzzle, Settings, Sparkles, Users, Wrench. |
| `routes` | `{ method, path }` (só dono), ex.: `{ "method": "GET", "path": "/itens/:id" }`. |
| `tools` | Nomes das ferramentas dos agentes (só dono). |
| `crons` | Nomes dos crons (só dono). |
| `services` | Serviços do núcleo usados em `inject` (só dono). |

O manifesto é **restritivo**. O kernel recusa registrar rota, ferramenta ou cron que não esteja
declarado, e a ativação falha (a versão anterior continua).

Um **plugin de cliente é só interface**: não tem `server`, rotas, crons, ferramentas, serviços
nem a pasta `server/` (pode ter `pages` e `nav`, que vira o menu do portal). Os dados vêm só das APIs do portal que o usuário já pode chamar.

## 3. Interface (`client/index.tsx`)

- Use client components, sem Server Components.
- Importe as bibliotecas do shell. Elas são a **mesma instância** do app, então nunca empacote
  outra cópia. A lista completa de módulos e exports está em `.opex-sdk/shared-exports.json`.

  | Grupo | Módulos |
  |---|---|
  | Bibliotecas | `react`, `react-dom`, `framer-motion`, `@tanstack/react-query`, `sonner`, `lucide-react`, `date-fns`, `date-fns/locale` |
  | Componentes do app | `@opex/ui/<arquivo>` (ex.: `@opex/ui/card`, `@opex/ui/button`), `@opex/list/<Nome>`, `@opex/metrics/<nome>`, `@opex/feedback/<Nome>` (`EmptyState`, `ErrorState`) |
  | Utilitários | `@opex/theme` (`cn`, `FORM_GRID`) e `@opex/api` (axios do contexto) |
  | SDK | `@opex/plugin-sdk/client` |

- Qualquer outra dependência npm é recusada na compilação.
- Use `usePluginHost()` para ler `pluginId`, `versionNumber`, `channel` (`stable` ou `preview`),
  `scope`, `clientId`, `api` e `routeBase`.
  - No dono: `host.api.get(host.routeBase + "/status")` chama `/api/p/{id}/status`.
  - No portal: `host.api.get("/cliente/tasks")` traz só os dados do cliente da sessão.
- Use `usePluginEvent(event, handler)` para receber em tempo real o que o servidor do plugin
  publicou com `ctx.realtime.publish(event, data)`.
- Props por slot:
  - `dashboard.widgets`: `{}`;
  - `task.panel`: `{ task: { id, code, title, taskType, projectId } }`;
  - `topbar.actions`, `tasks.header`, `financeiro.widgets`: `{}`;
  - `workbench.panel`: `{ workbenchId, taskId }`;
  - `portal.dashboard.widgets`: `{ clientId }`;
  - `portal.task.panel`: `{ taskId, clientId }`.
- Siga a interface do app:
  - tema escuro, cores **só por tokens** (`bg-primary`, `text-muted-foreground`, `border-border`...);
  - textos em pt-BR;
  - estados de carregamento, vazio e erro;
  - animações com `framer-motion`;
  - ícones do `lucide-react`.

  As classes Tailwind usadas no plugin são compiladas no servidor com o tema do app.
- Cada contribuição tem uma fronteira de erro própria. Um erro de render mostra o aviso no slot sem
  derrubar a tela.

## 4. Servidor (`server/index.ts`, só dono)

```ts
import { definePlugin } from "@opex/plugin-sdk/server"

export default definePlugin({
    inject: ["tools", "routes", "cron", "kv", "log", "sdk"],
    apply(ctx) {
        const { z } = ctx.sdk
        ctx.routes.get("/contador", async () => ({ valor: (await ctx.kv.get<number>("contador")) ?? 0 }))
        ctx.tools.register({ name: "somar", label: "Somar ao contador", description: "Soma N ao contador do plugin", risk: "write", input: z.object({ n: z.number() }), execute: async ({ n }) => { const atual = ((await ctx.kv.get<number>("contador")) ?? 0) + n; await ctx.kv.set("contador", atual); return { atual } } })
        ctx.cron.schedule("zerar", { type: "daily", time: "03:00" }, () => ctx.kv.set("contador", 0))
    },
})
```

| Serviço | O que faz |
|---|---|
| `db` | `connect()` (com as migrações do app), `mongoose` e `model(nome)`. |
| `log` | Pino com o id do plugin. |
| `audit` | `record({ acao, entidadeId, antes, depois })` com entidade `plugin:{id}`. |
| `realtime` | `publish(event, data)`: evento `plugin-event` em `private-app`. |
| `integrations` | `get(id)`: configuração de uma integração de `/integracoes`. |
| `ai` | `text(request)` e `stream(request)` pelos provedores configurados (`streamAi`). |
| `tools` | `register({ name, label, description, risk, input, execute })`. O agente vê `plugin_{id}_{nome}` (grupo "Ferramentas de plugins" do Agente Opex e do MCP `opex_app`), com a política de desligar e confirmar do dono. Toda ferramenta de plugin pede Confirmar/Cancelar por padrão e `risk: "read"` vale como `"write"`: só o dono libera a confirmação, ferramenta a ferramenta. |
| `cron` | `schedule(nome, agendamento, run)`. Só intervalos em minutos, diário, semanal ou mensal, no fuso de Brasília. Roda pelo agendador interno, com lease. |
| `routes` | `on(método, caminho, handler)`, `get`, `post`. Rotas em `/api/p/{id}{caminho}` com a sessão do dono. O handler devolve um `Response` ou um valor (vira `{ success: true, data }`). |
| `kv` | `get`, `set`, `delete` e `list(prefixo)`: chave-valor só deste plugin. |
| `sdk` | `z` (Zod), `dateFns` e `ptBR`. O servidor só importa `node:*` e `@opex/plugin-sdk/server`. |

Tudo o que o plugin registra pertence à fiber dele. Recarregar (nova versão, prévia ou rollback) ou
desativar desfaz tudo, sem resíduo. A recarga é **transacional**: se a versão nova falhar ao
importar ou ativar, a anterior continua.

A **prévia** de um plugin do dono roda numa fiber separada, assim:

- rotas: vão para ela só para quem está com a prévia ligada (cookie);
- ferramentas: valem só nos turnos do Agente Opex disparados com a prévia ligada;
- crons: **não rodam** na prévia.

Numa instância de prévia do app (`OPEX_PREVIEW=1`), o código de servidor dos plugins não é ativado.

## 5. Testes

- Os testes ficam em `*.test.ts` e `*.test.tsx`. Os de componente declaram `/** @vitest-environment happy-dom */`.
- Testes de servidor usam `createPluginTestContext(manifest)` de `@opex/plugin-sdk/testing`:

  ```ts
  const test = createPluginTestContext(manifest)
  await test.activate(plugin)
  await test.callTool("somar", { n: 2 })
  await test.callRoute("GET", "/contador")
  await test.runCron("zerar")
  ```

  O contexto aplica as mesmas regras de declaração do kernel. `test.kv`, `test.events`,
  `test.audits` e `test.logs` guardam o que o plugin fez.
- Nos testes de interface, os componentes de `@opex/ui|list|metrics|feedback/*` viram elementos com
  `data-opex="<Nome>"`.
  - `@opex/api` é falso: configure as respostas com `mockApi("get", "/cliente/tasks", { success: true, data })`.
  - `emitPluginEvent(event, data)` simula o tempo real.
- Na etapa "Testes do plugin", o Opex roda `npx vitest run` na pasta. Se falhar, a mesa volta para
  correção. Com os testes passando, a versão é consolidada como `stable` e as telas abertas trocam
  ao vivo.

## Descritivo da mudança

Ao terminar cada implementação ou correção, responda com um bloco ```json``` `{"changeSummary": "…"}`:
o que mudou no plugin em relação à versão anterior, para quem usa o plugin, em pt-BR, de 1 a 4 frases,
sem código nem nomes de arquivos. O Opex grava o texto na versão (aparece em Versões, na página do plugin).

## Logs

`ctx.log.info/warn/error/debug` vão para o debug do plugin (ícone de debug na lista e na página do plugin),
junto com a ativação, os erros de rota, cron e ferramenta e os erros de interface que a tela pegou.
