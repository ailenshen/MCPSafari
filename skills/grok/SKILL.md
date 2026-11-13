# Grok skill

在 grok.com 问 Grok（查 X 社区近三个月讨论、找流行方案时用），取回回答正文。

## 入口

- 网址：`https://grok.com/`，Ailen 个人 profile（MCP p1，默认选中那个）。
- 新开一个 tab（`tabs_create`，`url` 用 `https://grok.com/`），不要动他现有的 tab。
- 登录态：侧边栏能看到 `Ailen Shen` 就是已登录；找不到输入框时先看登录，不要反复试。

## 提问（三步）

1. 把 `scripts/ask.js` 里的 `__QUESTION_JSON__` 换成 `JSON.stringify(问题)`，通过 `javascript_tool` 发到 Grok tab。返回 `{ok:true, staged}` 说明字已填好（这一步不点发送）。
2. 用 `wait` 等 `button[aria-label="Send"]` 出现（超时 10 秒）。填字后界面要一个渲染 tick 才出发送按钮，同一次 JS 里等不到。
3. 跑 `scripts/send.js` 点发送，返回 `{ok:true}`。
4. 等回答写完：不要只等 `Grok finished responding` 那行字——多轮对话里它会一直留着。正确等法是反复跑 `extract.js`，直到 `streaming:false`（Stop 按钮消失）且 `chars` 两次不变。新开的 tab 里第一问可以直接用 `wait` 等那行字。

## 取回答

跑 `scripts/extract.js`，返回 `{ok, finished, streaming, sources, answer}`：

- `answer` 是最后一条回答的正文（超过 8000 字会截断，`truncated:true`）。
- `sources` 是回答引用的来源数（没有就是 `null`）。
- `finished:false` 说明还在写，等一会儿再跑一次。

## 验证

- 最后验证：2026-11-14。扩展 / 服务端：MCPSafari 0.4.0（协议 2）。
- 实测通过：问“最近 X 上讨论最多的 3 个 AI 出图工具”，拿到回答，38 个来源；新开 tab 又问 Nano Banana 的用途，3 行完整回答，17 个来源。注意：同一 tab 里追问时有一次回答中途断在 118 字（Grok 自己停的，不是 skill 问题），重开 tab 再问就完整了；所以一问最好一 tab。

## 失败特征

- `no_composer`：页面没加载完或没登录。刷新一次再看，登录掉了就告诉 Ailen。
- `no_send_button` / `send_disabled`：Grok 改版了，发送按钮换了名或逻辑，重新探 DOM 再修脚本。
- `no_response`：回答容器 `.response-content-markdown` 找不到了，同样是改版信号。
- `read_page` 在个别页（如 Google 搜索页）上会报 `reply_lost`，不是权限问题，改用 `javascript_tool` 读 `innerText`。
- 只读提问。不要用这个 skill 发帖、评论或点赞，写操作要 Ailen 先确认。
