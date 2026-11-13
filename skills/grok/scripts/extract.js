// 从 grok.com 当前对话页取最后一条回答。执行方式：通过 Safari MCP
// javascript_tool 发过去。调用前先确认回答已写完（见 SKILL.md 的等法）。
// 返回紧凑 JSON 字符串。
(() => {
  const blocks = [...document.querySelectorAll('.response-content-markdown')];
  const last = blocks.length ? blocks[blocks.length - 1] : null;
  const streaming = !!document.querySelector('button[aria-label="Stop"]');
  // "Grok finished responding" 这行字在多轮对话里会一直留着，不能用来判断
  // 当前这条写完了；以 Stop 按钮消失为准。
  const finished = !streaming && blocks.length > 0;
  const srcEls = [...document.querySelectorAll('*')].filter(
    (e) => e.children.length === 0 && /^\d+ sources$/.test((e.innerText || '').trim())
  );
  const srcEl = srcEls.length ? srcEls[srcEls.length - 1] : null;
  const sources = srcEl ? parseInt(srcEl.innerText, 10) : null;
  if (!last) {
    return JSON.stringify({ ok: false, reason: 'no_response', finished, streaming, sources, blocks: blocks.length });
  }
  let answer = last.innerText.trim();
  let truncated = false;
  if (answer.length > 8000) {
    answer = answer.slice(0, 8000);
    truncated = true;
  }
  return JSON.stringify({ ok: true, finished, streaming, sources, blocks: blocks.length, chars: answer.length, truncated, answer });
})();
