# Use Sempre Que Desenvolver

Regras gerais do Opex. Leia antes de qualquer implementação.

| Situação | Arquivo a Consultar |
|----------|-------------------|
| Entender por que algo foi feito de determinada forma | `use-diretrizes-do-projeto.md` |
| Tela, componente, tema, animação ou formulário | `use-para-atualizar-tema-e-componentes-ui.md` |
| Módulo específico | `modules/*.md` |
| Regras gerais de desenvolvimento | Este arquivo |

## Conceito do Projeto

- App Next.js único, de **uso pessoal**: um único **dono** (o admin, `ADMIN_USER`/`ADMIN_EMAIL` +
  `ADMIN_PASSWORD`, exibido como `APP_OWNER_NAME`). Pode ser publicado na internet atrás da tela de
  login (`/login`, ver `modules/auth.md`).
- Usuários só existem no **portal do cliente** de Orçamentos (login por URL ou username/email + senha,
  `modules/orcamentos.md`); o app do dono não tem cadastro, cargos nem `companyId`. Não introduza
  permissões no app do dono sem pedido explícito.
- Toda ação do **dono** é atribuída ao usuário local (`getLocalUser()` de `src/lib/local-user.ts`, id
  `local`) na auditoria e nos campos `createdBy`/`updatedBy`; no portal, ao **usuário** de cliente.
- Integrações externas (GitHub, provedores de IA) são configuradas na tela de Integrações; credenciais
  (ex.: token do GitHub) ficam cifradas no banco, no documento da integração. A futura Google Drive
  (fonte de tarefas) aparece ali como "Em desenvolvimento".
- A experiência do usuário é prioridade: animações com Framer Motion, resposta otimista e tempo
  real com Pusher.

## Princípios de Desenvolvimento

### 1. Separação de Responsabilidades
- **App** (`src/app`): rotas, páginas, layouts e route handlers do Next.js
- **Features** (`src/features`): lógica de negócio de cada módulo
- **Lib** (`src/lib`): infraestrutura compartilhada — banco, modelos, logger, Pusher, integrações
- **Components** (`src/components`): UI genérica (`ui/`, `list/`, `feedback/`, `motion/`, `wizard/`)

### 2. Type Safety First
- TypeScript em modo `strict`; tipos explícitos em funções públicas, props e retornos.
- Derive tipos de schemas Zod (`z.infer`) em vez de duplicar contratos.

### 3. Logging e Auditoria
- Mutações relevantes (configuração de integrações, tokens, rotinas, apontamentos) registram
  auditoria com `recordAudit` (`src/lib/audit/record.ts`): usuário, data/hora, ação e valores
  antigo/novo. Segredos nunca entram na auditoria.
- Logs com **Pino** pelo logger central (`src/lib/logger.ts`, `loggerFor({...})` para contexto).
  Nunca `console.log` em código de produção.
- Entidades persistidas têm `createdBy`, `createdAt`, `updatedBy`, `updatedAt` (`auditPlugin`).

### 4. Tratamento de Erros
- Rotas usam `withRoute` (`src/lib/api/route.ts`): `DomainError(status, mensagem, code?)` vira a
  resposta padronizada; qualquer outro erro é logado e vira 500.
- APIs retornam `ApiResponse`/`PaginatedResponse` (`src/lib/types/api.ts`, helpers em
  `src/lib/api/responses.ts`) com mensagens pt-BR. Nunca exponha stack trace.

### 5. Padrões de Nomenclatura
- **Componentes**: PascalCase (`TasksPage.tsx`)
- **Funções/variáveis**: camelCase (`listApiTokens`)
- **Constantes**: UPPER_SNAKE_CASE (`HOME_HREF`)
- **Arquivos de serviço**: kebab-case (`integration-service.ts`)
- **Pastas**: kebab-case (`api-tokens`)

