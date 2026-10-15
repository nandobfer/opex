# Modo Vim nos campos de texto

## Objetivo

Trocar, quando o usuário quiser, todos os campos de texto multilinha do app (`Textarea` de
`src/components/ui/textarea.tsx`) por um editor com navegação e edição do Vim, e voltar ao
`<textarea>` normal a qualquer momento. Vale para **todo o app** — as telas do dono e o portal do
cliente (`/cliente/**`) —, porque o atalho e o componente são globais.

Portado de `~/code/sipal/my-tasks` (modo Vim nos campos de texto) e adaptado às regras do Opex.

## Alternância

- **Atalhos**: **Ctrl+Tab** ou **Ctrl+Shift+Alt+V** (`isEditorModeToggle`,
  `src/features/editor-mode/shortcut.ts`), instalados uma vez por `EditorModeShortcut`
  (`src/components/editor-mode-shortcut.tsx`) no layout raiz, em captura na janela.
  - Numa aba comum o navegador reserva o Ctrl+Tab (troca de aba) e a página nunca o recebe; ele só
    funciona onde o navegador entrega a tecla (ex.: janela de aplicativo). O Ctrl+Shift+Alt+V
    funciona sempre.
  - Eventos repetidos (`event.repeat`) e de composição (IME) são ignorados, para uma tecla segura
    não alternar várias vezes.
- **Selo de modo** (`NORMAL`, `INSERT`, `VISUAL`, `V-LINE`, `V-BLOCK`, `REPLACE`) no canto do editor;
  clicar nele volta ao campo normal.
- A preferência é **global** (todos os campos, todas as abas) e fica no navegador
  (`usePersistentState`, chave `opex:editor-mode:v1`, `useEditorMode()` de
  `src/features/editor-mode/preference.ts`). Padrão: nativo. Toast do sonner confirma cada troca.
- O campo em foco troca na hora, mantendo foco e cursor: ao ligar, o editor começa em **INSERT** se o
  campo estava em edição (senão em NORMAL); ao desligar, o foco volta ao `<textarea>`.

## Como funciona

- Editor: CodeMirror 6 + `@replit/codemirror-vim` (`src/components/ui/vim-editor/`), carregado sob
  demanda (`React.lazy`) só quando o modo Vim está ligado. Enquanto carrega — ou se o chunk falhar — o
  `<textarea>` segue **visível e utilizável**; ele só é escondido quando o editor fica pronto
  (`onReady`). A falha é contida pelo `EditorErrorBoundary` do próprio módulo, sem derrubar a tela.
- O `<textarea>` **continua no DOM como fonte do valor**, fora da tela e fora do Tab:
  - cada edição no editor grava o texto nele pelo setter do protótipo e dispara `input`
    (`writeTextareaValue`), então `register` do react-hook-form e `value`/`onChange` controlados
    funcionam sem mudança;
  - atribuições externas a `value` (re-render controlado, `reset` do formulário, barra de formatação
    do `MarkdownField`) voltam para o editor com a menor troca possível (`watchExternalValue` +
    `minimalChange`);
  - a seleção do editor é espelhada nele (barra de formatação e envio de mídia na posição do cursor);
  - foco no `<textarea>` (label, `focus()` de código) vai para o editor com a seleção pedida;
  - colar/arrastar **arquivos** no editor repete o evento no `<textarea>` (envio de mídia do
    `MarkdownField`), na posição do cursor.
- `disabled`/`readOnly`/`placeholder` são repassados ao editor por `Compartment`, sem remontá-lo.
- Tema por tokens (`theme.ts`): fonte monoespaçada, cursor em bloco no modo normal, seleção em
  `--primary`. O Vim esconde a seleção nativa do navegador, então o editor usa a camada desenhada do
  CodeMirror (`drawSelection`) para mostrar a seleção do modo visual (`v`, `V`, Ctrl+V).
- Ao desmontar (ex.: diálogo fechado), se o editor tinha o foco, ele volta ao `<textarea>`.

## Números de linha

- Coluna de números à esquerda (`line-numbers.ts`), ligada por padrão, com a linha do cursor
  destacada em `--primary`.
