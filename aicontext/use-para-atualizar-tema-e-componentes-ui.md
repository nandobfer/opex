# Use Para Atualizar Tema e Componentes UI

Guia de tema, componentes, animações e padrões de interface do Opex. Herdado do CRM Marketing
Campanhas (que por sua vez veio do Smart Desk). Ao criar um componente ou utilitário
compartilhado novo, registre aqui o caminho real.

## Tema escuro fixo (primária `#8000FF`)

O app tem **um único tema, escuro**. Não há tema claro nem tema por empresa.

- As variáveis do Shadcn (`--background`, `--card`, `--primary`, `--ring`, `--sidebar*` etc.) ficam
  em `src/app/globals.css`, no bloco `:root, .dark` (mesmos valores nos dois). A primária é
  `270 100% 50%` (`#8000FF`) com texto branco; fundos e bordas são neutros levemente violeta.
- O `<html>` tem a classe `dark` e `color-scheme: dark` (layout raiz), para que as variantes
  `dark:` dos componentes copiados valham e os controles nativos/rolagem fiquem escuros. O
  `Toaster` do sonner usa `theme="dark"`.
- Tokens que dependem de variáveis (`--color-primary: hsl(var(--primary))`, sidebar etc.) e os
  raios ficam em **`@theme inline`**; cores semânticas fixas (`--color-success|warning|danger`) no
  `@theme` normal.
- Componentes usam **apenas tokens** (`bg-primary`, `text-primary-foreground`, `ring-ring`,
  `bg-sidebar-accent`); nunca a cor primária hardcoded (`bg-[#8000ff]`). Para brilho/realce use a
  própria variável: `shadow-[0_0_18px_-4px_hsl(var(--primary))]`, `bg-primary/15`.
- Cores de estado (alerta, sucesso, erro) em fundo escuro: prefira translúcidos com texto claro
  (`bg-amber-500/15 text-amber-300 ring-amber-400/30`), nunca `bg-*-100 text-*-800` sem variante
  `dark:`.
- Gráficos usam `--chart-1..6` (derivadas da primária, definidas no `globals.css`).

## Componentes UI (Shadcn/Radix)

- Componentes base ficam em `src/components/ui/` (gerados pelo CLI do Shadcn ou copiados do CRM).
- Crie variações por **composição** ou `class-variance-authority` em vez de reescrever o
  componente base.
- Use `cn()` (`clsx` + `tailwind-merge`, em `src/lib/utils.ts`) para combinar classes.
- Ícones: somente `lucide-react`.
- Toasts: somente `sonner` (`<Toaster />` no layout raiz; `toast.success`, `toast.error`,
  `toast.promise`).
- Datas: `date-fns` com locale `ptBR`; seletor de datas com `react-day-picker` (`DatePicker`,
  `Calendar`, `DateRangeCalendar`, `PresetDateRangeFilter`).
- **Nunca use os seletores nativos do navegador** `<input type="time">` e `<input type="range">`
  (não seguem o tema). Use:
  - `TimePicker` (`ui/time-picker.tsx`): botão no desenho do `DatePicker` + popover com horários;
  - `TimeSlotList` (`ui/time-slot-list.tsx`): lista de horários (`min`, `max`, `step` em minutos,
    `isDisabled`), `listbox` com setas/Home/End — para painéis inline;
  - `Slider` (`ui/slider.tsx`, `@radix-ui/react-slider`): trilho `muted`, preenchimento e polegar
    `primary`, polegar animado (Framer Motion), `marks` clicáveis e `formatValue` (`aria-valuetext`).
  (A tela de Crons das integrações ainda usa `type="time"`; migrar quando for mexida.)
- Campo rotulado com erro pt-BR: `Field` (`ui/field.tsx`).
- **Perguntas do agente** (formulários e permissões do OpenCode) ficam em
  `src/components/agent-questions/`: `AgentQuestionsCard` (formulário), `AgentQuestionOptions`
  (cada opção numa linha selecionável, com a **descrição** abaixo do texto; rádio na escolha única e
  caixa na múltipla) e `PermissionCard`. Compartilhados pela mesa de trabalho e pelo refinamento.
