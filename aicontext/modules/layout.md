# Módulo: Layout e navegação

Casca única do app: sidebar + conteúdo (**sem cabeçalho**). O acesso é protegido por login por
senha única (ver `modules/auth.md`): a tela `/login` fica **fora do shell**.

## Estrutura

- `src/app/layout.tsx` (raiz): `<html class="dark">`, fonte Inter, `PusherConfigBridge`,
  `QueryProvider`, `MotionProvider` e `Toaster` (sonner, tema escuro). `dynamic = "force-dynamic"`:
  o layout lê o ambiente e o banco em tempo de execução — estático, o `next build` do Docker (sem o
  `.env`, que é ignorado no contexto) congelaria "Usuário local" e a config do Pusher.
- `src/app/page.tsx`: redireciona para `HOME_HREF` (`/dashboard`).
- `src/app/icon.png`: favicon PNG transparente de 512 × 512, com apenas o símbolo violeta da
  logo Opex para legibilidade em tamanho pequeno. O Next inclui o ícone automaticamente nos
  metadados de todas as páginas, inclusive login e portal. O mesmo símbolo é usado como logo da
  sidebar (topo), em `public/opex-mark.png`; a logo completa fica em `public/opex-logo.png`.
- `src/app/login/page.tsx`: tela inicial de login, **fora do shell** (ver `modules/auth.md`).
- `src/app/(app)/dashboard/page.tsx`: **Dashboards** — página inicial do app, **sem item no menu**:
  a logo no topo da barra leva a ela (ver `modules/dashboard.md`).
- `src/app/(app)/tarefas/[id]/page.tsx`: página da tarefa; o item "Tarefas" do menu continua ativo.
- `src/app/(app)/tarefas/horas/page.tsx`: Horas agênticas (no grupo **Contábil** do menu).
- `src/app/(app)/financeiro/page.tsx`: Financeiro — faturamento das tarefas concluídas por cliente
  (no grupo **Contábil** do menu; ver `modules/finance.md`), envolto no `RepoIndexProvider`.
- `src/app/(app)/desenvolvimento/layout.tsx`: Central de desenvolvimento (item próprio no menu; ver
  `modules/agentic-dev.md`). Distribui o índice de repositórios e renderiza a tela **no layout**
  (`DevCenterRoute`, tarefa por `useParams`); `desenvolvimento/page.tsx` e
  `desenvolvimento/[taskId]/page.tsx` retornam `null`. A central vem do navegador e a tarefa da URL.
- `src/app/(app)/tarefas/layout.tsx`: `TimerProvider` (timers locais) para as três páginas.
- Item ativo do menu = o de `href` mais específico que casa com o caminho (`activeNavHref`): em
  `/tarefas/horas` fica "Minhas horas"; em `/tarefas/123`, "Tarefas".
- `src/app/(app)/layout.tsx`: monta `AppLayoutShell` com o dono do app (`getLocalUser().name`,
  de `APP_OWNER_NAME`) e a versão (`APP_VERSION`, injetada do `package.json` pelo `next.config.ts`).
- `src/app/(app)/[...rest]/page.tsx`: endereço desconhecido → `ShellNotFound` dentro do shell.
- `src/app/not-found.tsx`: 404 fora do shell.

## Componentes (`src/features/layout/`)

- `AppLayoutShell`: marca "Opex", `APP_NAV`, "Menu principal".
- `AppShell`: sidebar (desktop) ou gaveta (< 1024px), `RealtimeStatusBanner` e
  `<main id="main-content">` com transição de página (Framer Motion). No desktop a sidebar é
  **sempre recolhida** (68px): não há botão de recolher/expandir. A chave da transição é
  `pageTransitionKey(pathname, persistentHrefs)`: telas com sub-rotas que são a mesma tela
  (`PERSISTENT_PAGE_HREFS`, hoje `/desenvolvimento`) usam o prefixo, então navegar dentro delas não
  anima nem remonta a página — a própria tela anima só o trecho que mudou. A chave da casca não basta
  quando as sub-rotas são arquivos de página ou valores de segmento dinâmico diferentes (o Next remonta
  a página): nesse caso a tela mora no layout do prefixo. Não há cabeçalho: cada página
  tem o próprio título. No celular, o botão "Abrir menu" flutua no canto superior esquerdo
  (`fixed`) e o conteúdo ganha `pt-16`.
- `AppSidebar` + `sidebar/*`: ver `use-para-atualizar-tema-e-componentes-ui.md`, "Menu lateral".
- `sidebar/SidebarFooter`: no desktop (recolhido) mostra só o avatar do dono (`APP_OWNER_NAME`),
  que abre um **popover** com a ação **Sair** (`LogoutButton`, de `src/features/auth/`), que encerra
  a sessão e volta para `/login`; a versão fica na linha inferior da barra. Na gaveta do mobile
  (expandida) o rodapé mantém o dono, a versão e o "Sair" inline.
