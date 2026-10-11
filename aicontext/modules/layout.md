# Módulo: Layout e navegação

Casca única do app: sidebar + conteúdo (**sem cabeçalho**). O acesso é protegido por login por
senha única (ver `modules/auth.md`): a tela `/login` fica **fora do shell**.

## Estrutura

- `src/app/layout.tsx` (raiz): `<html class="dark">`, fonte Inter, `PusherConfigBridge`,
  `QueryProvider`, `MotionProvider` e `Toaster` (sonner, tema escuro). `dynamic = "force-dynamic"`:
  o layout lê o ambiente e o banco em tempo de execução — estático, o `next build` do Docker (sem o
  `.env`, que é ignorado no contexto) congelaria "Usuário local" e a config do Pusher.
- `src/app/page.tsx`: redireciona para `HOME_HREF` (`/tarefas`).
- `src/app/icon.png`: favicon PNG transparente de 512 × 512, com apenas o símbolo violeta da
  logo Opex para legibilidade em tamanho pequeno. O Next inclui o ícone automaticamente nos
  metadados de todas as páginas, inclusive login e portal. O mesmo símbolo é usado como logo da
  sidebar (topo), em `public/opex-mark.png`; a logo completa fica em `public/opex-logo.png`.
- `src/app/login/page.tsx`: tela inicial de login, **fora do shell** (ver `modules/auth.md`).
- `src/app/(app)/tarefas/[id]/page.tsx`: página da tarefa; o item "Tarefas" do menu continua ativo.
- `src/app/(app)/tarefas/horas/page.tsx`: Minhas horas (item próprio no menu).
- `src/app/(app)/financeiro/page.tsx`: Financeiro — faturamento das tarefas concluídas por cliente
  (item próprio no menu; ver `modules/finance.md`), envolto no `RepoIndexProvider`.
- `src/app/(app)/desenvolvimento/page.tsx` e `desenvolvimento/[taskId]/page.tsx` (com `layout.tsx`
  que distribui o índice de repositórios): Central de desenvolvimento (item próprio no menu; ver
  `modules/agentic-dev.md`). A central vem do navegador e a tarefa da URL.
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
  anima nem remonta a página — a própria tela anima só o trecho que mudou. Não há cabeçalho: cada página
  tem o próprio título. No celular, o botão "Abrir menu" flutua no canto superior esquerdo
  (`fixed`) e o conteúdo ganha `pt-16`.
- `AppSidebar` + `sidebar/*`: ver `use-para-atualizar-tema-e-componentes-ui.md`, "Menu lateral".
- `sidebar/SidebarFooter`: no desktop (recolhido) mostra só o avatar do dono (`APP_OWNER_NAME`),
  que abre um **popover** com a ação **Sair** (`LogoutButton`, de `src/features/auth/`), que encerra
  a sessão e volta para `/login`; a versão fica na linha inferior da barra. Na gaveta do mobile
  (expandida) o rodapé mantém o dono, a versão e o "Sair" inline.
- `navigation.ts`: `APP_NAV` (Tarefas, Horas agênticas, Financeiro, Central de desenvolvimento; Sistema › Integrações), `HOME_HREF`,
  `PERSISTENT_PAGE_HREFS`, `pageTransitionKey`, `flattenNav`, `formatBadge`, `badgeLabel`, `isActiveHref`, `activeNavHref`.

## Regras

- Novo item de menu: entrada em `APP_NAV` + página em `src/app/(app)/<rota>/page.tsx` (página
  "Em desenvolvimento" enquanto não existir).
- Não há permissões nem multiusuário, mas toda página e API interna exige a sessão: a guarda fica
  em `src/middleware.ts` (`resolveAuthAction`), liberando só `/login`, `/api/auth/*`, `/api/v1/*` e
  `/api/routines/*`. Todo item do menu é sempre visível depois do login.
- Espaçamento horizontal do conteúdo: `CONTENT_PADDING_X` (`px-4 md:px-6 lg:px-8`, em
  `src/features/layout/content-padding.ts`), usado pelo `AppShell`. Para um bloco ir até a borda do
  conteúdo (ex.: kanban rolando para os lados), use `CONTENT_BLEED_X` — nunca repita os valores.
- Quem rola as páginas é o `<main id="main-content">` (`APP_SCROLL_CONTAINER_ID`), não a janela.
  Listas longas rolam com a página (sem container com altura máxima) e, se virtualizadas, usam
  `usePageVirtualizer` (`src/hooks/`); elementos fixos (`sticky top-0`) não podem ter ancestral
  com `overflow` entre eles e o `main`.

## Testes

`__tests__/features/layout/{navigation,app-sidebar,app-shell-drawer}.test.*` e
`__tests__/app/in-development-pages.test.tsx`.