- Componentes com responsabilidade única e até ~200 linhas; lógica em hooks da feature.
- **Tailwind 4: variável CSS em valor arbitrário exige `var()`** — `max-h-[var(--radix-select-content-available-height)]`,
  nunca `max-h-[--radix-...]` (sintaxe do Tailwind 3, que o 4 ignora em silêncio).
- Popover (ex.: `Combobox`) dentro de `Dialog` usa `modal`: sem isso, o Dialog bloqueia a rolagem
  da lista pela roda do mouse (a lista é renderizada fora dele).

### Listas e tabelas genéricas (`src/components/list/`)

Kit de listagem copiado dos "cadastros" do CRM: `CadastroHeader` (título + descrição + ação),
`CadastroTableCard` + `CadastroTableSkeleton` (tabela em card com esqueleto), `TableAction`
(ações de linha: editar, excluir, testar, debug...), `ListFilters` + `CadastroFilterCard` +
`FilterGroup` (filtros), `CadastroMultiSelect`/`StatusFilterMultiSelect`/`StatusPill`,
`ChipOverflowList` e `TabFooter`. Hooks: `useUrlFilters` (filtros na URL),
`useDialogPresence` e `useCreateDialogAction` (`src/hooks/`). Animações de diálogo e abas:
`src/components/motion/dialog-panel-motion.ts` e `tab-motion.ts`.

## Layout das páginas

- Toda página renderiza **dentro do shell** (`AppShell`: sidebar + cabeçalho), montado no layout
  do grupo `src/app/(app)/` por `AppLayoutShell`. O shell define o espaçamento externo único:
  `<main>` com `px-4 py-6 md:px-6 lg:px-8`.
- **Nenhuma página define margem, padding ou largura máxima externos** (`mx-auto`, `max-w-*xl`,
  `p-*` na raiz). A raiz da página é só `flex flex-col gap-6` (ou `space-y-6`); cartões e tabelas
  ocupam a largura.
- Rota prevista e ainda não implementada tem **página própria** dentro do shell com o bloco
  `InDevelopment` (`src/components/feedback/InDevelopment.tsx`) — nunca a 404. Para marcar um
  controle isolado use `InDevelopmentBadge` (`src/features/layout/components/ModulePlaceholder.tsx`).
- Endereço desconhecido cai no `ShellNotFound` dentro do shell (`src/app/(app)/[...rest]`).
- Toda rota do menu tem arquivo de página (teste `__tests__/app/in-development-pages.test.tsx`).
- Página de formulário/detalhe: cabeçalho com botão ghost `ArrowLeft` para a lista + `h1`
  `text-lg md:text-2xl` + descrição `text-sm text-muted-foreground` (ex.: `DetailHeader`);
  conteúdo em cards, `gap-6` entre seções e entre cards lado a lado; cards com `p-6`.
- Ações do formulário ficam num **rodapé em linha**, nunca em barra flutuante/`sticky`:
  `flex flex-wrap justify-end gap-2 border-t pt-6` com todos os botões à direita
  (`FormFooter` de `src/components/ui/form-footer.tsx`, `DetailActions`, `TabFooter`).
- Escolha múltipla em lista longa usa `MultiAutocomplete` (`src/components/ui/multi-autocomplete.tsx`):
  busca tolerante (fuse.js), teclado (↑/↓/Enter/Esc, Backspace remove o último), grupos com
  "Selecionar todas" opcional e os escolhidos como chips abaixo do campo. Valores livres usam
  `ChipInput` (`chip-input.tsx`).
- Assistentes em etapas usam o `WizardStepper` de `src/components/wizard/`: etapas
  `{ id, label, icon }`, `maxReachable`, `pending` (campos pendentes por etapa, calculados com o
  schema Zod) e trilha animada. Troca de etapa com `AnimatePresence mode="wait"` (`tabSwap`).

## Menu lateral (`AppSidebar`)

Tema escuro com as boas práticas do **SideNavigation/Sidebar/Shell do Design System Sipal**.

