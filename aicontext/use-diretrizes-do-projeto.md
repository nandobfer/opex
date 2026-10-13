# Diretrizes Consolidadas do Projeto

Decisões técnicas do Opex e suas motivações. Em conflito, o `AGENTS.md` prevalece.

## Visão Geral do Projeto

### Objetivo

App pessoal para gerenciar as tarefas (o Opex é a fonte de verdade) e apontar horas, com
integrações configuráveis (GitHub, provedores de IA e as de infraestrutura: Pusher, API
interna, Crons) e a futura Google Drive (fonte de tarefas a partir de planilhas do Google Sheets),
em desenvolvimento. Um único usuário, atrás de um login com senha única, rodando localmente ou em
Docker (pode ser publicado na internet).

## Arquitetura

### Estrutura de Diretórios

Ver `use-sempre-que-desenvolver.md`, "Estrutura de Arquivos".

### Princípios Arquiteturais

- App Next.js único (App Router), pnpm, sem monorepo.
- `src/app` fino (rotas e páginas), regras em `src/features`, infraestrutura em `src/lib`.
- Configuração de serviços externos pela tela de Integrações (banco, cifrada), com fallback do
  `.env`.
- Sem filas, Redis nem workers: trabalho periódico pelo agendador interno (Crons).

## Decisões Arquiteturais Importantes

### 1. Login do dono (`ADMIN_*`) e usuários só no portal do cliente

**Decisão**: o app do dono tem uma tela de login com as credenciais `ADMIN_USER`/`ADMIN_EMAIL` +
`ADMIN_PASSWORD` e um cookie de sessão assinado (`AUTH_SECRET`, com `kind: "admin"`); não há cadastro,
usuários nem cargos no app do dono. Os **usuários** existem apenas no **portal do cliente** de
Orçamentos (`users`, senha scrypt), com a flag `admin` **por vínculo**; quem está no portal usa
`kind: "client"` e fica restrito a `/cliente/*`. Toda ação do dono continua sendo do usuário local
(`getLocalUser()`, id `local`, nome `APP_OWNER_NAME`).

**Motivo**: o app é publicado na internet e passou a hospedar um portal para clientes (OPE-51). O core
copiado do CRM teve Clerk, `@sipal/permissions` e multiempresa removidos; usuários e permissões foram
reintroduzidos **só no portal**, com o mínimo necessário. Detalhes em `modules/auth.md` e
`modules/orcamentos.md`.

**Consequência**: páginas e APIs internas exigem a sessão (guarda em `src/middleware.ts`, por tipo de
sessão); a API pública por token de sistema (`/api/v1/*`), o tick de cron (`/api/routines/*`), a
entrada do portal (`/cliente`) e a documentação OpenAPI seguem liberados. Papéis finos (admin do
cliente, visibilidade de R$) são conferidos no servidor Node, em cada requisição.

### 2. Banco de Dados: MongoDB + Mongoose

Conexão cacheada (`src/lib/db/connection.ts`), migrações idempotentes no `dbConnect()`
(`src/lib/db/migrations/registry.ts`). Em Docker usa o Mongo compartilhado da rede `devteam`
(banco `opex`).

### 3. Integrações configuráveis (cópia do CRM/Smart Desk)

Catálogo puro + resolvedor banco → `.env` → default, segredos AES-256-GCM
(`INTEGRATIONS_ENCRYPTION_KEY`), teste de conexão, status em tempo real, modo debug com terminal e
explorador OpenAPI. Detalhes em `modules/integrations.md`.

**Credenciais de serviços pessoais** (ex.: token do GitHub, chaves de IA) ficam como campo privado
da integração, nunca em `.env` versionado nem no navegador.

### 4. Tarefas locais são a fonte de verdade

**Decisão**: tarefas, colunas do quadro e apontamentos de horas vivem no MongoDB dO Opex
(`dev_tasks`, `task_board_columns`, `time_logs`); não há espelho de plataforma externa. Cada tarefa
pertence a um **Projeto** (repositório vinculado) e a uma **coluna** configurável do quadro.

**Motivo**: uso pessoal; o Opex deixa de ser uma camada sobre outra plataforma e passa a ser o
dono dos dados.

**Consequência**: o quadro, o CRUD de tarefas e as horas são locais; o GitHub só cria tarefas a
partir das issues dos repositórios vinculados (ver `modules/github.md`).

### 5. Agendador interno só em processo persistente

`instrumentation.ts` inicia o tick por `setInterval`; `/api/routines/scheduler-tick` executa o
mesmo motor sob demanda. Sem variante Vercel (o app não roda em serverless).

### 6. UI: Shadcn + Tailwind 4, tema escuro fixo

Tema único escuro com primária `#8000FF` em `globals.css`. Componentes e kit de listas copiados do
CRM. Detalhes em `use-para-atualizar-tema-e-componentes-ui.md`.

### 7. Experiência do usuário: Framer Motion como biblioteca de animação

Única biblioteca de animação; exceção: séries dos gráficos usam a animação do recharts.

### 8. Tempo real: Pusher

`pusher`/`pusher-js`, canais privados `private-app` e `private-integration-{id}`, eventos só pelo
servidor. Compatível com Soketi (modo host).

### 9. Execução: local (`pnpm dev`) ou Docker