- Controlada como no Vim, por `:set`: `:set nu`/`:set nonu` (`number`) e `:set rnu`/`:set nornu`
  (`relativenumber`); `:set nu!` alterna e `:set nu?` mostra o valor.
  - só `number`: número absoluto;
  - só `relativenumber`: distância até o cursor, `0` na linha do cursor;
  - os dois: híbrido (absoluto na linha do cursor, relativo nas demais);
  - nenhum: sem coluna.
- A escolha é global e fica no navegador (`opex:editor-mode:line-numbers:v1`,
  `src/features/editor-mode/line-numbers.ts`): vale para todos os campos e abas abertos na hora.

## Teclas além do Vim padrão

| Tecla | Efeito |
|---|---|
| Esc em INSERT/VISUAL, com comando pendente ou no prompt `:` | Fica no editor (volta ao NORMAL / cancela) e **não** fecha o diálogo em volta |
| Esc no NORMAL | Segue normalmente (fecha o diálogo) |
| Ctrl+Enter | Ação principal do campo (mesma resolução do Ctrl+Enter do `<textarea>`) |
| `:w` | Ação principal do campo (mesma resolução do Ctrl+Enter) |
| `:q` | Tira o foco do campo |
| `:wq`, `:x` | Enviam e tiram o foco |
| Ctrl+J / Ctrl+E (INSERT) | Quebra de linha / fim da linha lógica, como no `<textarea>` |

Os comandos de escrita (`:w`, `:wq`, `:x`) ficam **inertes** em campo `disabled`/`readOnly`, sem
erro; `:q` continua saindo. `Ctrl+J` respeita o `maxLength` do campo.

## Área de transferência

- Como `clipboard=unnamedplus`: yank, delete e change no registrador sem nome também vão para a área
  de transferência do sistema.
- O `p` cola o que estiver no sistema quando o navegador permite a leitura: a permissão é pedida uma
  única vez por sessão da página, ao ligar o modo Vim pelo atalho (o atalho é um gesto do usuário;
  repetir o pedido abriria o prompt várias vezes), e o texto é lido ao focar o editor. Textos
  copiados dentro do app (Ctrl+C fora do editor) também alimentam o `p`. Sem permissão (incluindo
  navegadores em que `navigator.permissions.query` falha, ex.: Safari), valem só os registradores
  internos — falha silenciosa.

## Exclusões

- `vim={false}` mantém o campo sempre nativo.
- Campos dentro do terminal (`.xterm`) ou de subárvores `[data-textarea-shortcuts-ignore]` nunca viram
  editor.

## Arquivos

- `src/features/editor-mode/` — `preference.ts` (modo), `shortcut.ts` (atalhos puros) e
  `line-numbers.ts` (preferência e formato dos números).
- `src/components/ui/vim-editor/` — `VimEditor.tsx` (montagem/ciclo de vida), `ModeBadge.tsx` (selo),
  `vim-setup.ts` (comandos Ex, registradores, modos e Ctrl+J/Ctrl+E), `sync.ts` (valor/seleção),
  `host.ts` (ponte host ↔ `<textarea>`), `clipboard.ts`, `theme.ts`, `line-numbers.ts` (coluna),
  `dom.ts` (classes, nome acessível e encaminhamento de arquivos) e `EditorErrorBoundary.tsx`.
- `src/components/editor-mode-shortcut.tsx` e `src/components/ctrl-enter-submit.tsx` (atalhos globais
  de textarea: Ctrl+Enter, Ctrl+J e Ctrl+E).
- `src/hooks/usePersistentState.ts` — `readPersistentState`/`writePersistentState` (leitura e escrita
  imperativas, usadas pelos comandos `:set` fora do React).

## Testes

`__tests__/components/vim-editor/` (sincronização, integração com react-hook-form, selo, Ctrl+Enter,
Esc, seleção visual, números de linha, Ctrl+J/Ctrl+E, exclusões, `EditorErrorBoundary`),
`__tests__/features/editor-mode/shortcut.test.tsx` (atalho, persistência e pedido único de clipboard)
e `__tests__/features/editor-mode/line-numbers.test.ts` (formato dos números). Os atalhos de edição no
`<textarea>` nativo estão em `__tests__/components/ctrl-enter-submit.test.tsx`.
