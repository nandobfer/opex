# Documentação de Contexto para IA — Opex

Esta pasta contém documentação estruturada para desenvolvimento assistido por IA no Opex.

O Opex é um app Next.js **de uso pessoal** (um único dono, protegido por login com credenciais
`ADMIN_*`; roda localmente, em Docker ou publicado na internet) para gerenciar as tarefas e apontar
horas, com um módulo de **Integrações** para guardar credenciais e configurar os serviços usados. Os
**usuários** existem apenas no **portal do cliente** de Orçamentos (login por URL/usuário). O core
(tema/componentes, layout, integrações, Pusher, crons) foi copiado do CRM Marketing Campanhas
(`~/code/crm-marketing-campanhas`, branch `dev`).

## Índice de Arquivos

### Diretrizes Gerais

**[use-sempre-que-desenvolver.md](./use-sempre-que-desenvolver.md)**
- Regras e princípios fundamentais do projeto
- Nomenclatura e estrutura de arquivos
- Auditoria, logging, tratamento de erros, testes e segurança

### Tema, Componentes e Experiência

**[use-para-atualizar-tema-e-componentes-ui.md](./use-para-atualizar-tema-e-componentes-ui.md)**
- Tema escuro fixo (primária `#8000FF`)
- Shadcn/Radix, kit de listas, sonner, lucide-react, date-fns
- Animações com Framer Motion, mock em testes
- Formulários, filtros na URL, listas virtualizadas

### Port do My Tasks

**[my-tasks-port-ope-80.md](./my-tasks-port-ope-80.md)**
- Recursos do My Tasks ainda ausentes no Opex (blocos A–F aprovados), o que já existe e o que fica de fora

### Diretrizes e Decisões Arquiteturais

**[use-diretrizes-do-projeto.md](./use-diretrizes-do-projeto.md)**
- Visão geral da arquitetura
- Decisões técnicas e suas motivações
- Padrões de segurança, API, UI, testes e documentação

## Módulos (`modules/`)