- **Visual**: fundo `bg-sidebar` (quase preto violeta) com borda `sidebar-border`, logo no topo
  (símbolo violeta `public/opex-mark.png`, sem caixa, com brilho primário sutil, via
  `withBasePath`), item ativo em `bg-sidebar-accent` com barra `bg-primary` (com brilho) à esquerda
  via `layoutId`. No **desktop a barra é sempre recolhida** (68px): não há botão de recolher/expandir;
  a **versão** fica na linha inferior e o **avatar** do dono (`APP_OWNER_NAME`) no rodapé abre um
  **popover** com a ação "Sair" (encerra a sessão). A gaveta do mobile (< 1024px) é expandida
  (240px) e mantém dono, versão e "Sair" inline. Animações em Framer Motion
  (entrada dos itens, `whileHover x:4`, `whileTap 0.98`, largura, gaveta).
- **Seções** (`NavSectionDef { id, label?, items }` em `src/features/layout/navigation.ts`,
  `APP_NAV`): Tarefas (sem título) · Sistema (Integrações). Até 7 itens por seção. Título em
  caixa-alta é um botão com `aria-expanded` que abre/fecha a lista; fechadas ficam no
  `localStorage` (`opex-sidebar-closed-sections`); a seção da página atual sempre abre ao
  navegar para ela. Recolhido, o título vira divisor. `APP_NAV_ITEMS` (`flattenNav`) serve o
  título do cabeçalho. Novo item de menu = nova entrada em `APP_NAV` + página em `src/app/(app)/`.
- **Itens**: ícone 20px, rótulo 14px, `aria-current="page"` no ativo; recolhido, nome acessível
  (`aria-label`) e Tooltip à direita.
- **Contadores** (`SidebarBadge`, `NavItemDef.badge`): número pt-BR com "99+" (`formatBadge`), texto
  para leitor de tela (`badgeLabel`), animação curta ao mudar; recolhido, o ponto de aviso também é
  anunciado. Nenhum item usa contador ainda (`NavBadgeKey = "tasks"` reservado).
- **Acessibilidade**: `nav` com nome ("Menu principal"); foco visível só por teclado
  (`SIDEBAR_FOCUS_RING`, anel interno na primária); "Pular para o conteúdo" é o primeiro link
  (`#main-content` no `<main>`).
- **Gaveta (< 1024px)**: botão de menu com `aria-expanded`/`aria-controls`; ao abrir, foco no
  primeiro link e resto da tela `inert`; fecha com Esc, fundo, "Fechar menu" (foco volta ao botão)
  ou ao escolher um link (`useDrawerFocus`).
- Testes: `__tests__/features/layout/{navigation,app-sidebar,app-shell-drawer}.test.*`.

## Estados obrigatórios

Toda tela ou bloco que carrega dados trata:

- **Carregando**: skeleton no formato do conteúdo (operações acima de 200 ms);
- **Vazio**: ícone + texto descritivo + ação pertinente;
- **Erro**: mensagem pt-BR acionável + "Tentar novamente";
- **Em desenvolvimento**: recursos fora do escopo exibidos sem dados simulados nem controles que
  pareçam funcionar.

Ações críticas (excluir, revogar token, parar timer de outra tarefa) exigem diálogo de
confirmação explícita (`AlertDialog`).

## Animações (Framer Motion)

A experiência do usuário é prioridade. Anime **sempre que adequado** e **sempre com
`framer-motion`**.

```tsx
import { AnimatePresence, motion } from 'framer-motion';

<AnimatePresence mode="wait">
  <motion.div
    key={activeTab}
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -8 }}
    transition={{ duration: 0.2 }}
  >
    {content}
  </motion.div>
</AnimatePresence>
```

Onde animar:

- entrada/saída de elementos, diálogos, drawers, popovers (`AnimatePresence`);
- troca de abas e etapas de assistentes (`mode="wait"`);
- listas que ganham, perdem ou reordenam itens (tarefas, filas);
- feedback de sucesso/erro/carregamento de ações;
- números e contadores (componente `AnimatedNumber`, no padrão do Smart Desk);
- reordenação (`Reorder.Group`/`Reorder.Item`) e arrastar e soltar (dnd-kit + `motion`).

