(() => {
  'use strict';

  const el = id => document.getElementById(id);
  const source = el('source');
  const result = el('result-text');
  const styles = Array.from(document.querySelectorAll('input[name="style"]'));
  const storage = globalThis.chrome?.storage?.session;
  const touched = new Set();
  const keys = ['logfogSource', 'logfogLevel', 'logfogVariant'];
  const example = '看了下登录接口的报错日志，修了超时问题，补了 2 条回归用例。';
  const mac = /Mac|iPad|iPhone/.test(navigator.platform);
  let variant = null;
  let copyTimer;

  function currentLevel() {
    return Number(styles.find(radio => radio.checked).value);
  }

  async function persist(fields) {
    Object.keys(fields).forEach(key => touched.add(key));
    if (!storage) return;
    // Submit every edit immediately so closing the popup cannot discard a pending debounce.
    try {
      await storage.set(fields);
    } catch {
      el('notice').textContent = '草稿暂时无法保存，关闭弹窗前可先复制文字。';
    }
  }

  function renderSource() {
    const hasText = source.value.length > 0;
    el('count').textContent = Array.from(source.value).length + ' 字';
    el('sample').hidden = hasText;
    el('clear').hidden = !hasText;
    el('clear').disabled = !hasText;
    el('generate').disabled = !source.value.trim();
  }

  function renderResult() {
    clearTimeout(copyTimer);
    el('copy-label').textContent = '复制结果';
    el('notice').textContent = '';
    const ready = variant !== null && Boolean(source.value.trim());
    const message = source.value.trim() ? '点击「生成描述」，查看改写结果。' : '改写后的描述会显示在这里。';
    const text = ready ? globalThis.rewriteEntry(source.value, currentLevel(), variant) : message;
    if (result.textContent !== text) result.textContent = text;
    result.classList.toggle('empty', !ready);
    result.tabIndex = ready ? 0 : -1;
    result.scrollTop = 0;
    el('variant').textContent = ready ? (variant + 1) + ' / 3' : '';
    el('alternate').disabled = !ready;
    el('copy').disabled = !ready;
  }

  function updateDraft() {
    variant = null;
    renderSource();
    renderResult();
    persist({logfogSource: source.value, logfogVariant: null});
  }

  function generate(next = false) {
    if (!source.value.trim()) return;
    variant = next && variant !== null ? (variant + 1) % 3 : 0;
    renderResult();
    persist({logfogSource: source.value, logfogLevel: currentLevel(), logfogVariant: variant});
  }

  source.addEventListener('input', updateDraft);
  el('clear').addEventListener('click', () => {
    source.value = '';
    updateDraft();
    source.focus();
  });
  el('sample').addEventListener('click', () => {
    source.value = example;
    renderSource();
    generate();
    source.focus();
    source.setSelectionRange(source.value.length, source.value.length);
  });
  styles.forEach(radio => radio.addEventListener('change', () => {
    if (variant !== null) variant = 0;
    renderResult();
    persist({logfogLevel: currentLevel(), logfogVariant: variant});
  }));
  el('generate').addEventListener('click', () => generate(true));
  el('alternate').addEventListener('click', () => generate(true));
  document.addEventListener('keydown', event => {
    if (event.isComposing || event.repeat || event.key !== 'Enter' || !(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    generate(true);
  });
  if (mac) el('shortcut').textContent = '⌘ ↵';

  function fallbackCopy(content) {
    const buffer = document.createElement('textarea');
    buffer.className = 'clipboard-buffer';
    buffer.value = content;
    buffer.readOnly = true;
    document.body.append(buffer);
    buffer.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      buffer.remove();
      el('copy').focus();
    }
  }

  el('copy').addEventListener('click', async () => {
    const content = result.textContent;
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      if (variant === null || result.textContent !== content) return;
      if (!fallbackCopy(content)) {
        const range = document.createRange();
        range.selectNodeContents(result);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        el('notice').textContent = '已选中结果，请按 ' + (mac ? '⌘+C' : 'Ctrl+C') + ' 复制。';
        return;
      }
    }
    if (variant === null || result.textContent !== content) return;
    el('copy-label').textContent = '已复制';
    el('notice').textContent = '';
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      el('copy-label').textContent = '复制结果';
      el('notice').textContent = '';
    }, 1800);
  });

  async function restore() {
    if (!storage) return;
    try {
      const saved = await storage.get(keys);
      // A read can finish after typing, changing tone, or clicking the example.
      // Merge only fields that the current popup hasn't already edited.
      if (!touched.has('logfogSource') && typeof saved.logfogSource === 'string') {
        source.value = saved.logfogSource;
      }
      if (!touched.has('logfogLevel') && Number.isInteger(saved.logfogLevel) && styles[saved.logfogLevel]) {
        styles[saved.logfogLevel].checked = true;
      }
      if (!touched.has('logfogVariant') && source.value.trim() &&
          Number.isInteger(saved.logfogVariant) && saved.logfogVariant >= 0 && saved.logfogVariant < 3) {
        variant = saved.logfogVariant;
      }
      renderSource();
      renderResult();
    } catch {
      // The current popup can still rewrite text when session storage is unavailable.
    }
  }

  renderSource();
  renderResult();
  restore();
})();
