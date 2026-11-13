# 网站 Skill：一个站一个 skill

这是 fork（`ailenshen/MCPSafari`）里网站 skill 的家。
Skill 和它要驱动的 Safari MCP 服务端/扩展放在同一个仓库里，
改了服务端或扩展的协议，skill 一起改、一起测，不会出现两边对不上的情况。

## 布局

```
skills/
  README.md            # 本文件：约定
  grok/
    SKILL.md           # 怎么问 Grok：入口、登录检查、提问、取回答
    scripts/ask.js     # 在页面里执行的 JS：只返回紧凑 JSON，不回整页
    scripts/extract.js # 从回答页抽正文、来源数
  xiaohongshu/
    SKILL.md
    scripts/search.js  # 站内搜关键词，返回前 N 条的标题/链接/点赞收藏
    scripts/profile.js # 主页粉丝数、置顶帖
  <site>/
    SKILL.md
    scripts/*.js
```

一个站一个目录。`SKILL.md` 只写入口、登录态检查、步骤和失败特征；
真正的抽取逻辑放在 `scripts/*.js`，执行时通过 `javascript_tool` / `run_steps`
传进去。`SKILL.md` 本身保持短，加载时不占 token。

## 维护规则

- 每个 skill 写明：最后验证日期、验证时的扩展/服务端版本、已知失败特征。
- 网站改版、选择器失效时，修 `scripts/*.js`，改验证日期，跑一次实测再提交。
  不要每次重新探索、重新猜选择器。
- 返回值一律是紧凑 JSON：只要任务需要的字段（粉丝数、点赞收藏数、前 N 条链接），
  不要整页快照。省 token 的关键就在这里。
- 只读操作（搜、读数）和写操作（发帖、点赞、评论）分开写。
  写操作必须经过 Ailen 确认才执行，skill 里不预设自动发送。

## Profile 的两条路

- 两个 profile 都走 MCP（0.4.0 起，服务端 + 扩展都能看到两个 profile，见
  `docs/ailen-profile-visibility.md`）。用 tab 句柄 `pXtY` 区分 profile，
  认 profile 以 tab 内容为准，不要只认 p0/p1（profile index 是每次服务端
  启动时的连接顺序）。
- AppleScript `do JavaScript` 只是备用路（备忘在 Mac
  `~/Documents/Resources/tools/aisj-safari/AppleScript-Safari备忘.md`）。
  不要把两套窗口编号混用（MCP 的 windowId 和 AppleScript 的 window id 是两套编号）。
