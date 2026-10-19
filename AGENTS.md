# AGENTS.md

Guia normativo para qualquer IA que trabalhe neste repositório.

O **Opex** é um app Next.js **de uso pessoal**: um único **dono**, protegido por um login com
credenciais do `.env` (`ADMIN_USER`/`ADMIN_EMAIL`/`ADMIN_PASSWORD`) e que pode ser publicado na
internet. É a **fonte de verdade** das suas tarefas: gerenciar tarefas, apontar horas e automatizar o
desenvolvimento, com um módulo de **Integrações** para configurar serviços e guardar credenciais. O
app também hospeda o **portal do cliente** de Orçamentos (`/cliente`), onde existem **usuários**
(login por URL ou username/email). O core (tema, componentes, layout, integrações, Pusher, crons) foi
copiado do CRM Marketing Campanhas (`~/code/crm-marketing-campanhas`, branch `dev`).

## 1. Ordem obrigatória de leitura

Antes de implementar, leia nesta ordem:

1. `aicontext/README.md`
2. `aicontext/use-sempre-que-desenvolver.md`
3. `aicontext/use-diretrizes-do-projeto.md` quando houver decisão técnica ou arquitetural envolvida
4. O guia específico da tarefa:
   - Módulos: `aicontext/modules/*.md`
   - UI, tema, componentes e animações: `aicontext/use-para-atualizar-tema-e-componentes-ui.md`
   - Tempo real: seção 3, "Tempo real (Pusher)"

## 2. Regras não negociáveis

- Use TypeScript estrito. Evite `any`; não use `@ts-ignore` sem justificativa explícita.
- Mantenha separação de responsabilidades:
  - `src/app`: rotas, páginas, layouts e handlers do Next.js
  - `src/features`: regras e fluxos de negócio
  - `src/lib`: infraestrutura compartilhada (banco, logger, Pusher, integrações, constantes)
  - `src/components`: UI genérica e reutilizável
- **Login do dono por credenciais do `.env`** (`ADMIN_USER`/`ADMIN_EMAIL`/`ADMIN_PASSWORD`, sessão
assinada por `AUTH_SECRET`; ver `aicontext/modules/auth.md`). O app do dono **não** tem cadastro,
cargos, `companyId`, slug nem guardas de permissão. Toda ação do dono é do usuário local
(`getLocalUser()` de `src/lib/local-user.ts`). **Usuários existem apenas no portal do cliente** de
Orçamentos (flag `admin` por vínculo, senha scrypt); não introduza perfis/permissões no app do dono
sem pedido explícito.
- **O app só pode ser exposto à internet atrás do login** (dono ou usuário de cliente). Outros
  sistemas acessam endpoints públicos por **token de sistema** (Integrações › API interna).
- Credenciais de serviços externos (ex.: token do GitHub, chaves dos provedores de IA) ficam como
  **campo privado da integração** (cifrado no banco); nunca no código, no navegador ou em `.env`
  versionado.
- **Configuração de integrações só pela tela `/integracoes`**: integração ou campo novo **não**
  declara `env` nem ganha variável no `.env`/`.env.example` (o `env` legado existe só nas
  integrações herdadas do CRM).
- **Tema escuro fixo com primária `#8000FF`**: cores só por tokens (`bg-primary`, `text-foreground`,
  `bg-sidebar`...), nunca valores hardcoded nem `bg-*-100` sem variante escura.
- **A experiência do usuário é prioridade.** Toda transição de estado perceptível deve ser
  animada quando adequado, **sempre com Framer Motion** (seção 3).
- Dados exibidos que mudam no servidor atualizam em **tempo real via Pusher**, com eventos
  disparados só pelo servidor em canais privados (seção 3, "Tempo real").
- A seção 5 é a stack adotada. Novas bibliotecas podem entrar quando necessárias, mas não
  adicione uma que duplique a função de outra já adotada (animação, toast, ícones, datas,
  drag-and-drop, formulários, gráficos ou tempo real).
