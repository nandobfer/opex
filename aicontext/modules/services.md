# Módulo: Serviços (`/financeiro/servicos`)

**Lançamentos manuais de faturamento** criados pelo dono e contabilizados junto das tarefas
concluídas no Financeiro, no dashboard do dono e no portal do cliente. Diferente da tarefa — que
entra no financeiro pela **conclusão derivada da auditoria** e pelo snapshot `DevTask.estimate` —, o
serviço tem **data própria** (`serviceDate`), cliente obrigatório, repositório e tarefa **opcionais**
e três valores reativos (duração real, duração inflada e faturamento).

Código em `src/features/services/`. Ponto de entrada: o botão **"Novo serviço"** no cabeçalho de
`/financeiro` (não entra no dashboard).

## Regra de cálculo (3 campos reativos)

A relação é **idêntica à da estimativa das tarefas**:

- `clientHours = hours × factor`
- `billingBrl = clientHours × hourlyRate` (≡ `hours × factor × hourlyRate`)

O **último campo editado é a fonte da verdade** e recalcula os outros dois:

- editou **duração real** → recalcula a inflada e o faturamento;
- editou **duração inflada** → `hours = clientHours ÷ factor` (divisão sem resto); `billingBrl = clientHours × hourlyRate`;
- editou **faturamento** → `clientHours = billingBrl ÷ hourlyRate`; `hours = clientHours ÷ factor`.

Regras de borda (`computeServiceAmounts`, `logic.ts`, puro):

- **zero é permitido** nos três campos (não bloqueia salvar);
- divisão por zero (`factor`/`hourlyRate` iguais a zero): o campo digitado é **preservado** e o não
  derivável vira **zero** — nunca `NaN`/`Infinity`;
- horários entram/saem como **`H:mm`** e são armazenados como **horas decimais** com 2 casas;
- o **servidor** recalcula sempre com o `factor`/`hourlyRate` **atuais** do cliente e grava o
  **snapshot** — o que o navegador envia não é confiado.

## Modelo (`finance_services`)

`src/lib/db/models/FinanceService.ts` (`timestamps: true`): `code`, `clientId`, `projectId` (opcional),
`taskId` (opcional), `description`, `title`, `summary`, `summarySourceHash`/`summaryUpdatedAt`,
`tags`/`tagsSourceHash`/`tagsUpdatedAt`, `serviceDate`, `hours`, `clientHours`, `billingBrl`,
`factor`, `hourlyRate`, `aiStatus` (`pending|done|error`), `aiError`, `archived`.

- **`code`**: com repositório e sigla, segue a **mesma sequência das tarefas** (`Project.taskSeq`,
  via `nextProjectCode`); sem repositório (ou sem sigla), `SRV-{n}` pelo **contador global**
  (`counters`, `src/lib/db/models/Counter.ts`).
- **Soft delete** (`archived: true`): some das somas/listas/dashboards/portal, preservando registro e
  anexos; restaurável pelo filtro **"Mostrar arquivados"** do Financeiro.

## Formulário e páginas (dono)

- `/financeiro/servicos/novo` — tela única (`ServiceForm`): **cliente** (obrigatório, com fator e
  R$/h), **repositório** e **tarefa** (opcionais; escolher a tarefa **preenche cliente e repositório**
  dela, sem copiar a descrição), **descrição** (`MarkdownField` com uploads inline), **anexos**
  (`PendingAttachmentsField`), **data do serviço** (default hoje) e os **três campos reativos**.
  Salvar volta para `/financeiro` com toast.
- `/financeiro/servicos/[id]` — detalhe (`ServiceDetailPage`): código + badges, título/summary,
  descrição, cliente, repositório, **tarefa vinculada** (link para `/tarefas/{id}`), data, horas
  real/inflada, faturamento, painel de IA e **anexos**, com **Editar** e **Excluir** (ou **Restaurar**
  quando arquivado).
- `/financeiro/servicos/[id]/editar` — o mesmo formulário; mudar a **descrição** regera título/resumo/
  tags em segundo plano.

## Geração por IA (título, resumo, tags)

Em segundo plano (`runAfterResponse` → `generateServiceAi`), sem bloquear o formulário:

- **título/resumo** pelas configurações da feature **"Orçamentos"** (provedores de texto, via
  `streamAi`, com consumo em `ai_consumption_logs` na origem `service-ai`);
- **tags** pela feature **"Tags de tarefas"** (`generateTagsForInput`, texto ou JEV);
- grava título/resumo/tags + hashes e `aiStatus: "done"`; em falha, `aiStatus: "error"` + `aiError` e
  o botão **"Gerar novamente"** (`POST /api/services/[id]/ai`);
