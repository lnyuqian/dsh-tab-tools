# dsh-tab-tools

> 仓库：<https://github.com/lnyuqian/dsh-tab-tools>
>
> 一句话：**DSH 右侧栏标签工具** —— 标签栏加「一键关闭」按钮，标签右键菜单加四项关闭。

DSH（DeepSeek Harness）**右侧边栏标签工具**：给官方右侧边栏加一个「一键关闭」按钮，
并给标签右键菜单补上四项相对关闭。web 版 / 桌面版通用。

用户需求原文（2026-10-11）：

> 右侧栏每次打开很多链接或文件时，一个个关很麻烦。做一个一键关闭的按钮，
> 和右键点击标签弹出关闭左侧或右侧标签的选项。

## 它做什么

1. **标签栏上的「一键关闭」按钮**（每个标签栏一个，28×28，和「分栏 / 全屏 / 收起」同款样式）：
   点击 = 关掉**当前面板里全部可关闭的标签**（保留「开始」guide 页）。
   位置在标签栏自己的 `+` 之后、伸缩空白之前；没有可关闭的标签时自动隐藏。
2. **标签右键菜单追加四项**（挂在官方插槽 `sidebar.right.tab.menu.item` 上，
   排在 dockkit 自带的「关闭」之后）：
   - 关闭其他标签
   - 关闭左侧标签
   - 关闭右侧标签
   - 关闭全部标签

   各项在无对象时显示为置灰不可点。

## 关闭语义（重要）

- **只动当前在屏会话的那一块面板**：所有查找都先按
  `ctx.sidebarRight.mounted` 的会话 id 缩到本面板；不会跨会话关标签。
- **「开始」guide 标签永不参与关闭**：它是侧栏入口页，不是打开的文件。
  （判据来自 `ctx.sidebarRight.tabsIn(sessionId)` 里的 `kind === 'guide'`。）
- **真正的关闭交给官方接口** `ctx.sidebarRight.close(tabId)`：能不能关由它判断，
  关掉最后一张停靠标签时它自己会把侧栏收起来。
- 关闭是**同步逐张**进行的；一张已经消失的标签会被跳过，不影响其余的关闭。

## 实现要点（为什么一半插槽、一半 DOM 注入）

- **右键菜单走官方插槽**：dockkit 的标签菜单把 `renderTabMenuItems` 透传给
  `sidebar.right.tab.menu.item`（list 型，owner props = `{ tab, dismiss }`），
  注册进去即可，不必碰别人的 DOM。**list 型注册必须带 `id`**（官方声明里 `id` 是
  required），少了会当场抛错。
- **标签栏本身没有任何插槽**（它的 chrome 被 sidebar-right 硬编码成全屏 + 收起两个按钮），
  所以「一键关闭」只能把自己的节点插进 `[data-dockkit-strip]`：插在 React 自己的
  子节点 `[data-dockkit-strip-fill]` 之前，React 的插入/删除都用真实 DOM 引用，
  互不干扰。
- **guide 标签的 id 是常量**（`@deepseek-ai/dsh-client-ui-sidebar-right/guide`），
  每个会话的面板里都有一个同 id 的标签；同一时刻文档里可能挂着多个会话的面板
  （非当前会话的标了 `hidden`）。因此**不能全文档查这个 id**，否则会命中别的会话的面板
  （踩过：面板里只显示 1 个标签，算出来却是 n=11）。代码里 `panelFor()` 就是这道防线。
- 按钮是纯 DOM（不依赖 react-dom）：插进别人的 flex 行里不会有额外包装层，
  样式沿用 dockkit 的 `addTab` / `iconButton` / `menuItem` 取值，只换成我们自己的选择器，
  颜色全部走主题变量，深浅色主题自动跟随。

## 安装 / 卸载

桌面版（当前正在运行的 profile 是 `desktop`）：

```powershell
# 应用已退出时（推荐脚本路径）
pwsh -File .\install-desktop.ps1            # link:<仓库路径>，改代码即生效
pwsh -File .\install-desktop.ps1 -Uninstall
```

应用**正在运行**时，用应用内的插件管理（设置 → 插件）安装本地目录，或让 DSH 助手用
plugin_manager 工具启用；本插件实际就是这样装上的：

```
# 1) 先把包放进 profile 能解析到的位置（link / junction）
# 2) 再让插件管理器启用这个 bundle（会现场重组，不需要重启）
plugin_manager set_bundle { target: "dsh-tab-tools", enabled: true }
```

装好后 profile 的 `package.json` 里应当有：

```json
"dependencies": { "dsh-tab-tools": "link:D:/dsh-web/插件技能安装/dsh-tab-tools" },
"dsh": { "profile": { "bundles": [ "...", "dsh-tab-tools" ] } }
```

## 自检

```bash
node --check lib/index.js && node --check lib/client.js
node test-client.mjs
```

`test-client.mjs` 完全按浏览器模块加载器的路径执行客户端半边
（`window.__ModuleLoader__.load` + 只认 react 的 require），覆盖 cordis 契约、
插槽注册项（含必需的 `id`）、四行菜单的渲染与 `dismiss`、以及关闭规划的纯逻辑
（guide 保护、左/右/其他/全部的划分、目标消失时的兜底）。

## 已知边界

- 「关闭左侧 / 右侧」以**同一个标签栏内的显示顺序**为准；只关闭**本面板**内的标签。
- 关闭后如果只剩「开始」一张，侧栏保持展开；如果连最后一张停靠标签都被关掉
  （只能是不含 guide 的情况），官方会顺势把侧栏收起。
- 相对关闭项点击后菜单会立即关闭（官方插槽的硬要求：动完必须 `dismiss()`）。
