import { describe, expect, it } from 'vitest'
import { parseContainerPorts, portLink, portLinkHost, portReach, portText, withReach } from '@/features/environments/container-ports'

/** Portas de cada container (OPE-211): leitura do `docker ps`/`inspect`, alcance e link. */

describe('parseContainerPorts', () => {
  it('0.0.0.0 e :: da mesma porta viram uma só; exposta sem publicação; ordenadas pela porta do container', () => {
    expect(parseContainerPorts('0.0.0.0:4100->3000/tcp, :::4100->3000/tcp, 5432/tcp, 0.0.0.0:80->80/tcp')).toEqual([
      { container: 80, protocol: 'tcp', published: 80, hostIp: null },
      { container: 3000, protocol: 'tcp', published: 4100, hostIp: null },
      { container: 5432, protocol: 'tcp', published: null, hostIp: null },
    ])
  })

  it('publicada só em 127.0.0.1, UDP e faixa de portas', () => {
    expect(parseContainerPorts('127.0.0.1:9229->9229/tcp, 0.0.0.0:53->53/udp')).toEqual([
      { container: 53, protocol: 'udp', published: 53, hostIp: null },
      { container: 9229, protocol: 'tcp', published: 9229, hostIp: '127.0.0.1' },
    ])
    expect(parseContainerPorts('0.0.0.0:8000-8001->8000-8001/tcp').map((port) => [port.container, port.published])).toEqual([
      [8000, 8000],
      [8001, 8001],
    ])
  })

  it('container parado: só o inspect (exposta e publicada); a exposta some quando a mesma porta está publicada', () => {
    expect(parseContainerPorts('', '{"3000/tcp":{},"9090/tcp":{}}', '{"3000/tcp":[{"HostIp":"","HostPort":"4100"},{"HostIp":"::","HostPort":"4100"}]}')).toEqual([
      { container: 3000, protocol: 'tcp', published: 4100, hostIp: null },
      { container: 9090, protocol: 'tcp', published: null, hostIp: null },
    ])
  })

  it('JSON vazio, null ou inválido: sem portas (sem erro)', () => {
    expect(parseContainerPorts('', 'null', 'null')).toEqual([])
    expect(parseContainerPorts('', '', '{}')).toEqual([])
    expect(parseContainerPorts('', '{quebrado', 'x')).toEqual([])
    // HostPort vazio (porta aleatória ainda não atribuída): fica sem publicação.
    expect(parseContainerPorts('', undefined, '{"80/tcp":[{"HostIp":"","HostPort":""}]}')).toEqual([{ container: 80, protocol: 'tcp', published: null, hostIp: null }])
  })
})

describe('alcance e link', () => {
  const published = { container: 3000, protocol: 'tcp' as const, published: 4100, hostIp: null }

  it('servidor: publicada vira link; sem publicação, UDP e 127.0.0.1 não', () => {
    const server = { runOn: 'server' as const, forwarded: [] }
    expect(portReach(published, server)).toBe('link')
    expect(portReach({ ...published, published: null }, server)).toBe('internal')
    expect(portReach({ ...published, protocol: 'udp' }, server)).toBe('udp')
    expect(portReach({ ...published, hostIp: '127.0.0.1' }, server)).toBe('local')
  })

  it('PC: só a porta repassada ao servidor vira link', () => {
    expect(portReach(published, { runOn: 'pc', forwarded: [4100] })).toBe('link')
    expect(portReach(published, { runOn: 'pc', forwarded: [4200] })).toBe('pc')
  })

  it('host configurado tem precedência sobre o da página; link e texto', () => {
    expect(portLinkHost('192.168.0.64', 'opex.example.com')).toBe('192.168.0.64')
    expect(portLinkHost('', 'opex.example.com')).toBe('opex.example.com')
    expect(portLinkHost(null, 'localhost')).toBe('localhost')
    const [port] = withReach([published], { runOn: 'server', forwarded: [] })
    expect(portLink(port!, '192.168.0.64')).toBe('http://192.168.0.64:4100')
    expect(portLink({ ...port!, reach: 'pc' }, '192.168.0.64')).toBeNull()
    expect(portLink(port!, '')).toBeNull()
    expect(portText(published)).toBe('3000/tcp → :4100')
    expect(portText({ ...published, published: null })).toBe('3000/tcp')
  })
})