- Operações relevantes preservam auditoria (`recordAudit`) e logging estruturado (Pino).
- Mensagens para usuário, erros acionáveis e estados vazios devem estar em pt-BR.
- Nunca execute comandos de build (`pnpm build`, `pnpm run build`, `next build` ou equivalentes)
  sem solicitação explícita do usuário. Valide normalmente com TypeScript, ESLint e Vitest.
- **Nunca execute a suíte completa de testes sem solicitação explícita do usuário.** Ao
  desenvolver, execute apenas os testes específicos do código afetado, selecionando explicitamente
  os arquivos e/ou casos pertinentes; não rode comandos de testes sem filtro.
- Não use filas (BullMQ), Valkey/Redis nem workers dedicados. Trabalho periódico é rotina do
  agendador interno (Integrações › Crons: `setInterval` no `instrumentation.ts`).
- O projeto é um app Next.js único com pnpm. Não transforme o repositório em monorepo.
- Scripts avulsos rodam com `npx tsx`; não adicione scripts customizados ao `package.json` (só os
  padrão: `dev`, `build`, `start`, `lint`, `test`).
- **Toda tarefa de desenvolvimento segue o fluxo obrigatório da seção 4**: implementar →
  documentar em `aicontext/` → cobrir com testes Vitest. Não encerre uma tarefa com testes ou
  documentação pendentes sem justificativa explícita.

## 3. Padrões operacionais

### Referência: CRM Marketing Campanhas (`~/code/crm-marketing-campanhas`)

- É a origem do core deste app. Componentes, hooks e padrões que ainda não foram copiados (ex.:
  gráficos do dashboard, importação de planilha) podem ser **lidos e copiados** (e adaptados).
- **Nunca importe** arquivos de lá nem altere aquele repositório a partir daqui.
- Ao copiar, adapte: sem `companyId`/slug, sem Clerk/permissões, tema escuro por tokens.

### APIs

- Rotas ficam em `src/app/api`, com `withRoute` (`src/lib/api/route.ts`) e `DomainError` para
  erros de regra.
- Valide payloads com Zod (`parseBody`).
- Retorne respostas padronizadas compatíveis com `ApiResponse` ou `PaginatedResponse`.
- Em código cliente, use o axios do projeto (`baseURL: '/api'`) e chame endpoints **sem**
  prefixar `/api` (`api.get('/integrations')`, nunca `api.get('/api/integrations')`).
- Consumo no cliente passa por hooks com TanStack Query; nada de `fetch` solto em componente.

### API pública por token — documentação OpenAPI obrigatória

- Endpoint público é a rota autenticada **apenas por token de sistema** (`requireApiToken`),
  consumível por outros sistemas (ex.: `GET /api/v1/whoami`).
- **Sempre que criar, alterar ou remover um endpoint público**, atualize no mesmo commit a
  especificação OpenAPI (`src/features/public-api/openapi/spec.ts`) e `PUBLIC_TOKEN_ROUTES`:
  caminho, parâmetros, corpo, respostas por status, exemplos e esquema de segurança.
- Corpos e respostas vêm dos mesmos schemas Zod usados pela rota; nunca duplique o contrato à mão
  quando existir schema.

### UI e frontend

- Prefira componentes Shadcn/Radix já disponíveis; crie wrappers por composição em vez de
  reescrever componentes.
- Não coloque regra de negócio complexa dentro de componentes. Extraia lógica para hooks
  (`use*`), serviços ou utilitários da feature.
- Componentes devem ter responsabilidade única e até ~200 linhas; ao se aproximar, decomponha.
- Mantenha responsividade, loading (skeleton), vazio (ícone + texto + ação), erro (com tentar
  novamente) e confirmação explícita em ações críticas (excluir, revogar, parar timer).
- Telas de listagem usam o kit de `src/components/list` (`CadastroHeader`, `ListFilters`,
  `CadastroTableCard`, `TableAction`...).
- Formulários usam react-hook-form + `zodResolver` com **o mesmo schema Zod da API**, validação em
  tempo real e mensagens pt-BR.
