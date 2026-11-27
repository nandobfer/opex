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
    ['<body onload="fetch(\'http://10.0.0.5:8080/x\')">', 'evento'],
    ['<svg/onload=alert(1)>', 'evento'],
    ['<img src="data:image/png;base64,AA" onerror="fetch(1)">', 'evento'],
    ['<a href="javascript:alert(1)">x</a>', 'javascript:'],
    ["<div style=\"background:image-set('http://mongodb:27017/' 1x)\">", 'image-set'],
    ['<style>div{background:-webkit-image-set("http://x" 1x)}</style>', 'image-set'],
    ['<style>div{background:u\\72l(http://10.0.0.1/a)}</style>', 'barra invertida'],
    ['<style>@im\\70ort "x.css";</style>', 'barra invertida'],
    ['<div style="background:u&#114;l(http://x)">', 'url('],
    ['<div style="background:url&lpar;http://x)">', 'entidade'],
    // Rodada 2: <style> sem fechamento, comentário CSS com aspas e ">" dentro de um valor de atributo.
    ['<style>body{background:u\\72l(http://10.0.0.5:8080/x)}', 'barra invertida'],
    ['<style>a{background:/*"*/u\\72l(http://mongodb:27017/)/*"*/}</style>', 'barra invertida'],
    ['<body title=">" onload="fetch(\'http://10.0.0.5/x\')">', 'evento'],
    ['<img title=">" src="http://10.0.0.5/x">', 'src'],
    ['<a href="java&#x09;script:alert(1)">x</a>', 'javascript:'],
    ['<svg><style>a{background:u&#114;l(http://x)}</style></svg>', 'url('],
  ])('recusa %s', (html, fragment) => {
    expect(externalResourceReason(html)).toContain(fragment)
  })

  it('aceita data: URI, âncoras e links comuns', () => {
    const html = '<html><head><style>body{background:url(data:image/png;base64,AAAA)}</style></head><body><a href="https://linkedin.com/in/x">perfil</a><img src="data:image/png;base64,AAAA"><svg><use href="#icone"/></svg><div data-x="1"></div></body></html>'
    expect(externalResourceReason(html)).toBeNull()
  })

  it('aceita o modelo do currículo (escape dentro de string do CSS) e texto com "JavaScript:" ou "on"', () => {
    const html = '<style>li:before{content:"\\2013";position:absolute}</style><ul><li class="sk" title="Learn JavaScript: basics"><b>JavaScript:</b> one = two, on-call &amp; more</li></ul>'
    expect(externalResourceReason(html)).toBeNull()
  })

  it('a mensagem orienta a embutir os recursos', () => {
    expect(htmlGuardMessage('<img src="http://x">')).toContain('data: URI')
    expect(htmlGuardMessage('<p>ok</p>')).toBeNull()
  })
})
