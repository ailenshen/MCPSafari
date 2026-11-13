// 把问题填进 grok.com 的输入框（只填，不发送）。执行方式：通过 Safari MCP
// javascript_tool 把整段代码发过去；先把 __QUESTION_JSON__ 换成
// JSON.stringify(question)。返回紧凑 JSON 字符串。
// 注意：填完字后 Grok 的界面要一个渲染 tick 才出现 Send 按钮，所以这一步
// 不点发送；下一步用 wait 等 button[aria-label="Send"] 出现，再跑 send.js。
(() => {
  const QUESTION = __QUESTION_JSON__;
  const ed = document.querySelector('[contenteditable="true"][aria-label="Message Grok"]');
  if (!ed) {
    return JSON.stringify({ ok: false, reason: 'no_composer', hint: 'no Message Grok editor; page may not be loaded or user is logged out' });
  }
  ed.focus();
  document.execCommand('selectAll', false, null);
  const inserted = document.execCommand('insertText', false, QUESTION);
  if (!inserted || !ed.innerText.includes(QUESTION.slice(0, 20))) {
    return JSON.stringify({ ok: false, reason: 'insert_failed' });
  }
  return JSON.stringify({ ok: true, staged: QUESTION.slice(0, 80) });
})();
