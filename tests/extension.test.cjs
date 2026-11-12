const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const extension = path.join(root, 'extension');
const read = file => fs.readFileSync(path.join(extension, file), 'utf8');

test('the packaged engine matches the standalone engine', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const [, builtIn] = html.match(/<script id="rewrite-engine">([\s\S]*?)<\/script>/);
  assert.equal(read('rewrite.js').trim(), builtIn.trim());
});

test('the manifest and popup reference packaged assets only', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions.slice().sort(), ['contextMenus', 'storage']);
  assert.deepEqual(manifest.host_permissions || [], []);
  assert.match(manifest.content_security_policy.extension_pages, /connect-src 'none'/);
  const html = read(manifest.action.default_popup);
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  assert.ok(scripts.length >= 2);
  for (const [, attributes, body] of scripts) {
    assert.match(attributes, /\bsrc="[^"]+"/);
    assert.equal(body.trim(), '');
  }
  assert.doesNotMatch(html, /\son\w+\s*=|\b(?:src|href)="(?:https?:|\/\/|data:)/i);
  for (const [, src] of html.matchAll(/\b(?:src|href)="([^"#]+)"/g)) {
    assert.ok(fs.existsSync(path.join(extension, src)), src);
  }
  for (const [size, file] of Object.entries(manifest.icons)) {
    const png = fs.readFileSync(path.join(extension, file));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(png.readUInt32BE(16), Number(size));
    assert.equal(png.readUInt32BE(20), Number(size));
  }
});

function worker(openPopup) {
  const calls = [];
  const events = {};
  const event = name => ({addListener: handler => { events[name] = handler; }});
  const chrome = {
    action: {openPopup},
    runtime: {
      onInstalled: event('install'),
      getURL: name => 'chrome-extension://logfog/' + name,
    },
    contextMenus: {
      removeAll: callback => { calls.push(['removeAll']); callback(); },
      create: menu => { calls.push(['menu', menu]); },
      onClicked: event('click'),
    },
    storage: {session: {set: async fields => { calls.push(['session', fields]); }}},
    windows: {create: async props => { calls.push(['window', props]); }},
  };
  vm.runInNewContext(read('background.js'), {chrome, console});
  events.install();
  const menu = calls.find(([action]) => action === 'menu')[1];
  assert.equal(menu.contexts.join(','), 'selection');
  const click = (selectionText, menuItemId = menu.id) =>
    events.click({menuItemId, selectionText}, {windowId: 42});
  return {calls, click};
}

test('a selected passage reaches the popup and preserves the existing style', async () => {
  const seen = [];
  const {calls, click} = worker(async ({windowId}) => { seen.push(windowId); });
  await click('工时 2.5h，尚未修复。');
  assert.deepEqual(seen, [42]);
  const fields = calls.find(([kind]) => kind === 'session')[1];
  assert.deepEqual({...fields}, {logfogSource: '工时 2.5h，尚未修复。', logfogVariant: 0});
  assert.ok(!calls.some(([kind]) => kind === 'window'));
  const before = calls.length;
  await click('   ');
  await click('其他', 'unrelated-action');
  assert.equal(calls.length, before);
  assert.deepEqual(seen, [42]);
});

test('the context menu opens an extension window if the toolbar API is unavailable or rejected', async () => {
  for (const opener of [undefined, async () => { throw Error('popup unavailable'); }]) {
    const {calls, click} = worker(opener);
    await click('跟进审批');
    const props = calls.find(([kind]) => kind === 'window')[1];
    assert.equal(props.type, 'popup');
    assert.equal(props.url, 'chrome-extension://logfog/popup.html');
  }
});