Regras:

- Duração curta (≈150–300 ms); nunca bloquear a interação nem atrasar a exibição de dados.
- Respeitar movimento reduzido: `MotionConfig reducedMotion="user"` no layout raiz e
  `useReducedMotion` quando a animação for essencial à compreensão.
- Não animar com CSS/JS manual nem com outra biblioteca quando o Framer Motion atende; hover e foco
  triviais podem usar classes Tailwind (`transition-colors`).
- `layout`/`layoutId` com parcimônia: no Smart Desk já causaram tela em branco em páginas com
  muitos elementos ou portais. Teste a tela real antes de adotar.
- Resposta otimista: mutações de efeito imediato atualizam o cache do TanStack Query antes da
  resposta; em falha, revertem com animação e mostram toast.

### Kanban

- Arrastar e soltar com `@dnd-kit/core` + `@dnd-kit/sortable`; o card acompanha o cursor
  (`DragOverlay`) e as demais cartas abrem espaço com animação.
- Soltar dispara mutação otimista; o card assenta na nova posição em menos de 0,3 s.
- Colunas com muitos cards usam virtualização (TanStack Virtual) sem perder a animação de entrada.

### Testes de componentes animados

Mock de `framer-motion` com `Proxy` passthrough, como no Smart Desk:

```ts
vi.mock('framer-motion', () => {
  const motion = new Proxy({}, {
    get: (_, tag: string) => ({ children, ...props }: Record<string, unknown>) =>
      React.createElement(tag, stripMotionProps(props), children as React.ReactNode),
  });
  return {
    motion,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    MotionConfig: ({ children }: { children: React.ReactNode }) => children,
    useReducedMotion: () => false,
  };
});
```

(`stripMotionProps` remove `initial`, `animate`, `exit`, `transition`, `layout` etc. antes de
repassar ao elemento DOM.)

## Gráficos (recharts via Chart do shadcn)

- Base: `src/components/ui/chart.tsx` (`ChartContainer`, `ChartTooltip`, `ChartTooltipContent`,
  `ChartLegend`). O tooltip é obrigatório em todo gráfico e segue o padrão: título, cor + série +
  valor formatado em pt-BR (`valueFormatter`) e uma linha de contexto (`footer`: %, origem, o que
  fazer). Não desenhe gráfico em SVG à mão.
- Os gráficos prontos do CRM (`BarsChart`, `DonutChart`, `TrendLineChart`, `RankedBarsCard`…) NÃO
  foram copiados (o CRM não está disponível nesta máquina); a tela Dashboards implementou os seus em
  `src/features/dashboard/components/charts/` sobre a base acima, e novos gráficos devem reusar esses
  componentes (copiando/adaptando de `~/code/crm-marketing-campanhas` quando ele estiver acessível).
- Número sobreposto ao centro (rosca, medidor, anel) fica atrás do tooltip: `wrapperStyle=
  {TOOLTIP_ON_TOP}` no tooltip e `z-0` no número.
- A tabela oculta fica num contêiner `relative` (e o `<main>` do `AppShell` é `relative`):
  elemento absoluto sem ancestral posicionado ia para o fim da página e fazia o layout inteiro
  rolar além do conteúdo.
- Cores: `var(--chart-n)` (paleta do tema em `globals.css`, derivada da primária); significados
  fixos (erro, alerta) usam cores semânticas. Nunca cor fixa no código.
- Animação das séries: a do recharts via `useChartAnimation()` (desligada com movimento reduzido)
  — exceção registrada no AGENTS.md. Blocos e cards ao redor entram com Framer Motion.
- Acessibilidade e testes: cada gráfico tem `role="img"` + `aria-label` e uma tabela oculta
  (`ChartDataTable`, linhas com `data-barra`) com os mesmos números — `sr-only` no contêiner e
  nome em `aria-label`, nunca `<caption>` (o navegador desenha o caption fora da tabela oculta e
  ele aparece flutuando); os testes leem essa tabela e
  o `ChartTooltipContent` direto (jsdom não mede o `ResponsiveContainer`).