- **título e resumo** continuam editáveis manualmente na edição (campos opcionais acima do painel de IA);
  as **tags** são somente leitura com "Gerar novamente" (ids da taxonomia);
- o serviço **entra nas somas mesmo sem a IA** e uma geração antiga **não** sobrescreve uma descrição
  alterada depois.

## Financeiro do dono (`/financeiro`)

`listFinanceByClient` une **tarefas concluídas** (snapshot `estimate.billingBrl`, conclusão por
auditoria) e **serviços** (snapshot próprio, data em `serviceDate`) no mesmo grupo do cliente. O
serviço entra **mesmo sem colunas de conclusão** configuradas e aparece no período pela
`serviceDate`. Filtros de **cliente** e **repositório** valem para os dois (serviço sem repositório
sai quando há filtro de repositório). O DTO ganha o discriminador `kind: "task" | "service"`; os
serviços têm **badge "Serviço"** e o clique abre o detalhe. O cartão de totais ganha o contador
**"Serviços"** (`taskCount` continua só tarefas). Serviço de cliente excluído cai em **"Cliente
removido"**. O filtro **"Mostrar arquivados"** revela serviços arquivados (badge "Arquivado"),
mantendo-os **fora** dos totais e contadores.

## Dashboard do dono

KPI **"Serviços"** (serviços com `serviceDate` no período global, não arquivados) e o faturamento/
horas e a evolução mensal passam a incluir serviços; `tasksCompleted`/`taskCount` continuam só
tarefas. Migração de tipo em `src/features/dashboard/types.ts` + `widgets`.

## Portal do cliente

- **Financeiro** (`GET /api/cliente/financeiro`): serviços entram agrupados por **repositório** (sem
  repositório → **"Sem repositório"**) e respeitam o filtro de repositórios; horas mostradas são as
  **infladas** e o valor é **"Custo"**. Nunca expõe horas reais, fator ou custo/hora.
- **Dashboard**: serviços entram no bloco de custo (custo por repositório e evolução mensal) e no
  contador **"Serviços"**.
- **Detalhe** (`/cliente/servicos/[id]`, admin): descrição, anexos (visíveis/baixáveis) e custo/horas
  infladas — **sem** dados internos.

## Anexos

Reusa a infraestrutura atual (`task_attachments` + upload em duas fases S3 +
`PendingAttachmentsField`): a collection ganha a coluna/índice **`serviceId`** (vínculo alternativo a
`taskId`/`draftId`). Limite de **100 MB por arquivo**, quantidade ilimitada. A leitura/portal
**revalida** o serviço no estado atual — arquivar ou trocar o cliente bloqueia o acesso na hora,
mesmo com URL antiga.

## Tempo real, auditoria e IA

- Evento **`services-updated`** (constante pura em `constants.ts`) disparado **só pelo servidor**,
  depois de persistir e auditar, em `private-app` (dono) e `private-cliente-{clientId}` (portal).
- `recordAudit` em criar/editar/arquivar/restaurar (ator `getLocalUser()`), logs com
  `loggerFor({ module: "services" })` e uso de IA em `ai_consumption_logs`/`ai_usage_logs`.

## Endpoints (internos; **não** entram no OpenAPI `/api/v1/*`)

| Rota | Descrição |
|---|---|
| `POST /api/services` | Cria o serviço (recalcula e agenda a IA) |
| `GET/PATCH/DELETE /api/services/[id]` | Detalhe / edita (regera IA se a descrição mudar) / arquiva |
| `POST /api/services/[id]/restore` | Desarquiva |
| `POST /api/services/[id]/ai` | Regerar título/resumo/tags |
| `GET /api/cliente/servicos/[id]` | Detalhe no portal (admin) |

## Arquivos

- `src/features/services/` — `constants.ts`, `types.ts`, `logic.ts` (puro), `schemas.ts`,
  `ai-prompt.ts` (puro), `hooks.ts`, `server/{service,ai}.ts` e `components/` (formulário, campos
  reativos, painel de IA, detalhe).
- `src/lib/db/models/FinanceService.ts` e `src/lib/db/models/Counter.ts`.
- `src/app/(app)/financeiro/servicos/**` e `src/app/api/services/**`.
- `src/app/cliente/(portal)/servicos/[id]/page.tsx` e `src/app/api/cliente/servicos/[id]/route.ts`.

## Testes

`__tests__/features/services/`: `service-logic` (reatividade, bordas de zero e `H:mm`↔decimal),
`service-service` (código SRV/sequência das tarefas, recálculo e snapshot, IA pendente na edição de
descrição, soft delete/restauração, auditoria), `service-schemas` e `service-ai-prompt`.