- **Campos de formulário ocupam toda a largura disponível**: nenhum campo, seletor ou grupo termina
  antes do fim da linha (sem `max-w-*`/`w-[...]` em campo). Em grades de 2 colunas, o último campo
  sozinho ocupa a linha inteira (`FORM_GRID` de `src/components/ui/form-grid.ts`). Escolha única
  numa lista pequena usa `OptionTabs`. Detalhes em
  `aicontext/use-para-atualizar-tema-e-componentes-ui.md`, "Formulários".
- Feedback de ação usa toasts do **sonner**. Ícones apenas do **lucide-react**. Datas com
  **date-fns** (locale pt-BR).
- Listas com mais de 50 itens usam virtualização (**TanStack Virtual**). Busca local tolerante a
  erro de digitação usa **fuse.js**.
- Filtros de listas ficam na URL (`useUrlFilters`) **ou**, quando devem persistir indefinidamente
  (ex.: Tarefas), no `localStorage` com `usePersistentState` (chave versionada + schema Zod).
- Recursos fora do escopo que aparecem na interface são marcados "Em desenvolvimento", sem dados
  simulados nem controles que pareçam funcionar.
- Novo item de menu: entrada em `APP_NAV` (`src/features/layout/navigation.ts`) + página em
  `src/app/(app)/`.
- Use `"use client"` só quando houver interatividade; prefira Server Components para leitura.

### Experiência do usuário e animações (Framer Motion)

- **Anime sempre que for adequado, e sempre com Framer Motion** (`framer-motion`):
  - entrada/saída de elementos, diálogos, drawers, popovers e toasts (`AnimatePresence`);
  - troca de abas e de etapas de assistentes (`AnimatePresence mode="wait"`);
  - listas que ganham, perdem ou reordenam itens;
  - feedback de sucesso, erro e carregamento de ações;
  - números e contadores que mudam (`AnimatedNumber`), inclusive o cronômetro de horas;
  - reordenação por arrastar (`Reorder` ou dnd-kit + `motion`).
- Não anime com CSS/JS manual nem com outra biblioteca quando o Framer Motion atende. Transições
  triviais de hover/foco podem usar classes Tailwind.
- **Exceção — gráficos:** o desenho das séries usa a animação interna do recharts, desligada com
  movimento reduzido. Blocos e cards ao redor continuam com Framer Motion.
- **Exceção — fundo da tela de login:** o campo de partículas usa **tsParticles** (`@tsparticles/react`
  + `@tsparticles/slim`, receita "links"), fora do escopo do Framer Motion (canvas). Ver
  `aicontext/modules/auth.md`. No restante da UI a animação continua só com Framer Motion.
- Animações são curtas (≈150–300 ms), não bloqueiam a interação nem atrasam dados e respeitam
  `prefers-reduced-motion` (`useReducedMotion`/`MotionConfig reducedMotion="user"`).
- Mutações com efeito visual imediato (iniciar/parar timer, mover tarefa) usam **resposta
  otimista** (TanStack Query) com **reversão animada** e toast em caso de falha.
- Cuidados herdados:
  - use `layout`/`layoutId` com parcimônia e teste a tela: em páginas com muitos elementos ou
    portais já causaram tela em branco;
  - nos testes Vitest, faça mock de `framer-motion` (`__tests__/helpers/framer-motion.tsx`).

### Tempo real (Pusher)

- `pusher` no servidor e `pusher-js` no cliente, configurados na integração Pusher (banco → `.env`).
  Compatível com Soketi (modo "Host próprio").
- Eventos são disparados **somente pelo servidor**, depois da mutação persistida e da auditoria
  (`publishAppEvent` de `src/lib/pusher/channels.ts`). O cliente nunca publica eventos.
- Canais **privados** conhecidos: `private-app` (dados das telas) e `private-integration-{id}`
  (debug/status das integrações) — só o dono —, `private-client-{clientId}` (portal do cliente) e
  `private-repo-recents-{ator}` (histórico do próprio ator). Canal novo exige regra em
  `src/lib/pusher/channel-auth.ts`.
