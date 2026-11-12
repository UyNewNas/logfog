const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script id="rewrite-engine">([\s\S]*?)<\/script>/)[1];
const context = vm.createContext({});
vm.runInContext(script, context);
const rewrite = context.rewriteEntry;

test('三种风格均能连续给出不同的写法', () => {
  const inputs = [
    '看了下登录接口的报错日志，修了超时问题，补了 2 条回归用例。',
    'Bug #123: foo',
    '计划明天上线，但尚未通过审批。',
    '台账编号：B-37。',
  ];
  for (const input of inputs) {
    const choices = [];
    for (let level = 0; level < 3; level++) {
      for (let variant = 0; variant < 3; variant++) choices.push(rewrite(input, level, variant));
    }
    assert.equal(new Set(choices).size, 9, input);
  }
});

test('时长、数量、失败和计划在各口吻中保留', () => {
  const fixtures = [
    ['排查支付接口 502，耗时 1.5 小时，尚未修复。', ['支付接口', '502', '1.5 小时', '尚未修复']],
    ['核对 12 张发票，其中 2 张未通过，待财务复核。', ['12 张发票', '2 张未通过', '待财务复核']],
    ['仅参加需求评审，未开发、未测试，也未上线。', ['仅参加', '未开发', '未测试', '未上线']],
    ['与销售确认 Q3 报价，预计下周五提交。', ['Q3', '预计下周五提交']],
    ['检查 `src/api_v2.js?x=1&y=2`，尚未定位原因。', ['`src/api_v2.js?x=1&y=2`', '尚未定位原因']],
    ['整理会议纪要\n跟进合同盖章', ['会议纪要','合同盖章','\n']],
  ];
  for (const [input, facts] of fixtures) {
    for (let level = 0; level < 3; level++) {
      for (let variant = 0; variant < 3; variant++) {
        const result = rewrite(input, level, variant);
        for (const fact of facts) assert.ok(result.includes(fact), result);
      }
    }
  }
});

test('空白输入不生成描述', () => {
  assert.equal(rewrite('  \n  ', 1, 2), '');
});

test('单文件页面不引用外部样式或脚本，交互控件 ID 唯一', () => {
  assert.match(html, /connect-src 'none'/);
  assert.doesNotMatch(html, /<(?:script|img)\b[^>]*\bsrc=|<link\b[^>]*\bhref=|@import\s/i);
  const ids = [...html.slice(0,html.indexOf('<script')).matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
});