- Sem dado é lacuna (`null`), nunca zero.

## Formulários

- react-hook-form + `zodResolver` com **o mesmo schema Zod** usado na API.
- Validação em tempo real (`mode: 'onChange'` ou `'onTouched'`), mensagens pt-BR abaixo do campo.
- Botão de envio mostra estado de carregamento e fica desabilitado durante o envio; resultado via
  toast do sonner.
- **Assistente por etapas**: "Próximo" e "Enviar" são botões distintos (`key` diferente) e o
  "Próximo" chama `event.preventDefault()`. Um único botão que troca de `type="button"` para
  `"submit"` ao avançar para a última etapa envia o formulário no meio do clique.

### Layout: campos ocupam toda a largura disponível

Regra obrigatória em diálogos, abas, cards e passos de assistente:

- Nenhum campo, seletor (`Select`, `OptionTabs`, date picker) ou grupo de campos termina antes do fim
  da linha. Não limite campos com `max-w-*` ou `w-[...]` dentro de formulário.
- Grades de 2 colunas usam as constantes de `src/components/ui/form-grid.ts` — `FORM_GRID`
  (`gap-4`), `FORM_GRID_COMPACT` (`gap-3`, listas dinâmicas) e `FORM_GRID_WIDE` (`gap-5`,
  integrações). Elas fazem o último campo de uma quantidade ímpar ocupar a linha inteira, o que
  cobre campos condicionais (ex.: URL do servidor só no Pusher em modo host) e listas com
  quantidade variável (parâmetros de API).
- Linha com exatamente 3 campos curtos usa `FORM_GRID_3` (`sm:grid-cols-3`). Nunca deixe um campo sozinho em
  meia linha para "completar" a grade de 2 colunas.
- Campo curto fixo é permitido só ao lado de outro que estica, completando a linha
  (ex.: `grid-cols-[1fr_96px]` para Cidade + UF), sem limitar a largura do conjunto.
- Escolha única numa lista pequena (2–4 opções) usa `OptionTabs` (`src/components/ui/option-tabs.tsx`),
  que ocupa a largura toda — nunca chips do tamanho do texto. Em linhas de tabela/lista use `size="xs"` com rótulos curtos e o texto completo em `title` de cada opção (vira dica
  e nome acessível), para o seletor e o campo (`h-8`) caberem na mesma linha do item. Os rótulos usam
  `whitespace-nowrap` (nunca quebram dentro do botão); num cabeçalho, mantenha o grupo com `shrink-0`
  para ele passar inteiro à linha seguinte em vez de espremer as opções.
- Escolha de **um** item numa lista grande ou rica (ex.: tarefa) usa
  `SearchPicker` (`ui/search-picker.tsx`) em vez de `Select`: popover com busca (local fuse.js por
  `searchKeys` ou no servidor por `onSearchChange`), opções ricas via `renderItem`, ↑/↓ +
  Enter, opções bloqueadas com motivo (`disabledReason`) e entrada/saída animadas. O gatilho com
  cara de campo é o `FieldTrigger` (`ui/field-trigger.tsx`). `Select` fica para
  listas curtas e simples.
- **Período** (início e fim) num formulário usa um só `DateRangeCalendar`
  (`ui/date-range-calendar.tsx`), nunca dois `DatePicker`; o `PresetDateRangeFilter` é só para
  filtros de lista.
- **Valores em R$** usam `MoneyInput` (`ui/money-input.tsx`, digitação bancária do Smart Desk,
  `formatNumberBR`/`parseBankingInputBR` de `src/lib/format.ts`); nunca `type="number"` para dinheiro.
- **Liga/desliga** em formulário usa `ToggleCard`/`FormToggleCard` (`ui/toggle-card.tsx`): rótulo + descrição à esquerda;
  situação ("Ativo"/"Inativo", configurável por `onLabel`/`offLabel`) + `Switch` à direita. Nunca
  checkbox para liga/desliga.