- Payloads mínimos (ids e o que mudou), sem dados sensíveis. O cliente reage invalidando ou
  atualizando o cache do TanStack Query, em hooks da feature (`use*Realtime`) com assinatura em
  `useEffect` e cancelamento na desmontagem.
- Ao reconectar, o cliente refaz as consultas afetadas; a tela avisa discretamente quando a
  conexão cai (`RealtimeStatusBanner`).

### Banco, auditoria e integrações

- Conecte ao banco antes de usar Mongoose (`dbConnect()`, conexão cacheada + migrações).
- Registre auditoria em mutações relevantes (`recordAudit`: usuário local, data/hora, ação,
  valores antigo/novo; nunca segredos).
- Logs estruturados com **Pino** (`logger`/`loggerFor`); nunca `console.log` em código de produção.
- Use os serviços centrais (banco, auditoria, logger, realtime, integrações, axios) em vez de
  instanciar clientes novos em cada feature.
- Serviço externo novo = entrada no catálogo de integrações (`src/lib/integrations/catalog.ts`)
  com campos públicos/privados, tester e debug, seguindo `aicontext/modules/integrations.md`.

## 4. Fluxo obrigatório: implementar → documentar → testar

Toda tarefa de desenvolvimento (feature, fix ou refactor) **deve** seguir esta ordem, sem exceção.
Não considere a tarefa concluída se qualquer etapa foi pulada.

### Step 1 — Implementação

1. Classifique a mudança como **feature** ou **fix** (palavras como "corrigir", "fix", "bug"
   indicam fix; "adicionar", "implementar", "criar" indicam feature).
2. Explore o codebase e leia o contexto pertinente em `aicontext/` antes de escrever código.
3. Implemente seguindo os padrões do projeto (tipos estritos, arquitetura app/features/lib,
   auditoria e logging).
4. Registre quais arquivos/módulos foram tocados — você precisará disso nos steps 2 e 3.

### Step 2 — Documentação em `aicontext/`

1. Infira o(s) módulo(s) pelos arquivos modificados (ex.: mudanças em `src/features/tasks/` →
   doc do módulo `tasks`).
2. Localize o arquivo de módulo correspondente em `aicontext/modules/` (ou o guia de tópico
   pertinente) e **respeite a estrutura existente**.
3. Regras de atualização:
   - **Feature nova**: adicione uma nova entrada descrevendo comportamento esperado, entradas,
     saídas e regras de negócio.
   - **Fix que muda comportamento documentado**: atualize a descrição existente para refletir o
     comportamento **correto** (descreva o funcionamento atual, não o bug).
   - **Fix interno sem mudança observável**: **não** altere a doc — seria redundante.
   - **Módulo sem doc ainda**: crie o arquivo do módulo em `aicontext/modules/` com a seção
     pertinente e registre-o no índice de `aicontext/README.md`.
4. Não crie docs para módulos que não foram tocados.

### Step 3 — Cobertura de testes (Vitest)

1. Localize testes existentes em `__tests__/` e identifique o padrão (naming `*.test.ts`,
   estrutura de `describe`/`it`, mocks, helpers).
2. Escreva testes seguindo **exatamente** o padrão existente.
3. O que cobrir:
   - **Feature nova**: caminho feliz + ao menos um caso de borda relevante.
   - **Fix**: ao menos um teste de regressão que falharia com o bug antigo e agora passa.
4. Foque em comportamento e regra de negócio, não em detalhes de implementação.
5. Execute apenas os testes específicos do código afetado, com seleção explícita de arquivos
   e/ou casos. A suíte completa só pode ser executada quando solicitada explicitamente pelo usuário.

### Entregáveis ao final de toda tarefa

- [ ] Código implementado e funcionando.
- [ ] `aicontext/` criado ou atualizado quando a mudança justifica (ou justificativa explícita de
      por que não).
- [ ] Testes Vitest escritos cobrindo a mudança (happy path + borda para feature; regressão para
      fix).

## 5. Stack adotada

