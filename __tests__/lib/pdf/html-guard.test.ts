import { describe, expect, it } from 'vitest'
import { externalResourceReason, htmlGuardMessage } from '@/lib/pdf/html-guard'

describe('html-guard (OPE-210)', () => {
  it.each([
    ['<script>alert(1)</script>', 'script'],
    ['<img src="http://interno:8080/x.png">', 'src'],
    ["<img src='https://example.com/a.png'>", 'src'],
    ['<img src=//metadata/latest>', 'src'],
    ['<img src="file:///etc/passwd">', 'src'],
    ['<style>@import url(data:text/css,x);</style>', '@import'],
    ['<div style="background:url(http://10.0.0.1/a)">', 'url('],
    ['<link rel="stylesheet" href="http://x/a.css">', 'link'],
    ['<iframe src="data:text/html,x"></iframe>', 'iframe'],
    ['<img srcset="data:image/png;base64,AA 1x, http://x/b.png 2x">', 'srcset'],
    ['<svg><image href="http://x/a.png"/></svg>', 'SVG'],
    ['<meta http-equiv="refresh" content="0;url=http://x">', 'refresh'],
  ])('recusa %s', (html, fragment) => {
    expect(externalResourceReason(html)).toContain(fragment)
  })

  it('aceita data: URI, âncoras e links comuns', () => {
    const html = '<html><head><style>body{background:url(data:image/png;base64,AAAA)}</style></head><body><a href="https://linkedin.com/in/x">perfil</a><img src="data:image/png;base64,AAAA"><svg><use href="#icone"/></svg><div data-x="1"></div></body></html>'
    expect(externalResourceReason(html)).toBeNull()
  })

  it('a mensagem orienta a embutir os recursos', () => {
    expect(htmlGuardMessage('<img src="http://x">')).toContain('data: URI')
    expect(htmlGuardMessage('<p>ok</p>')).toBeNull()
  })
})