`Dockerfile` multi-stage (deps → dev → builder → runner standalone) e `docker-compose.yml` com os
serviços `app` (produção) e `app-dev` (profile `dev`, watch), porta `PORT` (padrão 3100).

#### Entrega contínua (CI/CD)

O deploy de produção é automatizado no GitHub Actions (`.github/workflows/ci-cd.yml`): a suíte
Vitest roda em todo push na `main` e em todo pull request (bloqueante de merge via proteção de
branch), a imagem é construída **no runner** e transferida para o servidor por SCP, onde é
importada (`docker load`) e o serviço é recriado com Compose — sem build no servidor. Detalhes,
configuração de secrets/variables e rollback em `modules/deployment.md`.

#### Subcaminho público (proxy com prefixo)

O Next não funciona com prefixo variável: scripts (`/_next/...`), redirects e chamadas do navegador
são absolutos. Por isso o app tem um subcaminho fixo, `NEXT_PUBLIC_BASE_PATH` (ex.:
`/dev_automacao/tarefas-fernando`). Ele vira o `basePath` do `next.config.ts`, entra no build
(build arg no Docker) e mudar exige rebuild.

- O mesmo caminho vale nos dois acessos. Pelo domínio:
  `https://reserva.sipal.com.br/dev_automacao/tarefas-fernando`. Direto pelo IP:
  `http://IP:PORT/dev_automacao/tarefas-fernando`; a raiz `http://IP:PORT/` redireciona para ele.
- O proxy repassa o caminho completo, sem remover o prefixo e sem barra final na `location`:
  `location /tarefas-fernando { proxy_pass http://IP:PORT/dev_automacao/tarefas-fernando; }`.
- Caminhos montados à mão usam `src/lib/base-path.ts`:
  - `withBasePath`: `api` do axios, `fetch`, `authEndpoint` do Pusher e o Swagger da API interna;
  - `appendBasePath`: `getInternalBaseUrl`, usado nas chamadas do servidor a si mesmo;
  - a especificação OpenAPI usa `servers: [{ url: BASE_PATH }]`.

  `Link`, `router` e `redirect` do Next já prefixam sozinhos. No cliente, chame sempre pelo `api`
  (nunca `axios.get('/api/...')`).
- O tempo real pelo domínio passa por outra `location` do proxy (`/soketi/` → Soketi), e a URL
  pública do cliente do Pusher lista os dois endereços (ver `modules/integrations.md`).

## Segurança

### Validação de Dados

Todo input validado com Zod no servidor; formulários usam o mesmo schema.

### Secrets

- Nunca commitar secrets; `.env` é gitignored e o `.env.example` documenta as variáveis.
- Segredos de integrações ficam cifrados no banco; a API nunca devolve os valores.

## Padrões de API

### Formato de Resposta Padrão

**Sucesso**:
```typescript
{
  success: true,
  data: { /* dados */ }
}
```

**Erro**:
```typescript
{
  success: false,
  error: "Mensagem amigável em pt-BR",
  code: "ERROR_CODE",
  details?: unknown // Opcional (ex.: erros de validação Zod)
}
```

### Paginação

```typescript
{
  success: true,
  data: [ /* itens */ ],
  pagination: { page: 1, limit: 10, total: 100, totalPages: 10 }
}
```

### Códigos HTTP

- `200`: Sucesso (GET, PUT, PATCH)
- `201`: Criado (POST)
- `400`: Bad Request (validação)
- `401`: Token de sistema ausente/inválido (só endpoints públicos)
- `404`: Não encontrado
- `409`: Conflito (ex.: rotina já em execução, chave de criptografia ausente)
- `500`: Erro interno

### Endpoints públicos por token

Toda criação, alteração ou remoção de endpoint público atualiza a especificação OpenAPI
(`src/features/public-api/openapi/spec.ts`) e `PUBLIC_TOKEN_ROUTES` no mesmo commit, gerada a
partir dos schemas Zod da rota.

## Testes

- Vitest + React Testing Library, em `__tests__/` espelhando `src/`.
- Mock apenas de serviços externos e do necessário.
- Foco em comportamento e regra de negócio.
- Sem `@testing-library/jest-dom`: usar APIs nativas do DOM.

## Documentação

```
aicontext/
├── README.md                                   # Índice
├── use-sempre-que-desenvolver.md               # Regras gerais
├── use-diretrizes-do-projeto.md                # Este arquivo (decisões)
├── use-para-atualizar-tema-e-componentes-ui.md # Tema, componentes, animações
└── modules/                                    # Um arquivo por módulo
```

Nomenclatura: `use-sempre-*` (sempre), `use-para-*` (tarefas específicas), `modules/*` (módulos).

## Checklist de Qualidade

### Para Novo Desenvolvimento

- [ ] Código em TypeScript strict
- [ ] APIs seguem formato padronizado (`withRoute`, `ok`/`fail`)
- [ ] Validação com Zod
- [ ] Auditoria de ações relevantes (sem segredos)
- [ ] Cores só por tokens do tema
- [ ] Documentação atualizada

### Para Pull Request

- [ ] Testes passando
- [ ] Lint e TypeScript sem erros
- [ ] Documentação em `aicontext/modules/` (se novo módulo)
- [ ] `.env.example` atualizado (se novas variáveis)
- [ ] OpenAPI atualizada (se endpoint público por token mudou)
