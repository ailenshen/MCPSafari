# Profile 可见性：诊断与第一次修改（2026-11-14）

## 现状（已实测）

- Fork：`ailenshen/MCPSafari`，上游 `Epistates/MCPSafari`，本地
  `~/Documents/Resources/tools/MCPSafari`，分支 `main`，HEAD `13ba540`，
  origin = fork，upstream = 上游。服务端在跑的是上游 0.3.2（Homebrew
  `epistates/tap/mcp-safari-server`），不是 fork 的构建。
- `status` 现在报 2 个 profile：`default`（index 0）和
  `62B2C9FA-35A1-4555-966A-672C5AA1E770`（index 1），bridge 已认证。
- 但 `tabs_context` 返回的 tab 里没有 profile 归属字段（只有 id、url、
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

## 第一次修改：先加可观测性，不改行为

在 fork 上先做、且只做下面这三件，改完用 `swift build && swift test`
  和 Node 测试验证，再决定要不要动扩展：

1. `tabs_context` 的每个 tab 带上 `profileIndex`（服务端本来就有，
   只是没往外报）。
2. `status` 的每个 profile 带上 `tabCount` / `windowCount`。
3. 服务端日志在握手完成时记一行：profileId、index、来源连接数。

有了这三项，下次复查时直接能回答：`62B2C9FA…` 那个 profile 下面
到底有几个窗口、是不是 Truest Lens 品牌窗口；如果它的 tab 数是 0，
那就是扩展实例没连上或没上报 tab，再去查扩展侧。

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