- Aplicação: app Next.js único, gerenciado com pnpm
- Framework: Next.js 16 + React 19
- Linguagem: TypeScript 5 em modo strict
- UI: Tailwind CSS 4 + Shadcn/ui + Radix, tema escuro fixo (primária `#8000FF`)
- Auth: login do dono (`ADMIN_USER`/`ADMIN_EMAIL`/`ADMIN_PASSWORD`) e usuários de cliente (scrypt),
sessão em cookie assinado com `kind` (`admin`/`client`), guarda em `src/middleware.ts` e papéis finos
no servidor Node (`src/features/auth/server/context.ts`); API pública por token de sistema
(`aicontext/modules/auth.md`, `aicontext/modules/orcamentos.md`)
- Banco: MongoDB + Mongoose
- Estado assíncrono: TanStack Query (com resposta otimista nas mutações de efeito imediato)
- HTTP no cliente: axios do projeto (`baseURL: '/api'`)
- Validação: Zod
- Formulários: react-hook-form + `@hookform/resolvers` (Zod)
- Animações: Framer Motion (biblioteca de animação única; exceção: campo de partículas do login,
  com tsParticles — `@tsparticles/react` + `@tsparticles/slim`)
- Arrastar e soltar: dnd-kit (`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`)
- Virtualização: TanStack Virtual
- Tempo real: Pusher (`pusher` no servidor, `pusher-js` no cliente; Soketi compatível)
- Toasts: sonner
- Ícones: lucide-react
- Datas: date-fns (locale pt-BR); seletor de datas: react-day-picker
- Busca local: fuse.js
- Markdown: `react-markdown` + `remark-gfm` (componente `src/components/ui/markdown.tsx`)
- Preferências/filtros persistentes no navegador: `usePersistentState` (`src/hooks/`, Zod)
- Gráficos: recharts pelo componente Chart do shadcn/ui (`src/components/ui/chart.tsx`), com
  tooltip padronizado e cores por variáveis `--chart-1..6`
- Utilitários de estilo: `clsx` + `tailwind-merge` (`cn()`), `class-variance-authority`
- Logging: Pino
- IA: Vercel AI SDK (`ai` v7) com `ai-sdk-provider-opencode-sdk` (OpenCode 2.x) `@ai-sdk/google`
  (Gemini), `@ai-sdk/anthropic`, `@ai-sdk/openai` e `@ai-sdk/deepseek`, sempre por `streamAi` (`src/lib/ai/stream.ts`); provedores configurados em
  Integrações › Provedores de IA (`aicontext/modules/ai.md`)
- Testes: Vitest + React Testing Library
- Build e execução: scripts de `package.json`; Docker (`Dockerfile` + `docker-compose.yml`)
- Agendador interno (Crons): `instrumentation.ts` (`setInterval`); tick sob demanda em
  `/api/routines/scheduler-tick`
- Integrações: terminal de logs com `@xterm/xterm` (+ `@xterm/addon-fit`, `@xterm/addon-search`),
  Swagger UI via `swagger-ui-dist` (CDN)

## 6. Padrão de testes

- Escreva testes em `__tests__/`.
- Ao desenvolver, rode apenas os testes específicos do código afetado. Nunca execute a suíte
  completa (inclusive comandos sem filtro como `pnpm test` ou `vitest run`) sem solicitação
  explícita do usuário.
- Foque em comportamento e regra de negócio, não em detalhes de implementação.
- Use `vi`, `describe`, `it`, `expect`, `beforeEach` e helpers locais conforme os testes
  existentes.
- O setup do Vitest não carrega `@testing-library/jest-dom`. Use APIs nativas do DOM
  (`getAttribute`, `hasAttribute`, `classList`, `style`) com matchers nativos; não adicione
  `jest-dom` globalmente nem por arquivo.
- Faça mock apenas do necessário e preserve independência entre casos.
- Para novos fluxos críticos, cubra happy path, falhas esperadas e casos-limite relevantes.
- Chamadas a serviços externos (GitHub, provedores de IA) são sempre mockadas nos testes (nunca
  rede real).

## 7. Ambiente local, Docker e git worktree