- **Texto longo em Markdown** usa `MarkdownField` (`ui/markdown-field.tsx`): barra de formatação
  (negrito, itálico, cabeçalho, link, imagem, lista, citação e código), abas **Escrever /
  Visualizar** animadas (Framer Motion) e prévia com o componente `Markdown`. Nunca um `Textarea`
  cru para descrição — é o mesmo campo no `TaskForm` e no portal do cliente (`modules/orcamentos.md`).
- Fora da regra: largura do `DialogContent`/`SheetContent`, barras de filtros de lista
  (`ListFilters`/`FilterGroup`), tabelas, dashboards e cards de escolha.

### Atalho Ctrl+Enter (⌘+Enter) em campos multiline

Campos `<textarea>` (multiline) usam o Enter para quebrar linha; para enviar o contexto do campo
sem sair do teclado, **Ctrl+Enter** (e **⌘+Enter** no Mac) aciona a ação principal. O atalho é
**global** — instalado uma única vez por `CtrlEnterSubmit` (`src/components/ctrl-enter-submit.tsx`),
renderizado no layout raiz (`src/app/layout.tsx`) — e não exige handler por campo. O Enter simples
continua nativo (quebra linha no textarea, submete no `<input>`).

Como funciona (listener de `keydown` no `document`, em fase de captura para alcançar formulários
portalados por diálogos Radix):

1. Age só em `<textarea>`, com `Enter` + (`ctrlKey` ou `metaKey`) e **sem** `altKey` (AltGr emite
   ctrl+alt), fora de `[data-ctrl-enter-ignore]` e do terminal `.xterm`, ignorando eventos já
   cancelados ou em composição (IME).
2. Resolve a ação, do mais específico ao mais genérico: **escopo explícito**
   (`data-ctrl-enter-scope`) → **botão marcado dentro do `<form>`** → **botão marcado em um
   ancestral** → **o próprio `<form>`** via `requestSubmit()` (respeita a validação e exibe os
   erros). Sem alvo resolvido, não interfere no padrão.
3. Ao resolver, previne o padrão e aciona o botão (`button.click()`; um botão desabilitado não
   dispara nada) ou submete o form.

Atributos (só onde não há `<form>` — nos formulários normais nada é necessário):

- `data-ctrl-enter-submit`: no botão que deve ser acionado.
- `data-ctrl-enter-scope`: no contêiner que envolve campo + botão (torna a resolução determinística).
- `data-ctrl-enter-ignore`: em qualquer ancestral, desliga o atalho na subárvore.

Campos que usam marcação: abas de IA ("Salvar" de cada aba, dentro do `<form>` do editor),
comentários da tarefa e do cliente, `CorrectionCard` ("Solicitar correção"), `ActionBar`
("Implementar"/envio do feedback), `StartWorkbench` ("Abrir mesa e gerar o plano"),
`AgentQuestionsCard` ("Responder") e o explorador OpenAPI ("Executar").

## Filtros persistidos na URL

Listas filtráveis usam um hook `useUrlFilters` no padrão do Smart Desk: a query string é a fonte
única do estado compartilhável.

- `useSyncExternalStore` + `URLSearchParams` + `history.replaceState` + `popstate` (sem
  `useSearchParams`, evitando Suspense bailout).
- Texto serializado direto; arrays separados por vírgula; valores iguais ao default são omitidos.
- Alterar filtros substitui a entrada do histórico; voltar para a rota restaura os filtros.
- Parâmetros alheios ao schema, `history.state` e hash são preservados.
- Cada tela declara schema e defaults tipados no dono do estado, não no componente visual.
- Paginação, modais e buscas internas de popovers não fazem parte do contrato.

### Filtro de período (janela de datas)

Todo filtro ou componente de janela de data (de/até) usa o `PresetDateRangeFilter`
(`src/components/ui/preset-date-range-filter.tsx`), cópia do filtro "Data Disparo" das notificações
do Smart Desk, dentro de um `FilterGroup`. Não use pares de `<input type="date">` nem seletores
próprios.

- Botão `h-10` com o período ("Desde dd/MM/yyyy", "Até …", "dd/MM/yyyy - dd/MM/yyyy" ou o
  `emptyLabel`), destacado na cor primária quando há valor.
