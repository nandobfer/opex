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
- `src/app/apple-icon.png` (OPE-196): `apple-touch-icon` 180 × 180 opaco, também por convenção de arquivo.
  Como as convenções têm prioridade sobre `metadata.icons`, o layout raiz não declara `icons`.
- Layout raiz e PWA (OPE-196, ver `modules/pwa.md`): `metadata.applicationName`, `appleWebApp`
  (`capable`, título "Opex", barra `black`), `viewport` (`viewportFit: "cover"`, `themeColor` =
  `PWA_BACKGROUND`) e o `ServiceWorkerRegistrar`. `src/app/offline/page.tsx` é a página offline,
  fora da casca.
- **Safe areas** (`src/components/ui/safe-area.ts`): com `viewport-fit=cover`, o app instalado vai até
  as bordas do aparelho. A raiz da casca (`AppShell`, `SAFE_AREA_PADDING`), a gaveta do celular e a
  tela cheia do chat (`SAFE_AREA_Y`), as folhas (`Sheet`, `SAFE_AREA_SHEET`, aplicada depois do
  `className` do chamador para um padding dele não descartá-la), a barra de lote das Tarefas
  (`SAFE_AREA_FLOATING_BOTTOM`), os logs maximizados da central (`SAFE_AREA_INSET_4`), a imagem ampliada do
  chat (`SAFE_AREA_INSET_6`) e os toasts no celular (`SAFE_AREA_TOAST_MOBILE_OFFSET`) reservam os insets.
  Testes em `__tests__/components/safe-area.test.tsx`. No desktop e no navegador comum os insets valem 0. Elemento novo fixo numa borda usa
  essas constantes.
- `src/app/login/page.tsx`: tela inicial de login, **fora do shell** (ver `modules/auth.md`).
- `src/app/(app)/dashboard/page.tsx`: **Dashboards** — página inicial do app, **sem item no menu**:
  a logo no topo da barra leva a ela (ver `modules/dashboard.md`).
