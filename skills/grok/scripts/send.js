// 点 grok.com 的 Send 按钮，把 ask.js 填好的问题发出去。执行方式：通过
// Safari MCP javascript_tool 发过去。跑之前先用 wait 等
// button[aria-label="Send"] 出现（填字后界面要一个渲染 tick）。
// 返回紧凑 JSON 字符串。
(() => {
  const send = document.querySelector('button[aria-label="Send"]');
  if (!send) {
    return JSON.stringify({ ok: false, reason: 'no_send_button' });
  }
  if (send.disabled) {
    return JSON.stringify({ ok: false, reason: 'send_disabled' });
  }
  send.click();
  return JSON.stringify({ ok: true, url: location.href });
})();