- Popover: "Período personalizado" com o `DateRangeCalendar` (`date-range-calendar.tsx`, cópia do
  `DeliveryDateRangePicker`: 1º clique = início, 2º = fim e fecha, clicar antes do início inverte,
  prévia ao passar o mouse) + "Atalhos" + "Limpar período".
- Atalhos: padrão Hoje, Última semana, Último mês (`DEFAULT_DATE_PRESETS`). Para personalizar
  numa tela, passe `presets` montado com `DATE_PRESET.today|week|month` e `lastDaysPreset(n,
  rótulo?)`, ou um `DatePreset { key, label, icon, getRange }` próprio; `presets={[]}` esconde a
  seção.
- Valor `{ startDate, endDate }` em `yyyy-MM-dd` (vazio = `""`), gravado na URL como `de`/`ate`.
- O `Calendar` (`calendar.tsx`) marca a seleção com `primary`, nunca cor fixa.

### Componentes de filtro (cópia do Smart Desk)

- `ListFilters` (`src/components/list/ListFilters.tsx`) é o wrapper genérico: cartão
  `CadastroFilterCard` ("Filtros" + total de registros), busca compartilhada que ocupa o espaço
  disponível (`FilterGroup` `flex-[2] min-w-[200px]`, espera de 500 ms), os filtros próprios da
  página como `children` e o botão Limpar no fim. Uma linha no desktop (`lg:flex-nowrap`), quebra
  no celular.
- Cada lista estende o wrapper num componente `*Filters` com seus `FilterGroup`s (`flex-1
  min-w-[150px..180px]`, `CadastroMultiSelect`) e mantém schema/defaults e a função pura de
  filtragem em `utils/*-filters.ts`.
- Busca solta no cabeçalho, com largura fixa, não é usada.
- **Recolhível** (`collapsible`, usado em Tarefas): o cartão começa recolhido numa linha —
  "Filtros", resumo dos filtros ativos em chips (`ActiveFilterChips`: até 4 visíveis + "+N" com o
  resto na dica; × em cada chip remove só aquele filtro; chip `subtle` para preferências como a
  ordenação), "N REGISTROS", × limpar (só com filtro ativo) e ⌄. Clicar no cartão expande; o ⌃
  após o total recolhe. Abre/fecha com Framer Motion (altura, ou só opacidade com movimento
  reduzido). Sempre começa recolhido ao entrar na página (`defaultCollapsed`, padrão `true`). Os
  chips são montados pela página (função pura da feature), nunca pelo componente genérico. Sem
  `collapsible` o cartão segue sempre aberto.

**Regra: toda tela de listagem usa este padrão** — `CadastroHeader` (título, descrição e ações à
direita, como "Novo"/importar/atalhos da tela) + `*Filters` sobre `ListFilters`, com `onClear`
ligado ao `resetFilters` do `useUrlFilters` e `total` no contador "N REGISTROS". Nada de barras
próprias (inputs `h-8`, chips de status, contador ou busca no cabeçalho). Seleções múltiplas usam
`CadastroMultiSelect`; escolha única pequena (sim/todos, ordenação) usa `OptionTabs` (`h-10`)
dentro de um `FilterGroup`. Telas com muitos filtros usam a prop `secondary` do `ListFilters` (uma
segunda linha no mesmo cartão).

## Listas grandes e busca

- Mais de 50 itens: virtualização com `@tanstack/react-virtual`.
- Busca local tolerante a erro de digitação: `fuse.js`.
- Paginação infinita com `useInfiniteQuery` + `IntersectionObserver` em sentinela, quando a lista
  vem do servidor.

## Responsividade

Breakpoints do Tailwind (`sm` 640, `md` 768, `lg` 1024, `xl` 1280, `2xl` 1536). Toda tela funciona
de mobile a desktop.

## Acessibilidade

- Semântica HTML, labels em formulários, navegação por teclado (inclusive em arrastar e soltar:
  dnd-kit `KeyboardSensor`).
- Destaques de estado não dependem só de cor (ícone ou texto junto).
