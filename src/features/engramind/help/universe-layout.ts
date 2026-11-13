import type { UniverseLayoutConfig } from "@engramind/client"

/**
 * Explicação (tooltip) de cada campo da aba Visualização (OPE-142). O rótulo e o intervalo vêm da lib
 * (`universeFieldLabel`, `UNIVERSE_NUMBER_FIELDS`); aqui fica só o que cada número faz no desenho.
 */
export const UNIVERSE_LAYOUT_HELP: Record<keyof UniverseLayoutConfig, string> = {
    layout: "Anéis: círculos concêntricos em volta do centro (o desenho original). Espiral: uma espiral de girassol, sem anéis visíveis.",
    order: "De que lado do centro ficam as memórias de maior valor no critério escolhido (as mais novas, as mais atualizadas, as usadas há menos tempo ou as mais usadas).",
    orderBy: "O que define a ordem a partir do centro: a data de criação, a última atualização, o último uso (consulta ou criação) ou o uso (consultas + injeções).",
    grouping: "Por canal junta as memórias do mesmo canal em arcos contíguos (útil no universo do agente, que mistura canais). Nenhum mantém só a ordem do critério.",
    balance: "Proporcional divide as memórias entre os anéis conforme as vagas de cada um, sem deixar o último quase vazio. Encher cada anel completa um anel antes de abrir o próximo.",
    firstRadius: "Distância do centro ao primeiro anel (ou ao início da espiral), em pixels.",
    ringGap: "Distância entre um anel e o seguinte, em pixels.",
    slot: "Espaço entre vizinhas no mesmo anel, em pixels. Define quantas memórias cabem em cada anel: menor espaço, mais memórias por anel.",
    minPerRing: "Número mínimo de vagas de um anel, mesmo quando o raio pequeno comportaria menos.",
    ringRotationDeg: "Quanto cada anel gira em relação ao anterior, em graus, para as partículas não ficarem alinhadas em raios. O padrão (≈ 34,95°) é o desenho original.",
    spiralSpacing: "Distância aproximada entre vizinhas na espiral, em pixels. A densidade é constante: o raio cresce com a raiz da posição.",
    spiralAngleDeg: "Ângulo entre memórias consecutivas na espiral, em graus. 137,508° é o ângulo de ouro, que distribui sem formar raios; outros valores desenham braços.",
    angleJitter: "Quanto cada partícula pode sair do lugar ao longo do anel, em % do passo angular entre vizinhas. 0 mantém o alinhamento perfeito.",
    radiusJitter: "Quanto cada partícula pode sair do raio do anel, em % da distância entre anéis. Até 49 %: as faixas dos anéis nunca se misturam.",
    jitterSeed: "Número que embaralha o desvio. O mesmo número dá sempre as mesmas posições (o desvio é estável, derivado do id da memória); troque para ver outra variação.",
    avoidOverlap: "Reduz o desvio de uma partícula até ela ficar a pelo menos a distância mínima das outras. Desligado, o desvio vale por inteiro e pode sobrepor.",
    minDistance: "Distância mínima entre os centros de duas partículas, em pixels, respeitada quando evitar sobreposição está ligado. 0 desliga a checagem.",
    particleMinPx: "Tamanho (diâmetro) da partícula menos usada do universo, em pixels.",
    particleMaxPx: "Tamanho (diâmetro) da partícula mais usada do universo, em pixels.",
    links: "Ao centro: cada memória tem um link até o agente ou canal do centro (o desenho de sempre). Entre similares: os links ao centro somem e cada memória se liga às similares dela do mesmo canal; dentro de cada anel, as similares ficam lado a lado (os anéis, raios, desvio e tamanhos não mudam).",
    relatedMax: "Quantas arestas, no máximo, partem de cada memória no modo Entre similares. Vai até 3: o Engramind devolve até 3 similares por memória, sempre do mesmo canal.",
    authorLinks: "Liga o agente do centro às memórias que ele mesmo criou, com o link destacado. Desligado, no modo Ao centro o link dela fica igual aos demais; no modo Entre similares não sobra link ao centro. Aplicar uma predefinição não muda este campo.",
}
