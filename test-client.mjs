/**
 * dsh-tab-tools 客户端半边的自检。
 *
 * 完全按浏览器模块加载器的路径执行：先装上 `window.__ModuleLoader__` 的
 * `load` 钩子，再 import client.js，然后用一个只认 react 的 require 调用
 * factory —— 与 DSH 客户端实际做的事一致。
 *
 * 覆盖：
 *  - 模块 id / cordis 契约（inject、apply）；
 *  - apply() 确实往官方插槽 `sidebar.right.tab.menu.item` 注册了一项，并且
 *    注册项渲染出四行菜单、不可用状态正确；
 *  - 纯逻辑：guide 标签永不参与关闭、左/右/其他/全部的划分、目标消失时的兜底；
 *  - 语言判定（locale 服务 → 文案）。
 *
 * 真正的 DOM 行为（按钮注入位置、点一下真的关掉）在实机截图里复核，
 * 这里不模拟 DOM —— 只把可判定的部分钉死，避免"看起来差不多"。
 */
import { readFileSync } from 'node:fs'

let handoff = null
globalThis.window = {
  __ModuleLoader__: {
    load: (entry) => { handoff = entry },
  },
}
globalThis.document = undefined

/* 只够用的 React 替身：createElement 记录树，Fragment 是记号。 */
const Fragment = Symbol('Fragment')
const React = {
  Fragment,
  createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
  useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
  useMemo: (fn) => fn(),
  useCallback: (fn) => fn,
  useEffect: () => {},
}

let failures = 0
function check(name, cond, detail) {
  if (cond) console.log('  ok: ' + name)
  else {
    failures++
    console.error('  FAIL: ' + name + (detail === undefined ? '' : ' — ' + detail))
  }
}

await import('./lib/client.js')

check('module registered with the module loader', handoff !== null && handoff.id === 'dsh-tab-tools')

let mod = null
let factoryError = null
try {
  mod = handoff.factory((spec) => {
    if (spec === 'react') return React
    throw new Error('unexpected require: ' + spec)
  })
} catch (error) {
  factoryError = error
}
check('factory runs with react alone', factoryError === null, String(factoryError))
check('exports.apply is a function', typeof mod.apply === 'function')
check(
  'exports.inject declares slots + sidebarRight',
  Array.isArray(mod.inject) && mod.inject.includes('slots') && mod.inject.includes('sidebarRight'),
  JSON.stringify(mod.inject),
)

const internals = mod.internals
check('internals exposed for testing', internals !== undefined && typeof internals.planActions === 'function')

/* ------------------------------------------------------------------ */
/* 纯逻辑                                                              */
/* ------------------------------------------------------------------ */

const kinds = new Map([
  ['guide', 'guide'],
  ['file-a', 'editor'],
  ['file-b', 'editor'],
  ['term', 'terminal'],
])

check('guide is never closable', internals.isClosable('guide', kinds) === false)
check('a file tab is closable', internals.isClosable('file-a', kinds) === true)
check('an unknown kind is closable (unknown ≠ protected)', internals.isClosable('nope', kinds) === true)
check('no kind info at all → still closable', internals.isClosable('file-a', new Map()) === true)

const filtered = internals.filterClosable(['guide', 'file-a', 'term'], kinds)
check('filterClosable drops the guide tab', filtered.join(',') === 'file-a,term', filtered.join(','))

const ordered = ['guide', 'file-a', 'file-b', 'term']
const plan = internals.planActions(ordered, 2, kinds)
check('close-others keeps the target and drops the guide', plan.others.join(',') === 'file-a,term', plan.others.join(','))
check('close-left takes everything left of the target', plan.left.join(',') === 'file-a', plan.left.join(','))
check('close-right takes everything right of the target', plan.right.join(',') === 'term', plan.right.join(','))
check('close-all takes every closable tab', plan.all.join(',') === 'file-a,file-b,term', plan.all.join(','))

const edge = internals.planActions(ordered, -1, kinds)
check('a vanished target disables the relative actions', edge.others.length === 0 && edge.left.length === 0 && edge.right.length === 0)
check('a vanished target still allows close-all', edge.all.join(',') === 'file-a,file-b,term')

const firstTab = internals.planActions(ordered, 0, kinds)
check('right-clicking the first tab leaves nothing to its left', firstTab.left.length === 0)

/* ------------------------------------------------------------------ */
/* 服务读取与文案                                                       */
/* ------------------------------------------------------------------ */