| Arquivo | Módulo | Quando consultar |
|---|---|---|
| `modules/layout.md` | Layout e navegação | Shell, sidebar, menu (`APP_NAV`), páginas e 404 |
| `modules/editor-mode.md` | Modo Vim nos campos de texto | Alternância (`Ctrl+Tab`/`Ctrl+Shift+Alt+V`), selo de modo, números de linha, Ctrl+J/Ctrl+E, comandos `:` e exclusões |
| `modules/dashboard.md` | Dashboards | Página inicial (`/dashboard`, acima de Tarefas): KPIs e gráficos de tarefas, financeiro, horas agênticas e central de desenvolvimento, período global e tempo real |
| `modules/auth.md` | Login, usuários e sessão | O dono (`ADMIN_*`), usuários de cliente (scrypt), cookie assinado com tipo de sessão, guarda do middleware, entrada do portal por URL e logout |
| `modules/tasks.md` | Tarefas | Kanban/tabela locais, colunas configuráveis, projetos (repositórios), lote, página da tarefa |
| `modules/repository-recency.md` | Repositórios usados recentemente | Ordenação "selecionado recentemente" dos seletores de repositório (filtros, formulário de tarefa e prévia) do dono e do portal |
| `modules/time.md` | Controle de horas | Controle de horas agêntico: períodos das mesas (abre/pausa/fecha), uso (tokens/custo), Horas agênticas (`/tarefas/horas`, somente leitura) |
| `modules/integrations.md` | Integrações e agendador | Pusher, API interna (OpenAPI + tokens de sistema), Crons, GitHub, SMTP e Storage S3; abas na página da integração; Google Drive em desenvolvimento |
| `modules/builder-machine.md` | Builder Machine | Prévias no Docker do PC (WSL) por túnel SSH: ativação pela integração `builder_machine`, chave do servidor, túnel, preparo do PC por diferença, containers do PC, rotina de limpeza e a exceção arquitetural (comandos no host fora dos agentes) |
| `modules/ai.md` | Provedores de IA | OpenCode, Gemini e JEV (decisão estruturada), `/integracoes/ia`, abas por provedor (Configuração/Modelos/Consumo) e painel de consumo do OpenCode, features "Entender tarefas", "Resumos de tarefas", "Tags de tarefas", "Orçamentos" (prévia), "Estimar prazos" (tarefas semelhantes; provedor configurável) e "Refinar tarefa" (aba de configuração) |
| `modules/refinement.md` | Refinar tarefa | Botão na página da tarefa que abre a aba "Especificação técnica", sessão longa do OpenCode que faz perguntas e reescreve a especificação técnica, retomada em segundo plano |
| `modules/orcamentos.md` | Orçamentos (clientes e portal) | Integração **Clientes** (`/integracoes/clientes`; id `orcamentos`), clientes com usuários e token, portal autenticado por sessão (`/cliente`) com sidebar (Dashboard, Tarefas, Financeiro, Usuários), custo × faturamento, prévia por IA + tags + estimativa e criação da tarefa |
| `modules/finance.md` | Financeiro | Faturamento das tarefas concluídas **e dos serviços** por cliente (`/financeiro`): valor pelo snapshot, conclusão derivada da auditoria, serviços manuais e filtros de período, clientes e repositórios |
| `modules/services.md` | Serviços | Lançamentos manuais de faturamento (`/financeiro/servicos`): cliente obrigatório, repositório/tarefa opcionais, três campos reativos (`H:mm`/R$), IA (título/resumo/tags), anexos e soft delete |
| `modules/agentic-dev.md` | Desenvolvimento agêntico | Centrais por projeto (repositório), mesa de trabalho (plano → implementação em worktree → prévia docker → PR → merge), OpenCode `@opencode/client`, `/desenvolvimento` |
| `modules/opencode-quota.md` | Quota do OpenCode | Painel na coluna Tarefas de `/desenvolvimento` com a quota do plugin `opencode-quota` (snapshot/export lidos no host), visão compacta, recolher por provedor, rotina de 5 min e tempo real |
| `modules/opex-agent.md` | Agente Opex | Assistente por chat (item da barra lateral, Ctrl+Shift+O) com ferramentas que chamam os serviços reais, confirmação de ações destrutivas, arquivos no chat via S3 assinado, sessões, streaming NDJSON e aba de configuração em `/integracoes/ia` |
| `modules/adversarial-agent.md` | Agente Adversário | Revisão da implementação da mesa com contexto limpo (OpenCode só leitura) antes da prévia ou do PR: criticidade em 5 níveis, correção automática ou com confirmação, rodadas, contexto configurável, memórias e histórico (aba `agente-adversario` de `/integracoes/ia`) |
| `modules/pr-review.md` | Revisão de PR por IA | Critérios, agente/skill, revisão por commit, histórico e integração com replanejamento e merge automático |
| `modules/github.md` | GitHub | Vínculos repositório ↔ Opex (= Projeto), mapeamento, rotina de issues → tarefas, issue ↔ tarefa |
| `modules/deployment.md` | Deploy (CI/CD) | GitHub Actions (testes, build da imagem no runner, transferência por SCP e recriação via Compose), configuração de secrets/variables e rollback |

Novos módulos ganham um arquivo aqui quando forem implementados, conforme o fluxo obrigatório do
`AGENTS.md`.

## Quando Consultar Cada Arquivo

| Situação | Arquivo a Consultar |
|---|---|
| Regras gerais de desenvolvimento | `use-sempre-que-desenvolver.md` |
| Entender decisões arquiteturais | `use-diretrizes-do-projeto.md` |
| Tema, componente, animação, formulário ou lista | `use-para-atualizar-tema-e-componentes-ui.md` |
| Modo Vim nos campos de texto (atalhos, selo, números de linha) | `modules/editor-mode.md` |
| Tempo real (Pusher) | `use-sempre-que-desenvolver.md`, seção "Tempo real" + `modules/integrations.md` |
| Issues do GitHub viram tarefas | `modules/github.md` |
| Trazer recursos do My Tasks (o que falta e o que já existe) | `my-tasks-port-ope-80.md` |
| Componente que existe no CRM e ainda não foi copiado | `~/code/crm-marketing-campanhas` (somente leitura; copie e adapte) |

## Princípios-Chave

1. **Fonte de Verdade**: este aicontext reflete o estado **atual do código**. Quando algo ainda não
   existe, o documento diz explicitamente que é planejado.
2. **Atualização**: toda tarefa atualiza a doc do módulo afetado (fluxo obrigatório do `AGENTS.md`).
3. **Concisão**: documente comportamento, regras e decisões; não repita o código.
