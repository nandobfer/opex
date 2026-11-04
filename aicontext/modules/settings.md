# Módulo: Configurações e seletor de cores (`src/features/settings/`, `src/features/color-palette/`)

Lugar central para as **preferências que as telas reaproveitam**. Hoje tem uma página, **Aparência**
(cores favoritas), que alimenta o seletor de cores único do app (OPE-136, port do MT-34 do my-tasks). Uma preferência nova
compartilhada entre telas entra como nova seção dessa página ou como novo item do grupo
Configurações do menu.

## Página Aparência (`/configuracoes/aparencia`)

- Item **Aparência** (ícone `Palette`) do grupo **Configurações** do menu (`APP_NAV`, junto de
  Ambientes — `modules/layout.md`), página `src/app/(app)/configuracoes/aparencia/page.tsx`.
- `/configuracoes` não tem tela própria: `src/app/(app)/configuracoes/page.tsx` redireciona
  (`redirect`) para `/configuracoes/aparencia`, então links e favoritos antigos continuam funcionando.
- `AppearancePage` (cabeçalho "Aparência", descrição "Cores favoritas usadas pelas telas") → seção
  "Cores favoritas" → `FavoriteColorsCard`:
  - grade de cartões (`FavoriteColorTile`): amostra, nome (ou o hex, quando não tem nome), hex, ícone
    de alerta quando a cor tem pouco contraste e as ações **editar** (lápis) e **remover**;
  - remover pede confirmação (`ConfirmDialog`). Centrais, colunas e o Maddox que já usam a cor
    continuam com ela, porque cada um guarda o próprio hex;
  - editar abre o `EditFavoriteColorDialog`, que muda nome e cor e mantém a favorita **na mesma
    posição** da lista:
    - "Salvar" só liga quando algo mudou;
    - a cor de **outra** favorita fica bloqueada com "Esta cor já está nas favoritas";
    - ao trocar a cor, o diálogo avisa que centrais, colunas e o Maddox que já usam a cor antiga
      continuam com ela;
  - `FavoriteColorForm` (react-hook-form + `favoriteColorSchema`, o mesmo da API) tem dois modos:
    `add` na página (limpa depois de enviar) e `edit` no diálogo. Os ids têm prefixo (`favorite-add-*`
    e `favorite-edit-*`), porque os dois ficam montados ao mesmo tempo. Cor pelo `ColorPicker` e nome
    opcional; cor repetida fica bloqueada;
  - estados: skeleton (`FavoriteColorsSkeleton`, com as constantes de `settings-layout.ts`), erro com
    "Tentar novamente" e vazio (ícone + texto, com o formulário logo abaixo).

## Cores (`src/lib/colors.ts`, puro)

- Formato único: hex `#RRGGBB` em maiúsculas. `hexColorSchema` remove espaços e aceita minúsculas.
  O inválido recebe "Use o formato #RRGGBB (ex.: #8000FF)".
- `colorValueSchema` (centrais, colunas e a cor do Maddox) aceita também o **nome da paleta antiga** (`violet`, `sky`,
  `emerald`, `amber`, `rose`, `cyan`, `orange`, `pink`, `lime`, `zinc`) e o converte para o hex do tom
  400 (`LEGACY_COLOR_HEX`). Assim a API e o Agente Opex continuam compatíveis.
- `normalizeColor` faz a mesma conversão na leitura do que foi salvo (`parseCentralConfig`, `toDto`
  das colunas, `CentralColorsProvider`, `withMaddoxDefaults`, dashboards); cor desconhecida vira `null`
  (nos gráficos, cinza). Não há migração no banco: ao
  salvar de novo, o valor passa a ser gravado em hex.
- `COLOR_MATRIX`: grade padrão com 10 matizes (Rosa, Laranja, Âmbar, Lima, Verde, Ciano, Azul,
  Violeta, Pink, Cinza) × 5 tons (300–700), cada amostra nomeada (ex.: "Verde 500").
- `DEFAULT_FAVORITE_COLORS`: as 10 cores da paleta antiga, com os mesmos nomes (Violeta, Azul,
  Verde, Âmbar, Rosa, Ciano, Laranja, Pink, Lima, Cinza). Quem já usava uma delas reencontra a cor
  pelo nome no seletor.
- **Aviso de contraste**: `hasLowContrast` dispara quando o contraste com o fundo dos cards
  (`--card`, `#15121C`) fica abaixo de 3:1 (WCAG para texto grande e elementos gráficos).
- Cor do usuário vai para a tela por `style` inline: é a exceção documentada à regra de tokens
  (`use-para-atualizar-tema-e-componentes-ui.md`).

## Favoritas (servidor)

- Modelo `ColorPalette` (`color_palettes`): um documento `{ key: "favorites", colors: [{ color, name }] }`.
- Sem documento salvo, valem as `DEFAULT_FAVORITE_COLORS`. Uma lista salva vazia continua vazia, ou
  seja, as padrão não voltam depois que o usuário remove todas.
- `addFavoriteColor`: entra no fim da lista. Cor repetida dá 409; acima de `COLOR_FAVORITES_MAX` (40)
  também dá 409. `removeFavoriteColor`: cor inexistente dá 404.
- `updateFavoriteColor(atual, { color, name })`: troca a favorita na mesma posição.
  - Favorita inexistente dá 404.
  - Nova cor igual a outra favorita dá 409.
  - Sem mudança, devolve a lista sem gravar, sem auditoria e sem evento.
- Toda mutação grava, registra auditoria (`CoresFavoritas`, antes/depois), gera log com Pino e
  publica `color-palette-updated` (`{ color, action }`, com `previousColor` na edição) em `private-app`.

