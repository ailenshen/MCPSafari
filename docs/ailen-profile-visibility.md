# Profile 可见性：诊断与第一次修改（2026-11-14）

## 现状（已实测）

- Fork：`ailenshen/MCPSafari`，上游 `Epistates/MCPSafari`，本地
  `~/Documents/Resources/tools/MCPSafari`，分支 `main`，HEAD `13ba540`，
  origin = fork，upstream = 上游。服务端在跑的是上游 0.3.2（Homebrew
  `epistates/tap/mcp-safari-server`），不是 fork 的构建。
- `status` 现在报 2 个 profile：`default`（index 0）和
  `62B2C9FA-35A1-4555-966A-672C5AA1E770`（index 1），bridge 已认证。
- 但正在跑的 0.3.2 的 `tabs_context` 返回的 tab 里没有 profile 归属字段（只有 id、url、
  title、windowId），所以无法从 MCP 的输出判断哪个窗口属于哪个 profile。
  这就是 2026-11-07 的卡点一直没法用纯 MCP 数据定位的原因：
  真正的 Truest Lens profile 窗口（当时 AppleScript id 18357）在 MCP 里
  一个标签都看不到，而 status 又确实显示 2 个 profile 已连接。

## 代码里的 profile 机制（读 fork 源码确认）

- Safari 每个 profile 跑一个独立的扩展实例，各自有自己的 background 页，
  都读同一批 token 文件去连服务端。
- 身份来自 `SFExtensionProfileKey`：native 侧
  `SafariWebExtensionHandler.swift` 读出 UUID，经 `TokenStore.response`
  以 `profile` 字段回给 background（`background.js:251` 附近），
  background 把它记为 `profileId`，握手时在 hello 帧里发给服务端
  （`background-bridge.js` 的 `socket.onopen`）。
  Safari 没给这个 key 时（默认 profile）回落为 `"default"`。
- 服务端按 `profileId` 登记连接，给每个 profile 一个 index，
  tab 句柄是 `p<profileIndex>t<tabId>` 的形式（`TabHandle.swift`）。
- 兜底逻辑：如果两个实例握手时身份相同，服务端会把先连上的当重复连接
  踢掉（`background-state.js` 注释、ProfileConnectionTests）。
  所以“第 3 个 profile 连不上”的一种可能，是它的身份在某一环丢成了
  `"default"`，和已有连接撞了；另一种可能是该 profile 的扩展实例根本
  没发起连接。两者在现有 `status` 输出里看不出来。

## 更正（2026-11-14 02:0x，读源码后）：归属信息 fork main 里已经有了

上面“`tabs_context` 不带 profile 归属”的说法只对正在跑的 0.3.2 成立，
对 fork 的 main 不成立，特此更正：

- 上游 `#95`（`db1c63f`，2026-09-14，0.3.2 打包之后才合入）已经做了
  tab 句柄：`tabs_context` 向每个已连接 profile 广播 `tabs_query`，
  再由 `mergedTabListing` 把每个 tab 的 id 改写成 `p<profileIndex>t<tabId>`
  的形式（如 `p0t67`），重复的 tab 不再混在一起；`select_tab` /
  `tabs_create` 也返回句柄，裸数字 tabId 会被拒绝并提示新形式。
- `#95` 只改了服务端 Swift + 测试 + 文档，没有改扩展文件，所以
  0.3.2 的扩展（协议版本同为 1）理论上能直接配合新服务端工作。
- `ProfileStatus` 在 main 里也已经有 `handle`（`p<index>` 前缀）和
  `selected` 字段，0.3.2 的 `status` 输出里还没有这两项。

所以“第一次修改”不再是给 tab 加 profileIndex——那已经有了。
真正的下一步是**跑起来验证**：用 fork main 编出的服务端（`swift build`
已通过）去连一次扩展，看 `tabs_context` 回来的 tab 是不是
`pXtY` 句柄、两个 profile 的窗口能不能分清，从而确定
`62B2C9FA…` 是不是 Truest Lens profile。

## 第一次验证（代替原来的“第一次修改”）

1. 先隔离跑：fork 服务端起在另一个端口（如 8090），不碰正在跑的
   8089；扩展会按 token 文件发现它并多连一个（多连接是它本来就
   支持的状态），再用一个 stdio MCP 客户端在 Mac 本地对它调
   `status` / `tabs_context`，核对句柄形式和每 profile 的窗口。
2. 隔离验证通过后，再决定是否把生产服务（现在是 PID 46159，
   2:03 启动的 `/opt/homebrew/bin/mcp-safari --port 8089`，没有
   launchd 配置，是手动起的进程）换成 fork 的构建。换之前要 Ailen
   点头，因为要停一下正在用的服务，扩展随后会重连。
3. 只有隔离验证证明句柄还不够（比如 Truest Lens profile 的扩展实例
   根本没连上、某个 profile 的 `tabs_query` 一直 unreachable），
   才需要再写新代码；那时再按下面的“可观测性”思路补
   （status 里每 profile 的 tab/window 数、握手日志）。

## 上游相关分支（看过，不直接用）

- `upstream/fix/profile-bookkeeping`：和 `main` 的 diff 有 156 个文件、
  约 2.5 万行删除，分支基底已偏离 `main`，不是一个能直接 cherry-pick
  的小修，不采用；只参考它“每个 profile 各自报版本”的思路。
- `upstream/fix/connection-identity`、`fix/bridge-lifecycle` 等分支同理，
  先不动，等可观测性到位、根因定位后再决定跟不跟上游。

## 约束

- 改服务端只需要 Swift 工具链（Mac 上 Swift 6.4.2 已有，`swift build`
  可跑）；改扩展要 Xcode，Mac 上现在没装 Xcode（`/Applications` 里没有，
  `xcode-select` 指向 CommandLineTools），扩展侧的改动要先解决 Xcode
  再动手。
- 不要用 fork 的构建替换正在跑的 0.3.2 服务，除非先在别的端口、
  用 `MCP_SAFARI_TOKEN_ROOT` 隔离跑通（见 `docs/development.md`），
  否则测试会误触正在用的真浏览器。
- Grok 试点 skill（`skills/grok/`）先行：页面简单、已在 Safari 里问通过，
  跑通“建、测、坏、修”循环后再扩到小红书。
