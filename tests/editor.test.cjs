const { test } = require('node:test')
const assert = require('node:assert/strict')
const { JSDOM } = require('jsdom')

test('Tiptap mounts, edits, resets, isolates styles and destroys V12', async () => {
  const dom = new JSDOM('<html><head></head><body></body></html>', { pretendToBeVisual: true })
  for (const key of ['window','document','Node','HTMLElement','Element','MutationObserver','getComputedStyle','requestAnimationFrame','cancelAnimationFrame']) {
    global[key] = typeof dom.window[key] === 'function' && ['getComputedStyle','requestAnimationFrame','cancelAnimationFrame'].includes(key) ? dom.window[key].bind(dom.window) : dom.window[key]
  }
  const { Editor, Node: TiptapNode } = require('@tiptap/core')
  const { PaginationV12 } = require('../dist')
  const doc = TiptapNode.create({ name:'doc', topNode:true, content:'paragraph+' })
  const paragraph = TiptapNode.create({ name:'paragraph', group:'block', content:'text*', parseHTML: () => [{tag:'p'}], renderHTML: () => ['p',0] })
  const text = TiptapNode.create({ name:'text', group:'inline' })
  const editors=[]
  try {
    for (const pageWidth of [600,900]) {
      const element=document.createElement('div'); document.body.append(element)
      editors.push(new Editor({ element, extensions:[doc,paragraph,text,PaginationV12.configure({pageWidth})], content:'<p>Hello</p>' }))
    }
    await new Promise(resolve => setTimeout(resolve, 80))
    assert.equal(document.querySelectorAll('style[data-rm-pagination-style]').length,2)
    assert.notEqual(editors[0].storage.PaginationV12.scopeClass, editors[1].storage.PaginationV12.scopeClass)
    assert.equal(editors[0].commands.insertContent(' world'),true)
    assert.equal(editors[0].commands.resetPagination(),true)
    assert.ok(editors[0].getText().includes('world'))
    await new Promise(resolve => setTimeout(resolve, 80))
  } finally {
    editors.forEach(editor => editor.destroy())
    assert.equal(document.querySelectorAll('style[data-rm-pagination-style]').length,0)
    dom.window.close()
  }
})
