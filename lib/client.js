/**
 * dsh-tab-tools — client half.
 *
 * 右侧边栏标签工具，挂在 DSH **官方**右侧边栏
 * （`@deepseek-ai/dsh-client-ui-sidebar-right` + `@deepseek-ai/dsh-client-ui-dockkit`）上。
 * 它只做两件事，两件事都只针对「当前这一块面板」：
 *
 *  1) 一键关闭按钮 —— 每个标签栏（`[data-dockkit-strip]`）右端注入一个 28×28 的图标按钮，
 *     位置在 dockkit 自己的 “+” 之后、伸缩空白（`[data-dockkit-strip-fill]`）之前，
 *     因此和「分栏 / 全屏 / 收起」这组控件不挤在一起，也不会被标签滚动带走。
 *     点击 = 关闭该面板里**全部可关闭**的标签。
 *
 *  2) 标签右键菜单 —— dockkit 的菜单本身只有一项自带「关闭」，但它把
 *     `renderTabMenuItems` 透传给官方插槽 `sidebar.right.tab.menu.item`
 *     （`{ tab, dismiss }`，list 型），我们注册进去就有四项：
 *     关闭其他标签 / 关闭左侧标签 / 关闭右侧标签 / 关闭全部标签。
 *
 * 为什么一半走插槽、一半走 DOM 注入：
 *  - 右键菜单有官方插槽，走插槽最稳（不碰别人的 DOM）；
 *  - 标签栏**没有任何**插槽（它的 chrome 由 sidebar-right 硬编码成
 *    全屏 + 收起两个按钮），所以「一键关闭」按钮只能自己插进
 *     `[data-dockkit-strip]`。插入点是 React 的既有子节点（strip-fill）之前，
 *    React 的插入/删除都用真实 DOM 引用，因此互不干扰。
 *
 * 关闭语义：
 *  - 只动当前面板（`[data-sidebar-right-session]`）内的标签，绝不跨会话；
 *  - 一律跳过 kind === `guide` 的「开始」标签：它是侧栏的入口页，不是打开的文件；
 *    （kind 取自 `ctx.sidebarRight.tabsIn(sessionId)`，读不到就按未知类型处理。）
 *  - 真正执行关闭交给 `ctx.sidebarRight.close(tabId)`：它自己判断能不能关，
 *    并且关掉最后一张停靠标签时会连带把侧栏收起来。
 *
 * Bundle 形态与官方一致：`window.__ModuleLoader__.load({ id, factory })`，
 * 用 `require` 拿 `react`（只有右键菜单项需要 React；按钮是纯 DOM，避免额外依赖）。
 */