- Acima do rodapé, o `AppSidebar` aceita `footerItems` (repassado pelo `AppShell` como
  `sidebarFooterItems`): o `AppLayoutShell` (menu do dono) e o `ClientePortalShell` usam, com o
  **item único dos agentes de chat** (`AgentChatNavItem`): abre o último agente escolhido (Agente
  Opex ou Agente Maddox) num popover, com a troca no cabeçalho; nome, ícone e cor acompanham o agente
  ativo (Ctrl+Shift+O / Ctrl+Shift+M) — ver `modules/opex-agent.md` e `modules/maddox-agent.md`. No
  portal, o item fica sempre montado e aparece quando algum dos dois está ligado para o cliente, inclusive
  quando o dono liga em tempo real (sem recarregar); sem nenhum, o rodapé vazio com o divisor some
  (`empty:hidden` na lista do rodapé).
- `navigation.ts`: `APP_NAV`, uma seção sem título com, nesta ordem: Tarefas, Central de
  desenvolvimento (ícone `</>` `CodeXml`), Engramind e os **grupos** (`NavGroupDef`, `kind: "group"`)
  **Agentes** (`Bot`: Agente Revisor, Agente Adversário, Agente Mentor), **Contábil** (`Landmark`: Horas
  agênticas, Financeiro) e **Configurações** (`Settings`: Integrações, Ambientes). Dashboards não tem
  item (a logo leva a ela). Também exporta `HOME_HREF` (`/dashboard`), `PERSISTENT_PAGE_HREFS`,
  `pageTransitionKey`, `flattenNav` (expande os grupos: `APP_NAV_ITEMS` tem todas as rotas
  navegáveis), `navGroupActive`, `formatBadge`, `badgeLabel`, `isActiveHref` e `activeNavHref`.
- `sidebar/SidebarNavGroup` (+ `hooks/useHoverPopover`): o grupo é um item da barra que abre um
  painel **à direita, fora da barra** (portal do Radix Popover, ancorado ao gatilho, `sideOffset` 12 e
  limitado à janela), animado com Framer Motion. Abre ao **passar o mouse** e também por **clique,
  toque e teclado**:
  - o hover usa dois sinais de presença (gatilho e painel) com eventos de ponteiro, e só fecha
    150 ms depois que o cursor saiu dos dois;
  - toque não conta como hover;
  - clique com o mouse em cima mantém o painel aberto;
  - Enter/Espaço focam o primeiro link, as setas ↑/↓ (e Home/End) percorrem os links, e Esc fecha
    só o painel (não a gaveta do celular) e devolve o foco ao gatilho.

  Escolher um item ou mudar de rota fecha o painel. O gatilho fica ativo (fundo e barra primária)
  quando a rota atual é de um item do grupo (`navGroupActive`), e o link ativo tem `aria-current="page"`.
  Na gaveta do celular (expandida, 240px), o painel abre por toque **abaixo do gatilho** (`side="bottom"`),
  porque à direita da gaveta não caberia em telas de 360–430px; a largura fica limitada ao espaço
  disponível (`--radix-popover-content-available-width`).
- `sidebar/SidebarItemSurface`: superfície visual comum dos itens (link, grupo e o item do agente de
  chat): entrada, `whileHover x:4`, `whileTap`, estado ativo e barra primária com `layoutId`.

## Regras

- Novo item de menu: entrada em `APP_NAV` + página em `src/app/(app)/<rota>/page.tsx` (página
  "Em desenvolvimento" enquanto não existir).
-  Não há permissões nem multiusuário **no app do dono**, mas toda página e API interna exige a
   sessão: a guarda fica em `src/middleware.ts` e na decisão pura `resolveAuthDecision`
   (`src/features/auth/paths.ts`). O dono (`kind: "admin"`) passa em tudo; o **usuário de cliente**
   (`kind: "client"`) fica restrito ao portal (`/cliente/*`, `/api/cliente/*`). Ver
   `modules/auth.md` e `modules/orcamentos.md`.
- O **portal do cliente** tem casca própria (`ClientePortalShell`), reaproveitando o `AppShell` com a
   navegação `clienteNav`: Dashboard, Tarefas e, para o admin do cliente, Financeiro e Usuários. Os
   itens internos do dono (Horas agênticas, Central de desenvolvimento, Integrações) não aparecem lá.
- Espaçamento horizontal do conteúdo: `CONTENT_PADDING_X` (`px-4 md:px-6 lg:px-8`, em
  `src/features/layout/content-padding.ts`), usado pelo `AppShell`. Para um bloco ir até a borda do
  conteúdo (ex.: kanban rolando para os lados), use `CONTENT_BLEED_X` — nunca repita os valores.
- Quem rola as páginas é o `<main id="main-content">` (`APP_SCROLL_CONTAINER_ID`), não a janela.
  Listas longas rolam com a página (sem container com altura máxima) e, se virtualizadas, usam
  `usePageVirtualizer` (`src/hooks/`); elementos fixos (`sticky top-0`) não podem ter ancestral
  com `overflow` entre eles e o `main`.

## Testes

`__tests__/features/layout/{navigation,app-sidebar,app-shell-drawer,sidebar-nav-group}.test.*` e
`__tests__/app/in-development-pages.test.tsx`.