| Rota | Descrição |
|---|---|
| `GET /api/color-palette` | `{ favorites: [{ color, name }] }` |
| `POST /api/color-palette/favorites` | `{ color, name? }` → paleta atualizada (400 hex inválido, 409 repetida/limite) |
| `PATCH /api/color-palette/favorites/[hex]` | Edita `{ color, name? }` da favorita do caminho (hex sem `#`) → paleta atualizada (400/404/409) |
| `DELETE /api/color-palette/favorites/[hex]` | Hex sem `#` no caminho (`A78BFA`) → paleta atualizada (400/404) |

São rotas internas (exigem a sessão do login) e ficam fora da OpenAPI pública.

## Cliente

- `useColorPalette()` (`hooks.ts`): é a fonte única das favoritas.
  - Consulta com cache de 5 min.
  - `addFavorite`, `removeFavorite` e `updateFavorite` (troca no lugar) são **otimistas**: revertem e mostram toast se falharem, e mostram
    toast de sucesso quando dão certo.
  - `isFavorite`.
  - Tempo real com `useColorPaletteRealtime`, que invalida a consulta no evento. Outra aba ou máquina
    vê a nova favorita.
- `ColorPicker` (`src/components/ui/color-picker/`) é **genérico** e recebe as favoritas por props.
  - Botão com a amostra, o nome (da favorita, da grade ou o hex) e o hex. Ele abre um popover `modal`
    (funciona dentro de `Dialog`, e o Esc fecha só o popover).
  - Dentro do popover: Favoritas, Paleta, campo Hexadecimal e "Adicionar às favoritas" (desligado
    quando a cor já é favorita).
  - O campo Hexadecimal aplica a cor assim que o código fica válido e mostra o erro no Enter, ao sair
    do campo ou com 7 caracteres inválidos.
  - "Sem cor" aparece só com `allowNone`.
  - `LowContrastWarning` aparece abaixo do botão e dentro do painel.
- `ColorPaletteField` (feature) liga o `ColorPicker` ao `useColorPalette`. **É ele que as telas
  usam**: `CentralColorField` (cor do projeto da central, com `allowNone` "Sem cor (neutra)"),
  `ColumnFormDialog` (cor da coluna do quadro) e o `MaddoxColorField` (**Cor do agente** do Agente
  Maddox em Integrações › Inteligência Artificial › Agente Maddox, com `allowNone` "Primária (padrão)"
  e a prévia do ícone — `modules/maddox-agent.md`). O seletor substituiu a paleta fixa de 10 cores
  (`ColumnColorPicker`, removido).

## Ferramentas do Agente Opex (grupo `appearance`, só o dono)

`src/features/opex-agent/server/tools/appearance.ts`, chamando as mesmas funções de serviço da tela:

| Ferramenta | O que faz |
|---|---|
| `list_favorite_colors` | Lista as favoritas (`getColorPalette`) |
| `add_favorite_color` | `{ color, name? }` no fim da lista (`addFavoriteColor`) |
| `update_favorite_color` | `{ currentColor, color, name? }` na mesma posição (`updateFavoriteColor`) |
| `remove_favorite_color` | `{ color }` (`removeFavoriteColor`) |

- **Nenhuma pede confirmação nem é destrutiva**, por decisão do dono (OPE-136), inclusive remover:
  quem já usa a cor guarda o próprio hex. Por isso o token de sistema não precisa de
  `mcp:owner:destructive` para elas (basta `mcp:owner` + a ferramenta, o grupo
  `mcp:owner:group:appearance` ou todas).
- O hex chega validado por `hexColorSchema` (o inválido volta ao modelo como erro, sem chamar o
  serviço); 404/409 do serviço voltam pela mensagem do `DomainError`.
- Ficam fora do Agente Opex do portal do cliente (o portal só exibe as cores). A especificação do MCP
  do Maddox é gerada do catálogo, sem edição manual.
- As ferramentas que já existiam continuam aceitando cor pelo schema: `create_central`/`update_central`
  (`centralConfigSchema.color`) e `update_ai_feature_settings` do Maddox (`maddoxAgentSettingsSchema.color`)
  recebem hex ou um nome antigo da paleta.

## Testes

- `__tests__/lib/colors.test.ts`: hex, nomes antigos, grade e contraste.
- `__tests__/features/color-palette/`:
  - serviço: padrão, adicionar, repetida, limite, remover, lista vazia, editar nome e cor na mesma
    posição, 404/409, edição sem mudança, evento e auditoria;
  - rotas: `PATCH` e `DELETE`, com 400 para hex inválido;
  - hook: otimista, edição no lugar, Pusher e reversão.
- `__tests__/components/color-picker.test.tsx`: favoritas, grade, hex válido e inválido,
  adicionar favorita, "Sem cor" e aviso de contraste.
- `__tests__/features/settings/appearance-page.test.tsx`: página Aparência (cabeçalho e favoritas) e
  o redirecionamento de `/configuracoes`.
- `__tests__/features/settings/favorite-colors-card.test.tsx`: lista, remoção confirmada, estados e
  edição (campos preenchidos, Salvar só com mudança, cor repetida bloqueada, aviso de cor alterada).
- `__tests__/features/tasks/column-form-color.test.tsx`: favoritas no formulário da coluna, Esc só no
  seletor, hex enviado e coluna salva com nome antigo convertida.
- `__tests__/features/color-palette/opex-tools.test.ts`: as quatro ferramentas (grupo, sem
  confirmação, sem escopo destrutivo, fora do portal, serviço com hex normalizado e hex inválido).