const fakeSidebar = { mounted: { getSnapshot: () => 'session-1' }, tabsIn: () => [], close: () => {} }
const zhCtx = {
  get: (name) => (name === 'locale' ? { getSnapshot: () => ({ active: 'zh-CN' }) } : name === 'sidebarRight' ? fakeSidebar : undefined),
}
const enCtx = {
  get: (name) => (name === 'locale' ? { getSnapshot: () => ({ active: 'en' }) } : name === 'sidebarRight' ? fakeSidebar : undefined),
}
check('locale zh → 中文文案', internals.activeLanguage(zhCtx) === 'zh-CN')

/* ------------------------------------------------------------------ */
/* apply()：真的注册进了官方插槽                                        */
/* ------------------------------------------------------------------ */

const registrations = []
let effectCount = 0
const ctx = {
  get: zhCtx.get,
  effect: (fn) => { effectCount++; const dispose = fn(); return typeof dispose === 'function' ? dispose : () => {} },
  slots: {
    inject: (name, cb) => cb(name),
    register: (options, component) => { registrations.push({ options, component }); return () => {} },
  },
}

let applyError = null
try { mod.apply(ctx) } catch (error) { applyError = error }
check('apply() runs without a DOM', applyError === null, String(applyError))
check('apply() installs two effects', effectCount === 2, String(effectCount))
check(
  'registers exactly one entry into sidebar.right.tab.menu.item',
  registrations.length === 1 && registrations[0].options.name === 'sidebar.right.tab.menu.item',
  JSON.stringify(registrations.map((r) => r.options)),
)
check(
  'the list registration carries the required id (and an order)',
  registrations[0].options.id === 'dsh-tab-tools' && typeof registrations[0].options.order === 'number',
  JSON.stringify(registrations[0].options),
)

const rendered = registrations[0].component({ tab: { id: 'file-a', kind: 'editor' }, dismiss: () => {} })
const rows = Array.isArray(rendered.children[0]) ? rendered.children[0] : []
check('the menu entry renders four rows', rows.length === 4, String(rows.length))

/* 再渲染一层：MenuEntry 是函数组件，真身是它返回的 <button>。 */
const buttons = rows.map((row) => (typeof row.type === 'function' ? row.type(row.props) : row))
check(
  'all four rows are menu-item buttons labelled in zh',
  buttons.every((button) => button.type === 'button'
    && button.props.role === 'menuitem'
    && button.props.className === 'dsh-tabtools-menu-item'
    && button.props['data-dsh-tab-tools-menu-item'] === ''
    && typeof button.children[0] === 'string'
    && button.children[0].length > 0),
  JSON.stringify(buttons.map((button) => button.props.className)),
)
check(
  'the four labels are close-others / left / right / all',
  buttons.map((button) => button.children[0]).join('|') === '关闭其他标签|关闭左侧标签|关闭右侧标签|关闭全部标签',
  buttons.map((button) => button.children[0]).join('|'),
)
check('rows are disabled with no DOM (nothing to close)', buttons.every((button) => button.props.disabled === true))

/* 菜单项自己必须在动完之后关掉菜单（官方插槽的硬要求）。 */
let dismissed = 0
const withDismiss = registrations[0].component({ tab: { id: 'file-a', kind: 'editor' }, dismiss: () => { dismissed++ } })
const dismissButtons = withDismiss.children[0].map((row) => row.type(row.props))
dismissButtons[0].props.onClick({ stopPropagation: () => {} })
check('clicking an item dismisses the menu', dismissed === 1, String(dismissed))

/* ------------------------------------------------------------------ */
/* 包清单健全性                                                        */
/* ------------------------------------------------------------------ */

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
check('package name is dsh-tab-tools', pkg.name === 'dsh-tab-tools')
check('client entry declared', pkg.exports['./client'].default === './lib/client.js')
check('bundle patch declared', pkg.dsh.bundle.patch === './cordis.patch.yml')
check('client inject lists the official sidebar-right', pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-sidebar-right'))

const patch = readFileSync(new URL('./cordis.patch.yml', import.meta.url), 'utf8')
check('bundle patch mounts the loader row', patch.includes('id: dsh-tab-tools') && patch.includes("name: 'dsh-tab-tools'"))

console.log('')
if (failures > 0) {
  console.error(failures + ' 项失败')
  process.exit(1)
}
console.log('全部通过')