### 6. Estrutura de Arquivos
```
src/
├── app/
│   ├── (app)/             # Páginas dentro do shell (tarefas, integracoes, 404 do shell)
│   └── api/               # API Routes
├── features/
│   └── [feature-name]/    # components/, hooks/, services/, schemas/, types.ts, utils/
├── components/
│   ├── ui/                # Shadcn/Radix e componentes base
│   ├── list/              # Kit de listas/tabelas/filtros
│   ├── feedback/          # EmptyState, ErrorState, InDevelopment
│   └── motion/            # Presets e animações compartilhadas
├── hooks/                 # Hooks genéricos (useUrlFilters, useDialogPresence...)
└── lib/
    ├── db/                # Conexão, migrações e modelos Mongoose
    ├── integrations/      # Catálogo, resolvedor, debug, agenda
    ├── pusher/            # Pusher (servidor e cliente)
    ├── api/ + api.ts      # Respostas/rotas (servidor) e axios (cliente, baseURL '/api')
    ├── logger.ts          # Pino
    └── utils.ts           # cn() e utilitários
```

### 7. Experiência do usuário e animações
- Anime com **Framer Motion** toda transição de estado perceptível: entrada/saída
  (`AnimatePresence`), abas e etapas (`mode="wait"`), listas, diálogos, feedback e números.
- Animações curtas (≈150–300 ms), respeitando `prefers-reduced-motion`.
- Mutações de efeito imediato (ex.: iniciar/parar timer) usam resposta otimista (TanStack Query)
  com reversão animada e toast (**sonner**) em caso de falha.

### 8. Tempo real (Pusher)
- Servidor: `pusher` (`src/lib/pusher/server.ts`, `channels.ts`); cliente: `pusher-js`.
- Dispare eventos só no servidor, depois de persistir e auditar (`publishAppEvent`).
- Canais privados: `private-app` e `private-integration-{id}` (dono), `private-client-{clientId}`
  (portal) e `private-repo-recents-{ator}` (o próprio ator); canal novo exige regra em
  `src/lib/pusher/channel-auth.ts`. Payload mínimo (ids e o que mudou); o cliente invalida/atualiza o
  cache do TanStack Query em hooks da feature (`use*Realtime`), com assinatura em `useEffect` e
  cancelamento na desmontagem.

### 9. Consumo de API no cliente
- Use o axios central (`src/lib/api.ts`, `baseURL: '/api'`) sem o prefixo `/api`:
  `api.get('/integrations')` → `GET /api/integrations`. `unwrapApi` extrai o `data`.
- Toda chamada passa por hooks com TanStack Query; nada de `fetch` solto em componente.
- Formulários usam react-hook-form + `zodResolver` com o mesmo schema Zod validado na API.

### 10. Integrações externas
- Credenciais e URLs vêm da tela de Integrações (banco, cifradas) com fallback do `.env`; nunca
  são versionadas.
- Chamadas a serviços externos ficam no servidor (`src/features/<integração>/` ou serviços da
  integração), usando `getIntegrationConfig(id)` e `integrationDebug(id)` para logs de debug.
- Sem filas, Redis ou workers. Trabalho periódico = rotina dos Crons (agendador interno).

## Documentação

Sempre que criar um módulo em `src/features`:
1. Crie `aicontext/modules/[module-name].md` (objetivo, schemas, fluxo, APIs e regras)
2. Registre-o no índice de `aicontext/README.md`
3. Mantenha atualizado conforme o fluxo obrigatório do `AGENTS.md`

## Testes

Testes Vitest em `__tests__/` para serviços, APIs, hooks, componentes complexos e regras de
negócio. O setup não carrega `@testing-library/jest-dom`; use APIs nativas do DOM. Componentes
animados usam o mock de `framer-motion` (`__tests__/helpers/framer-motion.tsx`).

## Commits

Mensagens claras, com bump de versão no `package.json`:
```
feat(tasks): lista de tarefas com colunas configuráveis
fix(integrations): corrige teste do Pusher em modo host
```

## Segurança

- Mesmo atrás do login, NUNCA exponha secrets no client-side nem devolva valores de campos privados.
- Valide inputs no servidor com Zod.
- O app pode ser exposto à internet **somente** atrás da tela de login (ver `modules/auth.md`).
  Outros sistemas acessam endpoints públicos por token de sistema (Integrações › API interna).