- Copie `.env.example` para `.env` e preencha (`INTEGRATIONS_ENCRYPTION_KEY`: `openssl rand -base64 32`).
- O `.env` é escrito para o **Docker rootless** desta máquina: o Mongo é o container `mongodb`
  (rede `mongodb-network`) e o Soketi é o container `soketi` (rede `soketi-network`). Para
  `pnpm dev` fora do Docker, troque esses hosts por `localhost`. A URL pública do Pusher
  (`NEXT_PUBLIC_PUSHER_URL` / "URL pública do cliente") é o endereço que o **navegador** alcança:
  abrindo o app de outra máquina, use o IP do servidor (ex.: `ws://192.168.0.64:6001`), nunca
  `localhost`.
- Local: `pnpm dev` (porta `PORT`, padrão 3100) com um MongoDB acessível em `MONGODB_URI`.
- Docker (rootless): `docker compose --profile dev up app-dev --watch` (desenvolvimento) ou
  `docker compose up -d app` (imagem standalone). As redes externas são `mongodb-network` e
  `soketi-network` (o build sai pela rede do host); a porta é publicada no host.
- Ao criar um `git worktree`: copie o `.env` do repositório principal; **nunca** crie symlink do
  `node_modules` (rode `pnpm install` no worktree).

## 8. Versionamento

- **Sempre que for fazer um `git commit`, incremente a versão em `package.json`** seguindo
  versionamento semântico (`major.minor.patch`), no mesmo commit da alteração:
  - **major** (`X.0.0`): mudanças incompatíveis;
  - **minor** (`x.Y.0`): nova funcionalidade compatível;
  - **patch** (`x.y.Z`): correção de bug compatível.

## 9. Checklist mínimo antes de encerrar

1. Li o contexto certo em `aicontext/`.
2. Não introduzi autenticação, permissões nem multiempresa **no app do dono** sem pedido explícito.
   (Usuários e a flag `admin` por vínculo existem só no portal do cliente.)
3. Mantive tipos, validação, auditoria e logging quando aplicável.
4. Segredos (tokens, JWT) ficaram só em campo privado de integração, nunca no cliente.
5. Segui o fluxo obrigatório da seção 4 (implementar → documentar → testar).
6. Escrevi testes Vitest cobrindo a mudança (ou justifiquei explicitamente por que não).
   Executei apenas os testes específicos do código afetado; a suíte completa só foi executada
   se solicitada explicitamente pelo usuário.
7. Se criei, alterei ou removi endpoint público por token, atualizei a especificação OpenAPI no
   mesmo commit.
8. Usei só tokens do tema escuro (nada de cor hardcoded).
9. Animei com Framer Motion as transições adequadas, respeitando movimento reduzido, e usei
   resposta otimista com reversão nas mutações de efeito imediato.
10. Eventos de tempo real são disparados pelo servidor, em canais privados conhecidos, com payload
    mínimo.
11. Não adicionei biblioteca que duplica a função de outra da seção 5.

<!-- rtk-instructions v2 -->
# RTK (Rust Token Killer) - Token-Optimized Commands

## Golden Rule

**Always prefix commands with `rtk`**. If RTK has a dedicated filter, it uses it. If not, it passes through unchanged. This means RTK is always safe to use.

**Important**: Even in command chains with `&&`, use `rtk`:
```bash
# ❌ Wrong
git add . && git commit -m "msg" && git push

# ✅ Correct
rtk git add . && rtk git commit -m "msg" && rtk git push
```

## RTK Commands by Workflow

### Build & Compile (80-90% savings)
```bash
rtk cargo build         # Cargo build output
rtk cargo check         # Cargo check output
rtk cargo clippy        # Clippy warnings grouped by file (80%)
rtk tsc                 # TypeScript errors grouped by file/code (83%)
rtk lint                # ESLint/Biome violations grouped (84%)
rtk prettier --check    # Files needing format only (70%)
rtk next build          # Next.js build with route metrics (87%)
```

