# CHANGELOG

## 0.1.0 — 2026-10-11

首个版本。给 DSH 官方右侧边栏（`@deepseek-ai/dsh-client-ui-sidebar-right` +
docking kit）加两件事：

- **标签栏「一键关闭」按钮**：插进 `[data-dockkit-strip]`，位于 `+` 之后、
  伸缩空白之前；点击关闭当前面板里全部可关闭的标签；没有可关闭标签时自动隐藏。
- **标签右键菜单四项**：通过官方插槽 `sidebar.right.tab.menu.item` 追加
  关闭其他 / 关闭左侧 / 关闭右侧 / 关闭全部；无对象时置灰。

### 落地过程中踩到并修掉的两个坑

1. **list 型插槽注册必须带 `id`**（官方声明里 required）。第一版只传
   `{ name }`，注册当场抛错，把同一个 `apply()` 里的「一键关闭」也一起带走了
   —— 现象是页面上什么都没有。现在注册带 `id: 'dsh-tab-tools'` + `order: 10`，
   并且先装按钮、后装菜单（菜单那条即使失败也不影响按钮），失败时写 `ctx.logger.warn`。
2. **guide 标签的 id 是常量**，不是每会话唯一：
   `@deepseek-ai/dsh-client-ui-sidebar-right/guide`。第一版用
   `document.querySelector('[data-dockkit-strip] [data-dockkit-tab="…"]')` 找标签栏，
   在多会话同时挂载时命中了别的（hidden）会话的面板，
   实测面板里只显示 1 个标签却算出 `n=11`。现在一律先按
   `ctx.sidebarRight.mounted` 的会话 id 缩到本面板（`panelFor()`）。

### 实机验证（桌面版，pid 67368 窗口，PrintWindow 截图 + 逐像素扫描）

- 按钮出现在标签栏 `+` 与分栏控件之间，样式与 dockkit 自带控件一致；
  只剩「开始」一张时按钮自动消失。
- 点按钮：`[文件, 开始]` → `[开始]`（guide 未被关掉，侧栏保持展开）。
- 右键菜单渲染出 5 行（自带「关闭」+ 我们的 4 项），样式一致；
  置灰的行 opacity .4（用 Pillow 逐行扫最暗像素确认，不是肉眼判断）。
- 关闭规划实测：`[文件, 开始]` 右键第一个标签 →
  `idx=0 n=2 o/l/r/a=0/0/0/1`（guide 已排除、目标在首位 → 只有「关闭全部」可点）；
  只剩 guide 一张时 → `0/0/0/0`，四项全灰。
- `node test-client.mjs` 全部通过。
