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

## 换生产（2026-11-14 02:18）

### 链路（实测）

- VM client → `https://mcps.aisj.eu.org`（Aisj 托管网关，api key 在 URL path）
  → frps `152.69.207.20:3103` → Mac frpc 的 `mcp-safari` 代理
  （plugin `mcp_stdio`，command `/opt/homebrew/bin/mcp-safari --port 8089`，
  `idleTimeoutSeconds = 0` 永不 idle 回收）→ frpc 拉起服务端进程
  （所以 frpc 是 mcp-safari 的父进程）→ WebSocket bridge
  `127.0.0.1:8089` → 各 profile 的扩展实例。
- SSH 是另一条 FRP 路（STCP `mac-ssh`，VM visitor 127.0.0.1:2222 → Mac 22），
  与 MCP 路径无关。VM 侧 visitor 配置里只有这一个 visitor。
- Mac frpc 由 LaunchAgent `com.ailenshen.frp-frpc` 托管（KeepAlive、
  RunAtLoad），重启前 PID 879，重启后 48895；其他代理（apple-notes-mcp
  3101、filesystem-mcp 3102、mirroir-mcp STCP 3000）同在该 frpc 里，
  重启时一起断、一起回。

### 直接换 main 不可行，改走回 port

- fork main 是 0.4.0，`bridgeProtocolVersion = 2`（`304543b` 互认证握手），
  而装着的 0.3.2 扩展是协议 1，握手会被拒——只换服务端会把 MCP
  直接换断。扩展要升到 2 需要 Xcode 重新构建，Mac 上现在没装。
- 改走回 port：分支 `ailen/protocol1-tabhandles` = `v0.3.2` + `#95`
  （`db1c63f`），协议仍是 1；CHANGELOG 只取 `#95` 的部分，去掉
  `#94` 的条目（`#94` 的代码没要）。`swift build -c release` 通过
  （51 秒），版本仍报 0.3.2。

### 换法

- 二进制拷到 `bin/mcp-safari-fork`（稳定路径，不依赖 `.build`）。
- `frpc.toml` 备份 `frpc.toml.bak-20261114-0218`，只改 plugin command
  一行（diff 确认一行）；`frpc verify` 先行通过；fork 二进制在
  8090 上 smoke 通过（能起、能监听、版本 0.3.2）。
- detached 脚本执行：先停旧服务，再 kill frpc（launchd 自动拉起），
  SSH 会断一次，脚本在 Mac 本地跑完（日志 `/tmp/mcpsafari-swap.log`）。
  冒烟留下的 8090 token 文件已删，tokens 目录现在只有 8089。

### 验证结果

- `status`：bridge authenticated，协议 1，2 个 profile 带
  `handle` / `selected`：p0 = `62B2C9FA…`（selected false），
  p1 = `default`（selected true）。
- `tabs_context`：34 个 tab 全部是 `pXtY` 句柄——p0 是 Truest Lens
  profile（1 个窗口 72192，13 个 tab：rednote、Creator Center、
  真镜 TruestLens 的抖音、抖音创作者中心、Bilibili、视频号助手、
  公众号等，全是品牌号页面）；p1 是 Ailen 个人 profile
  （4 个窗口，21 个 tab）。唯一重复是置顶 X 标签 `p1t67` 在 4 个
  窗口各出现一次，是置顶标签的正常行为，不是归属 bug。
- 对照：p1 的 GitHub、小红书 explore 都能 `read_page` 读到正文。

### 待查：p0 的 tab 读不到

- `read_page` 在 p0 的 3 个 tab（Creator Center、Bilibili、rednote 搜索）
  上都报 `Cannot inject content scripts into this tab`。对照组 p1
  同站能读，所以不是 fork 服务端的问题，是 p0 的扩展实例注不进脚本。
- 可能原因：（a）Truest Lens profile 里扩展的网站访问没开
  “始终允许用于所有网站”；（b）这些 tab 自 Safari 重启后没被点开过、
  处于未加载状态。
- 下一步：Ailen 方便时，在 Truest Lens profile 的 Safari 设置里检查
  MCPSafari 的网站访问；或让我对一个 p0 tab 做 `select_tab` 再读
  （会切他的 Safari 前台标签，所以要等他方便时再测）。

## 升级到 0.4.0（2026-11-14 03:00–03:20，Ailen 决定：不要新分支，直接升级扩展）

- 回 port 分支 `ailen/protocol1-tabhandles` 是临时生产状态，已在验证通过后删除（本地 + 远端）。
- Xcode 27.2（Build 27B52）：Ailen 用 `mas install 497799835` 自装；又跑了 `sudo xcodebuild -license` 和 `sudo xcodebuild -runFirstLaunch`（装 CoreSimulator 等首次启动组件）。Mac 上 0 个有效签名身份，扩展走免签（ad-hoc）+ Safari Develop → Allow Unsigned Extensions。
- 扩展：fork main（`ailen/site-skills`，基于 main 13ba540）Release 编成功，`/Applications/MCPSafari.app` 换成 0.4.0（旧 0.3.2 备份在 fork `bin/MCPSafari-0.3.2.app`）；pluginkit 注册确认 `com.epistates.MCPSafari.Extension(0.4.0)`，`BRIDGE_PROTOCOL_VERSION = 2`。
- 服务端：`bin/mcp-safari-main-0.4.0`（main Release 构建，`--version` 0.4.0）；frpc.toml 只改 `mcp-safari` plugin 的 command 一行（备份 `.bak-20261114-0303`），frpc 重启后新服务端在跑（协议 2，监听 8089）。
- Safari 侧：扩展设置里同名出现 3 条是按 profile 各列一条（3 个 profile：DefaultProfile + 2 个 UUID，其中一个几乎是空的）；工具栏一个窗口只显示一个入口，正常。Ailen 在 Personal 和 Truest Lens 两个 profile 里启用并点了 Always Allow on Every Website。
- 验证：bridge authenticated，服务端 + 扩展都是 0.4.0、协议 2，两个 profile 连上。`read_page` 在 p1（GitHub poki 仓库、抖音精选）成功。p0（Truest Lens）用 `javascript_tool` 在 Google 搜 boss 的 tab 上读到正文，注入没问题；`read_page`/`snapshot` 在这个 Google 搜索页上连报 `reply_lost`（page went away），是这个页面/操作组合的问题，不是权限问题——同页用 `javascript_tool` 取 `innerText` 正常。重启后未加载的 tab 读会报 `tab_not_loaded`，要 `select_tab` 切过去加载再读。另注意：p0 的 profile id 变了（62B2C9FA… → E45C0A0C-2661-4C2C-867E-883ED054CADA），认 profile 以 tab 内容为准，不要只认 p0/p1。
- 结论：p0 读不到的旧问题根因就是网站访问授权没开（0.4.0 的 `tabs_context` 会直接报 `access: not_granted`，旧版只报注入失败）。升级完成，生产跑 main 0.4.0，不再维护回 port 分支。