- `src/app/(app)/tarefas/[id]/page.tsx`: página da tarefa pelo código (`/tarefas/ope-145`; o id redireciona,
  ver `modules/tasks.md`); o item "Tarefas" do menu continua ativo.
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
- `AppShell`: sidebar (desktop) ou gaveta (< 1024px; fecha por Esc, fundo, link do menu e também a
  cada troca de rota, para links que não são itens do menu, como o atalho "Configurar OpenCode no
  host" do painel "Servidor e quota"), `RealtimeStatusBanner` e
  `<main id="main-content">` com transição de página (Framer Motion). No desktop a sidebar é
  **sempre recolhida** (68px): não há botão de recolher/expandir. A chave da transição é
  `pageTransitionKey(pathname, persistentHrefs)`: telas com sub-rotas que são a mesma tela
  (`PERSISTENT_PAGE_HREFS`, hoje `/desenvolvimento`) usam o prefixo, então navegar dentro delas não
  anima nem remonta a página — a própria tela anima só o trecho que mudou. A chave da casca não basta
  quando as sub-rotas são arquivos de página ou valores de segmento dinâmico diferentes (o Next remonta
  a página): nesse caso a tela mora no layout do prefixo. No desktop não há cabeçalho: cada página
  tem o próprio título. No celular (< 1024px) há o cabeçalho `MobileAppHeader` (abaixo).
- `header/MobileAppHeader` (OPE-168): cabeçalho do celular, só abaixo de 1024px (a mesma condição da
  gaveta: nunca há dois botões de menu). Da esquerda para a direita: a **logo** (`BrandMark`, a mesma
  marca do menu lateral; link para `brand.homeHref` com o nome da marca como rótulo), o botão
  **Abrir menu** (abre a gaveta; `aria-expanded`/`aria-controls`, foco devolvido ao fechar e inerte com
  a gaveta aberta, como antes) e, alinhados à direita, os atalhos `mobileHeaderActions` do `AppShell`.
  O divisor embaixo faz parte do componente. Todos os botões usam `header/HeaderIconButton` (44px,
  `aria-label` obrigatório).
  - Atalhos: no dono, **Agente Opex** (`AgentChatNavItem variant="header"`) e **Servidor**
    (`ServerQuotaSidebarItem variant="header"`); no portal do cliente, só o agente de chat (some sem
    agentes ligados; a área vazia fica oculta). Com atalhos no cabeçalho, a gaveta do celular **não**
    repete o rodapé `sidebarFooterItems` (uma instância só, sem atalhos de teclado e escutas globais
    duplicados); no desktop o rodapé continua igual.
  - Rolagem: `useAppScrollCompact` escuta o `scroll` do `<main id="main-content">` (captura no
    `document`; rolagens de painéis internos não contam) e decide por `nextHeaderCompact`
    (`mobile-header.ts`, puro): recolhe acima de 24px e volta ao topo abaixo de 4px (folga para não
    piscar). Recolhido, a logo, o fundo e o divisor saem com animação, o hamburger desliza
    (`HEADER_LOGO_SLOT`) para o lugar da logo e os botões viram "chips" flutuando sobre o conteúdo
    (`useMobileHeaderFloating`); ao voltar ao topo tudo volta animado. A cada troca de rota o estado
    recomeça no topo. Com `prefers-reduced-motion`, a troca é instantânea.
  - Sem pulo de layout: o cabeçalho fica por cima da área que rola (`absolute`, `z-30`, dentro de um
    invólucro `relative` abaixo do `RealtimeStatusBanner`) com altura fixa nos dois estados, e o conteúdo
    reserva sempre `MOBILE_HEADER_OFFSET_CLASS` (`pt-16`). A faixa não captura toques fora dos botões
    (`pointer-events-none`). Elementos maximizados sobre o conteúdo (`useMaximizedFrame`) começam abaixo
    do cabeçalho (`[data-app-header]`), para ele não cobrir a barra do painel.
  - Telas imersivas (sem rolagem da casca) mostram o cabeçalho no estado do topo.
- `AppSidebar` + `sidebar/*`: ver `use-para-atualizar-tema-e-componentes-ui.md`, "Menu lateral".
- `sidebar/SidebarFooter`: no desktop (recolhido) mostra só o avatar do dono (`APP_OWNER_NAME`),
  que abre um **popover** com a ação **Sair** (`LogoutButton`, de `src/features/auth/`), que encerra
  a sessão e volta para `/login`; a versão fica na linha inferior da barra. Na gaveta do mobile
  (expandida) o rodapé mantém o dono, a versão e o "Sair" inline.
- Acima do rodapé, o `AppSidebar` aceita `footerItems` (repassado pelo `AppShell` como
  `sidebarFooterItems`): o menu do dono (`AppLayoutShell`) mostra, acima dos agentes, o item
  **"Servidor e quota"** (OPE-145, `ServerQuotaSidebarItem`, sobre o `SidebarHoverButtonItem`: botão que
  não navega e abre um painel por hover, clique, toque e teclado; tooltip com `SidebarTooltip suppressed`
  enquanto o painel está aberto; o `SidebarHoverPanel` aceita `focusSelector` para painéis com botões) —
  ver `modules/host-metrics.md`. O `AppLayoutShell` e o `ClientePortalShell` usam, com o
  **item único dos agentes de chat** (`AgentChatNavItem`): abre o último agente escolhido (Agente
  Opex ou Agente Maddox) num popover, com a troca no cabeçalho; nome, ícone e cor acompanham o agente
  ativo (Ctrl+Shift+O / Ctrl+Shift+M) — ver `modules/opex-agent.md` e `modules/maddox-agent.md`. No
  portal, o item fica sempre montado e aparece quando algum dos dois está ligado para o cliente, inclusive
  quando o dono liga em tempo real (sem recarregar); sem nenhum, o rodapé vazio com o divisor some
  (`empty:hidden` na lista do rodapé).
- `navigation.ts`: `APP_NAV`, uma seção sem título com, nesta ordem: Tarefas, Central de
  desenvolvimento (ícone `</>` `CodeXml`), Engramind e os **grupos** (`NavGroupDef`, `kind: "group"`)
  **Agentes** (`Bot`: os 10 agentes do catálogo `AGENT_CATALOG` de `src/features/agent-metrics/catalog.ts`,
  na ordem do fluxo e sem a palavra "Agente" — Opex, Maddox, Orçamentista, Catalogador, Refinador,
  Desenvolvedor, Arquiteto, Adversário, Revisor e Mentor —, com os mesmos nomes e ícones das abas de
  `/integracoes/ia`; cada item leva a `/agente-<nome>`, ver `modules/agent-metrics.md`), **Contábil** (`Landmark`: Horas
  agênticas, Financeiro), o item **Integrações** (`Plug`, `panel: "integrations"`) e o grupo
  **Configurações** (`Settings`: Ambientes, Aparência — `/configuracoes/aparencia`, ícone `Palette`;
  `/configuracoes` redireciona para ela, ver `modules/settings.md` — e Plugins, `/plugins`, ícone `Blocks`, ver
  `modules/plugins.md`). Os plugins ativos que declaram `nav` acrescentam, ao vivo, a seção **"Plugins"** no fim do
  menu (`useNavWithPlugins` no `AppLayoutShell`, páginas em `/x/{id}/...`). Dashboards não tem
  item (a logo leva a ela). Também exporta `HOME_HREF` (`/dashboard`), `PERSISTENT_PAGE_HREFS`,
  `pageTransitionKey`, `flattenNav` (expande os grupos: `APP_NAV_ITEMS` tem todas as rotas
  navegáveis), `navGroupActive`, `formatBadge`, `badgeLabel`, `isActiveHref` e `activeNavHref`.
- `sidebar/SidebarNavGroup` (+ `src/hooks/useHoverPopover`): o grupo é um item da barra que abre um
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
- `sidebar/SidebarHoverPanel`: moldura comum dos painéis (grupos e itens com painel): portal do Radix
  Popover, posição/limites, animação, título e setas entre os links.
- **Item com painel de hover** (`NavItemDef.panel`, `sidebar/SidebarHoverNavItem`): um link que
  **navega no clique** e, com a barra recolhida, abre um painel à direita ao passar o mouse (mesmo
  `useHoverPopover` dos grupos — `src/hooks/useHoverPopover.ts`, compartilhado; a opção `pinOnClick`, usada
  no detalhe de memória da mesa, faz o clique fixar o painel —: dois sinais de presença, fecha 150 ms depois de sair dos dois; toque não
  abre). O link é `Popover.Anchor` (não gatilho), então o clique não alterna o painel. Teclado: Enter
  navega, **seta →** abre o painel com o foco no primeiro link (`openFromKeyboard`) e Esc fecha
  devolvendo o foco ao item. Mudar de rota fecha. O conteúdo vem de fora do layout:
  `AppSidebar.itemPanels` (repassado pelo `AppShell` como `sidebarItemPanels`) mapeia a chave
  (`NavPanelKey`, hoje só `integrations`) para o componente do item; o `AppLayoutShell` liga
  `integrations` ao `IntegrationsSidebarItem` (ver `modules/integrations.md`, "Submenu de Integrações
  na sidebar"). Na gaveta do celular, ou sem o componente (portal do cliente), o item é um link simples.
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
- Na **Central de desenvolvimento** (`/desenvolvimento` e sub-rotas, lista `EVEN_PADDING_PAGE_HREFS`
  de `navigation.ts`, opção `evenPaddingHrefs` do `AppShell`) o horizontal é igual ao vertical também
  no desktop: `CONTENT_PADDING_X_EVEN` (`px-4 md:px-6`, 24px a partir de 768px, igual ao `py-6`). As
  demais telas e o portal do cliente seguem `CONTENT_PADDING_X` (OPE-112).
- Quem rola as páginas é o `<main id="main-content">` (`APP_SCROLL_CONTAINER_ID`), não a janela.
  Listas longas rolam com a página (sem container com altura máxima) e, se virtualizadas, usam
  `usePageVirtualizer` (`src/hooks/`); elementos fixos (`sticky top-0`) não podem ter ancestral
  com `overflow` entre eles e o `main`.

## Testes

`__tests__/features/layout/{navigation,app-sidebar,app-shell-drawer,app-shell-padding,sidebar-nav-group,sidebar-hover-nav-item,sidebar-hover-button-item,app-layout-shell}.test.*`,
`__tests__/features/integrations/integrations-sidebar-item.test.tsx` e
`__tests__/app/in-development-pages.test.tsx`.
