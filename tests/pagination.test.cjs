const { test } = require('node:test')
const assert = require('node:assert/strict')
const { PaginationV12, PaginationPlus, paginationV12PluginKey } = require('../dist')
const { PrefixSumIndex, findAllFloatIntersections } = require('../dist/prefixSumIndex')
const { MeasureManager } = require('../dist/measureManager')

test('package exposes configurable V12 and preserves legacy export', () => {
  assert.ok(PaginationPlus)
  assert.ok(paginationV12PluginKey)
  assert.equal(PaginationV12.name, 'PaginationV12')
  assert.equal(PaginationV12.configure({ pageWidth: 900 }).options.pageWidth, 900)
  assert.equal(PaginationV12.options.pageWidth, 600)
})
function view(heights) {
  const nodes = heights.map((height, i) => ({ offsetHeight: height, offsetTop: heights.slice(0, i).reduce((a,b) => a+b, 0) }))
  return { state: { doc: { forEach(fn) { nodes.forEach((_, i) => fn(null, i*10)) } } }, nodeDOM(pos) { return nodes[pos/10] }, dom: { lastElementChild: nodes.at(-1) } }
}
test('prefix index finds boundaries and rebuilds without stale nodes', () => {
  const index = new PrefixSumIndex()
  index.build(view([100, 150, 50]))
  assert.equal(index.totalHeight(), 300)
  assert.equal(index.findNodeAtY(100).pos, 0)
  assert.equal(index.findNodeAtY(101).pos, 10)
  assert.deepEqual(index.findAllFloatIntersections(100, 20).map(x => x.pos), [0, 10])
  index.build(view([]))
  assert.equal(index.totalHeight(), 0)
  assert.throws(() => index.findNodeAtY(1), RangeError)
})
test('intersections handle empty layout and reject dimensions that could loop forever', () => {
  assert.deepEqual(findAllFloatIntersections(view([]), 100, 20, 0), [])
  assert.throws(() => findAllFloatIntersections(view([100]), 0, 0, 0), RangeError)
  assert.throws(() => new PrefixSumIndex().findAllFloatIntersections(100, -100), RangeError)
  assert.deepEqual(findAllFloatIntersections(view([100,150,50]), 100,20,0).map(x => x.pos), [10,10])
})
test('failed images do not block measuring; destroy cancels queued frames', () => {
  const frames = new Map(); let id=0
  global.requestAnimationFrame = fn => { frames.set(++id,fn); return id }
  global.cancelAnimationFrame = key => frames.delete(key)
  const root = { querySelectorAll() { return [{complete: true, naturalWidth: 0}] } }
  const manager = new MeasureManager(); let measured=0
  manager.schedule({ key:'first', root, onReady() { measured++ } })
  const fn = frames.get(id); frames.delete(id); fn()
  assert.equal(measured, 1)
  manager.schedule({ key:'second', root, onReady() { measured++ } })
  manager.destroy()
  assert.equal(frames.size,0)
  manager.schedule({ key:'third', root, onReady() { measured++ } })
  assert.equal(frames.size,0)
  delete global.requestAnimationFrame; delete global.cancelAnimationFrame
})

test('new request with the same key replaces the callback waiting for a frame', () => {
  const frames = new Map(); let id = 0; const calls = []
  global.requestAnimationFrame = fn => { frames.set(++id, fn); return id }
  global.cancelAnimationFrame = key => frames.delete(key)
  const manager = new MeasureManager({ doubleRaf: true })
  const root = { querySelectorAll: () => [] }
  try {
    manager.schedule({ key: 'layout', root, onReady: () => calls.push('stale') })
    manager.schedule({ key: 'layout', root, onReady: () => calls.push('latest') })
    assert.equal(frames.size, 1)
    while (frames.size) {
      const [key, fn] = frames.entries().next().value
      frames.delete(key); fn()
    }
    assert.deepEqual(calls, ['latest'])
  } finally {
    manager.destroy()
    delete global.requestAnimationFrame; delete global.cancelAnimationFrame
  }
})

test('image errors release waiting measurements and detach event listeners', () => {
  const frames = new Map(); let id = 0; let measured = 0
  global.requestAnimationFrame = fn => { frames.set(++id, fn); return id }
  global.cancelAnimationFrame = key => frames.delete(key)
  const listeners = new Map()
  const img = { complete: false, addEventListener: (key, fn) => listeners.set(key, fn), removeEventListener: key => listeners.delete(key) }
  const manager = new MeasureManager()
  try {
    manager.schedule({ key: 'layout', root: { querySelectorAll: () => [img] }, onReady: () => measured++ })
    assert.equal(frames.size, 0)
    assert.equal(listeners.size, 2)
    img.complete = true
    listeners.get('error')()
    assert.equal(listeners.size, 0)
    frames.get(id)(); frames.delete(id)
    assert.equal(measured, 1)
  } finally {
    manager.destroy()
    delete global.requestAnimationFrame; delete global.cancelAnimationFrame
  }
})