### Test (60-99% savings)
```bash
rtk cargo test          # Cargo test failures only (90%)
rtk go test             # Go test failures only (90%)
rtk jest                # Jest failures only (99.5%)
rtk vitest              # Vitest failures only (99.5%)
rtk playwright test     # Playwright failures only (94%)
rtk pytest              # Python test failures only (90%)
rtk rake test           # Ruby test failures only (90%)
rtk rspec               # RSpec test failures only (60%)
rtk test <cmd>          # Generic test wrapper - failures only
```

### Git (59-80% savings)
```bash
rtk git status          # Compact status
rtk git log             # Compact log (works with all git flags)
rtk git diff            # Compact diff (80%)
rtk git show            # Compact show (80%)
rtk git add             # Ultra-compact confirmations (59%)
rtk git commit          # Ultra-compact confirmations (59%)
rtk git push            # Ultra-compact confirmations
rtk git pull            # Ultra-compact confirmations
rtk git branch          # Compact branch list
rtk git fetch           # Compact fetch
rtk git stash           # Compact stash
rtk git worktree        # Compact worktree
```

Note: Git passthrough works for ALL subcommands, even those not explicitly listed.

### GitHub (26-87% savings)
```bash
rtk gh pr view <num>    # Compact PR view (87%)
rtk gh pr checks        # Compact PR checks (79%)
rtk gh run list         # Compact workflow runs (82%)
rtk gh issue list       # Compact issue list (80%)
rtk gh api              # Compact API responses (26%)
```

### JavaScript/TypeScript Tooling (70-90% savings)
```bash
rtk pnpm list           # Compact dependency tree (70%)
rtk pnpm outdated       # Compact outdated packages (80%)
rtk pnpm install        # Compact install output (90%)
rtk npm run <script>    # Compact npm script output
rtk npx <cmd>           # Compact npx command output
rtk prisma              # Prisma without ASCII art (88%)
```

### Files & Search (60-75% savings)
```bash
rtk ls <path>           # Tree format, compact (65%)
rtk read <file>         # Code reading with filtering (60%)
rtk grep <pattern>      # Search grouped by file (75%). Format flags (-c, -l, -L, -o, -Z) run raw.
rtk find <pattern>      # Find grouped by directory (70%)
```

### Analysis & Debug (70-90% savings)
```bash
rtk err <cmd>           # Filter errors only from any command
rtk log <file>          # Deduplicated logs with counts
rtk json <file>         # JSON structure without values
rtk deps                # Dependency overview
rtk env                 # Environment variables compact
rtk summary <cmd>       # Smart summary of command output
rtk diff                # Ultra-compact diffs
```

### Infrastructure (85% savings)
```bash
rtk docker ps           # Compact container list
rtk docker images       # Compact image list
rtk docker logs <c>     # Deduplicated logs
rtk kubectl get         # Compact resource list
rtk kubectl logs        # Deduplicated pod logs
```

### Network (65-70% savings)
```bash
rtk curl <url>          # Compact HTTP responses (70%)
rtk wget <url>          # Compact download output (65%)
```

### Meta Commands
```bash
rtk gain                # View token savings statistics
rtk gain --history      # View command history with savings
rtk discover            # Analyze Claude Code sessions for missed RTK usage
rtk proxy <cmd>         # Run command without filtering (for debugging)
rtk init                # Add RTK instructions to CLAUDE.md
rtk init --global       # Add RTK to ~/.claude/CLAUDE.md
```

## Token Savings Overview

| Category | Commands | Typical Savings |
|----------|----------|-----------------|
| Tests | vitest, playwright, cargo test | 90-99% |
| Build | next, tsc, lint, prettier | 70-87% |
| Git | status, log, diff, add, commit | 59-80% |
| GitHub | gh pr, gh run, gh issue | 26-87% |
| Package Managers | pnpm, npm, npx | 70-90% |
| Files | ls, read, grep, find | 60-75% |
| Infrastructure | docker, kubectl | 85% |
| Network | curl, wget | 65-70% |

Overall average: **60-90% token reduction** on common development operations.
<!-- /rtk-instructions -->
