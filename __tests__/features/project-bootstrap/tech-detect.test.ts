import { describe, expect, it } from 'vitest'
import { detectTechnologies, findTerm, flattenDetected, type CatalogGroup, type CatalogTechnology } from '@/features/project-bootstrap/tech-detect'
import { SEED_TECH_GROUPS } from '@/features/project-bootstrap/seed/technologies'

/** Catálogo da carga inicial, com ids previsíveis. */
function seedCatalog(): { technologies: CatalogTechnology[]; groups: CatalogGroup[] } {
    const groups: CatalogGroup[] = []
    const technologies: CatalogTechnology[] = []
    SEED_TECH_GROUPS.forEach((group, order) => {
        groups.push({ id: `g${order}`, name: group.name, color: group.color, order })
        group.technologies.forEach((tech) => technologies.push({ id: tech.name, name: tech.name, aliases: tech.aliases, groupId: `g${order}` }))
    })
    return { technologies, groups }
}

const detect = (text: string) => {
    const { technologies, groups } = seedCatalog()
    return detectTechnologies(text, technologies, groups)
}

const names = (text: string) => flattenDetected(detect(text)).map((tech) => tech.name)

describe('detectTechnologies', () => {
    it('reconhece o exemplo da tarefa e agrupa por grupo na ordem do catálogo', () => {
        const groups = detect('serviço de memórias de IA escrito em rust com sqlite e frontend administrativo em next com mongo')
        expect(groups.map((entry) => entry.group.name)).toEqual(['Linguagem', 'Banco de dados', 'Frontend'])
        expect(flattenDetected(groups)).toEqual([
            { name: 'Rust', group: 'Linguagem' },
            { name: 'SQLite', group: 'Banco de dados' },
            { name: 'MongoDB', group: 'Banco de dados' },
            { name: 'Next.js', group: 'Frontend' },
        ])
    })

    it.each(['mongo', 'mongodb', 'MongoDB', 'MONGO'])('reconhece a variante %s de MongoDB', (text) => {
        expect(names(`banco ${text}`)).toEqual(['MongoDB'])
    })

    it.each(['next', 'nextjs', 'next.js', 'Next.JS'])('reconhece a variante %s de Next.js sem duplicar', (text) => {
        expect(names(`app em ${text}.`)).toEqual(['Next.js'])
    })

    it('não casa dentro de outra palavra nem o js de next.js', () => {
        expect(names('nextcloud e reaction')).toEqual([])
        expect(names('feito em next.js')).toEqual(['Next.js'])
    })

    it('ignora acento e caixa e não repete a tecnologia citada duas vezes', () => {
        expect(names('Rust, RUST e rust')).toEqual(['Rust'])
    })

    it('texto sem tecnologia reconhecida não traz badges', () => {
        expect(detect('um sistema para organizar a minha agenda')).toEqual([])
        expect(detect('   ')).toEqual([])
    })
})

describe('findTerm', () => {
    it('aceita termos com # e + e pontuação no fim da frase', () => {
        expect(findTerm('uso c# e c++.', 'c#')).toBe(4)
        expect(findTerm('uso c# e c++.', 'c++')).toBe(9)
        expect(findTerm('banco mongo.', 'mongo')).toBe(6)
    })
})