window.__ModuleLoader__.load({
  id: 'dsh-tab-tools',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    var React = require('react')

    /* ------------------------------------------------------------------ */
    /* 常量                                                                */
    /* ------------------------------------------------------------------ */

    /** 「开始」guide 标签的 kind（与 sidebar-right 的 GUIDE_KIND 一致）。 */
    var GUIDE_KIND = 'guide'

    /** 面板 / 标签栏 / 标签 / 伸缩空白的官方 DOM 标记。 */
    var SEL_PANEL = '[data-sidebar-right-session]'
    var SEL_STRIP = '[data-dockkit-strip]'
    var SEL_TAB = '[data-dockkit-tab]'
    var SEL_FILL = '[data-dockkit-strip-fill]'

    /** 我们自己写进 DOM 的标记：宿主容器、按钮、菜单项。 */
    var ATTR_HOST = 'data-dsh-tab-tools-host'
    var ATTR_BUTTON = 'data-dsh-tab-tools-closeall'
    var ATTR_MENU_ITEM = 'data-dsh-tab-tools-menu-item'
    var STYLE_ID = 'dsh-tab-tools-style'

    /** list 型插槽的注册 id 与排序（list 注册必须带 id，缺了会当场抛错）。 */
    var MENU_ITEM_ID = 'dsh-tab-tools'
    var MENU_ITEM_ORDER = 10

    /** 「关掉整栏」按钮的图形：一个标签方框里套一个叉。 */
    var GLYPH =
      '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
      '<rect x="1.75" y="2.75" width="12.5" height="10.5" rx="2" stroke="currentColor"/>' +
      '<path d="M6.1 6.1L9.9 9.9M9.9 6.1L6.1 9.9" stroke="currentColor" stroke-linecap="round"/>' +
      '</svg>'

    /** 文案（跟随 DSH 的 locale 服务；取不到就用浏览器语言）。 */
    var COPY = {
      zh: {
        closeAll: '关闭全部标签',
        closeOthers: '关闭其他标签',
        closeLeft: '关闭左侧标签',
        closeRight: '关闭右侧标签',
      },
      en: {
        closeAll: 'Close All Tabs',
        closeOthers: 'Close Other Tabs',
        closeLeft: 'Close Tabs to the Left',
        closeRight: 'Close Tabs to the Right',
      },
    }

    /** 按钮样式沿用 dockkit 的 addTab/iconButton 与 menuItem 取值，只换选择器。 */
    var CSS = [
      '[' + ATTR_HOST + ']{display:flex;flex:none;align-items:center;justify-content:center;height:28px}',
      '[' + ATTR_HOST + '][hidden]{display:none}',
      '[' + ATTR_BUTTON + ']{display:inline-flex;flex:none;align-items:center;justify-content:center;width:28px;height:28px;padding:0;color:var(--dsw-alias-label-secondary);line-height:1;background:transparent;border:none;border-radius:var(--dsw-radius-sm);cursor:pointer}',
      '[' + ATTR_BUTTON + '] svg{width:15px;height:15px}',
      '[' + ATTR_BUTTON + ']:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}',
      '[' + ATTR_BUTTON + ']:focus-visible{outline:1px solid var(--dsw-alias-border-l2);outline-offset:1px}',
      '[' + ATTR_MENU_ITEM + ']{padding:4px 7px;color:var(--dsw-alias-label-primary);font-size:calc(var(--dsh-content-font-size-secondary, 13px) - 1px);font-family:inherit;text-align:left;background:transparent;border:none;border-radius:var(--dsw-radius-md);cursor:pointer}',
      '[' + ATTR_MENU_ITEM + ']:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
      '[' + ATTR_MENU_ITEM + ']:disabled{opacity:.4;cursor:default}',
    ].join('')

    /* ------------------------------------------------------------------ */
    /* 纯逻辑（可在 node 里直接单测，见 test-client.mjs）                    */
    /* ------------------------------------------------------------------ */

    /**
     * 一张标签能不能被「关闭」类操作带走：只有 guide（开始页）永远留下。
     * @param id - 标签 id。
     * @param kinds - id → kind 的表（Map 或普通对象）；缺省视为未知类型，允许关闭。
     * @returns 是否参与关闭。
     */
    function isClosable(id, kinds) {
      var kind = kinds instanceof Map ? kinds.get(id) : kinds ? kinds[id] : undefined
      return kind !== GUIDE_KIND
    }

    /**
     * 过滤出一批真正要关的标签。
     * @param ids - 按显示顺序排列的标签 id。
     * @param kinds - id → kind 表。
     * @returns 过滤后的 id 列表（顺序不变）。
     */
    function filterClosable(ids, kinds) {
      var out = []
      for (var i = 0; i < ids.length; i++) {
        if (isClosable(ids[i], kinds)) out.push(ids[i])
      }
      return out
    }

    /**
     * 由「同一个标签栏里的顺序 + 目标下标」算出三种相对关闭的目标集合。
     * @param ids - 同一栏内按显示顺序的标签 id。
     * @param index - 右键目标在该栏中的下标（-1 表示目标已消失）。
     * @param kinds - id → kind 表。
     * @returns `{ others, left, right, all }` 四组要关的 id。
     */
    function planActions(ids, index, kinds) {
      if (!Array.isArray(ids) || index < 0 || index >= ids.length) {
        return { others: [], left: [], right: [], all: filterClosable(ids || [], kinds) }
      }
      var target = ids[index]
      return {
        others: filterClosable(ids.filter(function (id) { return id !== target }), kinds),
        left: filterClosable(ids.slice(0, index), kinds),
        right: filterClosable(ids.slice(index + 1), kinds),
        all: filterClosable(ids, kinds),
      }
    }

    /* ------------------------------------------------------------------ */
    /* 环境读取                                                            */
    /* ------------------------------------------------------------------ */

    /** 当前界面语言（DSH locale 服务优先，其次 <html lang>，最后 navigator）。 */
    function activeLanguage(ctx) {
      try {
        var locale = ctx.get('locale')
        var snap = locale && typeof locale.getSnapshot === 'function' ? locale.getSnapshot() : null
        if (snap && typeof snap.active === 'string' && snap.active !== '') return snap.active
      } catch (e) { /* 没有 locale 服务就往下走 */ }
      try {
        if (document.documentElement && document.documentElement.lang) return document.documentElement.lang
      } catch (e) { /* 非浏览器环境 */ }
      try { return navigator.language || '' } catch (e) { return '' }
    }

    /** 取一条文案。 */
    function t(ctx, key) {
      var dict = /^zh/i.test(activeLanguage(ctx)) ? COPY.zh : COPY.en
      return dict[key] || COPY.en[key] || key
    }

    /** 取官方右侧边栏服务；未挂载时返回 undefined。 */
    function sidebarOf(ctx) {
      try { return ctx.get('sidebarRight') } catch (e) { return undefined }
    }

    /**
     * 当前在屏会话的 id → kind 表；读不到就是空表（此时一律按可关闭处理，
     * 即「读不到就宁可多关」不成立 —— 见 canClose 的兜底）。
     * @param sidebar - `ctx.sidebarRight`。
     * @returns id → kind 的 Map。
     */
    function tabKindMap(sidebar) {
      var map = new Map()
      if (!sidebar) return map
      try {
        var sessionId = sidebar.mounted.getSnapshot()
        if (!sessionId) return map
        var records = sidebar.tabsIn(sessionId) || []
        for (var i = 0; i < records.length; i++) {
          var record = records[i]
          if (record && record.id !== undefined) map.set(String(record.id), String(record.kind || ''))
        }
      } catch (e) { /* 该会话的 store 还没被采用：当作没有 kind 信息 */ }
      return map
    }

    /* ------------------------------------------------------------------ */
    /* DOM                                                                 */
    /* ------------------------------------------------------------------ */

    /** 转成真数组。 */
    function toArray(list) {
      return Array.prototype.slice.call(list || [])
    }

    /** 属性选择器里的值转义。 */
    function escapeAttr(value) {
      if (typeof CSS !== 'undefined' && CSS && typeof CSS.escape === 'function') return CSS.escape(value)
      return String(value).replace(/["\\]/g, '\\$&')
    }

    /** 某个面板里的全部标签栏。 */
    function stripsIn(panel) {
      return panel ? toArray(panel.querySelectorAll(SEL_STRIP)) : []
    }

    /** 一个标签栏里、按显示顺序排列的标签 id。 */
    function tabIdsIn(strip) {
      var out = []
      var nodes = strip ? toArray(strip.querySelectorAll(SEL_TAB)) : []
      for (var i = 0; i < nodes.length; i++) {
        var id = nodes[i].getAttribute('data-dockkit-tab')
        if (typeof id === 'string' && id !== '') out.push(id)
      }
      return out
    }

    /** 某个标签所在的标签栏；只在**当前在屏会话**的面板里找（guide 的 id 是常量，见 panelFor）。 */
    function stripOfTab(ctx, tabId) {
      if (typeof tabId !== 'string' || tabId === '') return null
      var root = panelFor(ctx) || document
      try {
        var tab = root.querySelector(SEL_STRIP + ' ' + SEL_TAB + '[data-dockkit-tab="' + escapeAttr(tabId) + '"]')
        return tab && typeof tab.closest === 'function' ? tab.closest(SEL_STRIP) : null
      } catch (e) { return null }
    }

    /** 某个节点所属的右侧边栏面板。 */
    function panelOf(node) {
      return node && typeof node.closest === 'function' ? node.closest(SEL_PANEL) : null
    }

    /**
     * 当前在屏会话的面板元素（找不到就返回 null）。
     *
     * 为什么不能全文档 `document.querySelector('[data-dockkit-strip] [data-dockkit-tab="…"]')`：
     * 「开始」guide 标签的 id 是**常量**
     * （`@deepseek-ai/dsh-client-ui-sidebar-right/guide`），每个会话的面板里都有一个同 id 的
     * 标签；而同一时刻文档里可能挂着多个会话的面板（非当前会话的标了 hidden）。
     * 全文档查找会命中第一个——很可能是别的会话的面板，于是拿到一套完全无关的标签序列
     * （实测：面板里只显示 1 个标签，算出来却是 n=11）。所以先按在屏会话 id 缩小到本面板。
     */
    function panelFor(ctx) {
      if (typeof document === 'undefined' || !document.body) return null
      var sidebar = sidebarOf(ctx)
      var sessionId = null
      try { sessionId = sidebar ? sidebar.mounted.getSnapshot() : null } catch (e) { sessionId = null }
      if (typeof sessionId !== 'string' || sessionId === '') return null
      var nodes
      try {
        nodes = document.querySelectorAll('[data-sidebar-right-session="' + escapeAttr(sessionId) + '"]')
      } catch (e) { return null }
      for (var i = 0; i < nodes.length; i++) {
        if (nodes[i].querySelector(SEL_STRIP)) return nodes[i]
      }
      return nodes[0] || null
    }

    /** 关掉一批标签（不可关的由 `sidebarRight.close` 自己忽略）。 */
    function closeIds(sidebar, ids) {
      if (!sidebar || !ids || ids.length === 0) return 0
      var closed = 0
      for (var i = 0; i < ids.length; i++) {
        try {
          sidebar.close(ids[i])
          closed++
        } catch (e) { /* 标签已经不存在 / 没有在屏会话：忽略 */ }
      }
      return closed
    }

    /** 一个面板里全部可关闭的标签 id。 */
    function closableIds(panel, kinds) {
      var ids = []
      var strips = stripsIn(panel)
      for (var i = 0; i < strips.length; i++) ids = ids.concat(tabIdsIn(strips[i]))
      return filterClosable(ids, kinds)
    }

    /** 一键关闭：以按钮/菜单项所在面板为准，关掉它全部可关闭的标签。 */
    function runCloseAll(ctx, node) {
      var panel = panelOf(node)
      if (!panel) return 0
      var sidebar = sidebarOf(ctx)
      return closeIds(sidebar, closableIds(panel, tabKindMap(sidebar)))
    }

    /* ------------------------------------------------------------------ */
    /* 样式                                                                */
    /* ------------------------------------------------------------------ */

    /** 注入插件样式（幂等；DSH 热更新重组模块时可能清掉，sync 会补回来）。 */
    function ensureStyle() {
      if (typeof document === 'undefined' || !document.head) return null
      var existing = document.getElementById(STYLE_ID)
      if (existing) return existing
      var style = document.createElement('style')
      style.id = STYLE_ID
      style.setAttribute('data-dsh-plugin', 'dsh-tab-tools')
      style.textContent = CSS
      document.head.appendChild(style)
      return style
    }

    /* ------------------------------------------------------------------ */
    /* 一键关闭按钮（DOM 注入）                                             */
    /* ------------------------------------------------------------------ */

    /** 造一个按钮（纯 DOM：不依赖 react-dom，插进别人的 flex 行里也不会有包装层）。 */
    function makeButton(ctx, host) {
      var button = document.createElement('button')
      button.type = 'button'
      button.className = 'dsh-tabtools-button'
      button.setAttribute(ATTR_BUTTON, '')
      button.setAttribute('aria-label', t(ctx, 'closeAll'))
      button.title = t(ctx, 'closeAll')
      button.innerHTML = GLYPH
      button.addEventListener('click', function (event) {
        // 标签栏自己不处理 click，但停止冒泡可以避免被外层（页签面板）误当成点面板。
        event.preventDefault()
        event.stopPropagation()
        runCloseAll(ctx, host)
      })
      return button
    }

    /**
     * 在某个标签栏里确保有我们的按钮；已存在就复用（幂等）。
     * @returns 宿主节点，或 null（标签栏没有父节点时）。
     */
    function ensureButton(ctx, strip) {
      var host = strip.querySelector('[' + ATTR_HOST + ']')
      if (host) return host
      host = document.createElement('div')
      host.setAttribute(ATTR_HOST, '')
      host.appendChild(makeButton(ctx, host))
      var fill = strip.querySelector(SEL_FILL)
      if (fill && fill.parentNode === strip) strip.insertBefore(host, fill)
      else strip.appendChild(host)
      return host
    }

    /** 按当前标签数量刷新按钮的显隐（只留一张「开始」页时不显示）。 */
    function sync(ctx) {
      if (typeof document === 'undefined' || !document.body) return
      ensureStyle()
      var sidebar = sidebarOf(ctx)
      var kinds = tabKindMap(sidebar)
      var panels = toArray(document.querySelectorAll(SEL_PANEL))
      for (var i = 0; i < panels.length; i++) {
        var closable = closableIds(panels[i], kinds).length
        var strips = stripsIn(panels[i])
        for (var j = 0; j < strips.length; j++) {
          var host = ensureButton(ctx, strips[j])
          if (host) host.hidden = closable === 0
        }
      }
      // 面板/标签栏被 React 拆掉后，把留在文档里的孤儿宿主清掉。
      var orphans = toArray(document.querySelectorAll('[' + ATTR_HOST + ']'))
      for (var k = 0; k < orphans.length; k++) {
        if (!orphans[k].isConnected || orphans[k].closest(SEL_STRIP) === null) orphans[k].remove()
      }
    }

    /**
     * DOM 变化时重算按钮（标签栏是 React 渲染的，开/关标签、切换会话都会重排）。
     * 用定时器合并突发变更：流式回答期间 DOM 抖动很密，不能被每个 mutation 拖着跑。
     * @returns 释放函数。
     */
    function observe(ctx) {
      if (typeof MutationObserver === 'undefined' || typeof document === 'undefined' || !document.body) {
        return function () {}
      }
      var timer = null
      var schedule = function () {
        if (timer !== null) return
        timer = setTimeout(function () {
          timer = null
          sync(ctx)
        }, 120)
      }
      var observer = new MutationObserver(schedule)
      observer.observe(document.body, { childList: true, subtree: true })
      schedule()
      return function () {
        observer.disconnect()
        if (timer !== null) { clearTimeout(timer); timer = null }
        var hosts = toArray(document.querySelectorAll('[' + ATTR_HOST + ']'))
        for (var i = 0; i < hosts.length; i++) hosts[i].remove()
        var style = document.getElementById(STYLE_ID)
        if (style) style.remove()
      }
    }

    /* ------------------------------------------------------------------ */
    /* 右键菜单项（官方插槽 sidebar.right.tab.menu.item）                    */
    /* ------------------------------------------------------------------ */

    /**
     * 菜单打开时读一次现场：目标所在栏的顺序、下标、以及各类要关的 id。
     * 菜单是点开时现渲染的，所以这次 DOM 读取就是「点开那一刻」的真实状态。
     */
    function menuPlan(ctx, tab) {
      var tabId = tab && tab.id !== undefined ? String(tab.id) : ''
      var strip = stripOfTab(ctx, tabId)
      var ids = tabIdsIn(strip)
      var index = ids.indexOf(tabId)
      var sidebar = sidebarOf(ctx)
      return planActions(ids, index, tabKindMap(sidebar))
    }

    /** 菜单里的一行。 */
    function MenuEntry(props) {
      return React.createElement('button', {
        type: 'button',
        role: 'menuitem',
        className: 'dsh-tabtools-menu-item',
        'data-dsh-tab-tools-menu-item': '',
        disabled: props.disabled === true,
        onClick: function (event) {
          event.stopPropagation()
          props.dismiss()
          props.run()
        },
      }, props.label)
    }

    /** 注入到右键菜单末尾的四项；`tab` / `dismiss` 由官方插槽给，ctx 由外层绑定。 */
    function makeTabMenuItems(ctx) {
      return function TabMenuItems(props) {
        var tab = props.tab
        var dismiss = typeof props.dismiss === 'function' ? props.dismiss : function () {}
        var plan = menuPlan(ctx, tab)
        var sidebar = sidebarOf(ctx)
        var entries = [
          { key: 'others', label: t(ctx, 'closeOthers'), ids: plan.others },
          { key: 'left', label: t(ctx, 'closeLeft'), ids: plan.left },
          { key: 'right', label: t(ctx, 'closeRight'), ids: plan.right },
          { key: 'all', label: t(ctx, 'closeAll'), ids: plan.all },
        ]
        return React.createElement(React.Fragment, null, entries.map(function (entry) {
          return React.createElement(MenuEntry, {
            key: entry.key,
            label: entry.label,
            disabled: entry.ids.length === 0,
            dismiss: dismiss,
            run: function () { closeIds(sidebar, entry.ids) },
          })
        }))
      }
    }

    /* ------------------------------------------------------------------ */
    /* cordis 客户端插件                                                    */
    /* ------------------------------------------------------------------ */

    var inject = ['slots', 'sidebarRight']

    function apply(ctx) {
      // 先装按钮：右键菜单那条路万一出问题，也不该把「一键关闭」一起带走。
      ctx.effect(function () { return observe(ctx) }, 'dsh-tab-tools: close-all button')

      // 右键菜单四项：等官方声明出这个插槽后再注册。
      // list 型注册必须带 `id`（官方在插槽声明里把它标成 required），
      // 按 `order` 升序追加在 dockkit 自带的那条「关闭」之后。
      ctx.effect(function () {
        try {
          return ctx.slots.inject('sidebar.right.tab.menu.item', function () {
            return ctx.slots.register({
              name: 'sidebar.right.tab.menu.item',
              id: MENU_ITEM_ID,
              order: MENU_ITEM_ORDER,
            }, makeTabMenuItems(ctx))
          })
        } catch (error) {
          if (ctx.logger && typeof ctx.logger.warn === 'function') {
            ctx.logger.warn('dsh-tab-tools: tab context-menu entries failed to register — ' + String(error && error.message || error))
          }
          throw error
        }
      }, 'dsh-tab-tools: tab context-menu entries')
    }

    exports.inject = inject
    exports.apply = apply
    exports.internals = {
      GUIDE_KIND,
      COPY,
      isClosable,
      filterClosable,
      planActions,
      activeLanguage,
      escapeAttr,
    }

    return module.exports
  },
})
