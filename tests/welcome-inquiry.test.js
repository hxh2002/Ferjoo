import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { submitWelcomeInquiry, welcomeInquiryPayload } from '../src/services/welcome-inquiry.service.js';

const sql = readFileSync(new URL('../supabase/migrations/034_welcome_inquiries.sql', import.meta.url), 'utf8');
assert.match(sql, /create table public\.welcome_inquiries/);
assert.match(sql, /kind in \('stay', 'contact'\)/);
assert.match(sql, /enable row level security/);
assert.match(sql, /grant select on public\.welcome_inquiries to authenticated/);
assert.match(sql, /welcome_inquiries_select_admin/);
assert.match(sql, /using \(private\.is_admin\(\)\)/);
assert.match(sql, /security definer/);
assert.match(sql, /grant execute on function public\.submit_welcome_inquiry\(text, text, text, text\) to anon, authenticated/);
assert.doesNotMatch(sql, /grant\s+(insert|select|update|delete|all)[^;]*to anon/i);
assert.doesNotMatch(sql, /for insert|for update|for delete/);
assert.doesNotMatch(sql, /user_feedback/);

assert.deepEqual(welcomeInquiryPayload({ kind: 'stay', email: '  ada@example.com  ', name: 'Ada', message: 'hi' }), {
  kind: 'stay',
  email: 'ada@example.com',
  name: null,
  message: null
});
assert.deepEqual(welcomeInquiryPayload({ kind: 'contact', email: 'ada@example.com', name: '  Ada  ', message: '  Hello  ' }), {
  kind: 'contact',
  email: 'ada@example.com',
  name: 'Ada',
  message: 'Hello'
});
assert.throws(() => welcomeInquiryPayload({ kind: 'stay', email: '   ' }), /Enter your email address/);
assert.throws(() => welcomeInquiryPayload({ kind: 'stay', email: 'ada@example' }), /Enter a valid email address/);
assert.throws(() => welcomeInquiryPayload({ kind: 'contact', email: 'ada@example.com', name: ' ', message: 'Hello' }), /Enter your name/);
assert.throws(() => welcomeInquiryPayload({ kind: 'contact', email: 'ada@example.com', name: 'Ada', message: ' ' }), /Enter a message/);
assert.throws(() => welcomeInquiryPayload({ kind: 'contact', email: 'ada@example.com', name: 'A'.repeat(81), message: 'Hello' }), /Enter a shorter name/);
assert.throws(() => welcomeInquiryPayload({ kind: 'contact', email: 'ada@example.com', name: 'Ada', message: 'M'.repeat(2001) }), /Enter a shorter message/);
assert.throws(() => welcomeInquiryPayload({ kind: 'other', email: 'ada@example.com' }), /Choose a form/);

function client({ id = 'inquiry-1', error = null, calls = [] } = {}) {
  return {
    rpc(name, args) {
      calls.push([name, args]);
      return Promise.resolve({ data: error ? null : id, error });
    }
  };
}

const savedCalls = [];
const saved = await submitWelcomeInquiry({
  kind: 'contact',
  email: 'ada@example.com',
  name: 'Ada',
  message: 'A question about the jar.'
}, client({ calls: savedCalls }));
assert.deepEqual(saved, { id: 'inquiry-1' });
assert.deepEqual(savedCalls, [['submit_welcome_inquiry', {
  p_kind: 'contact',
  p_email: 'ada@example.com',
  p_name: 'Ada',
  p_message: 'A question about the jar.'
}]]);

const skipped = [];
await assert.rejects(
  submitWelcomeInquiry({ kind: 'stay', email: ' ' }, client({ calls: skipped })),
  /Enter your email address/
);
assert.deepEqual(skipped, []);

const stayCalls = [];
const stay = await submitWelcomeInquiry({ kind: 'stay', email: 'ada@example.com', message: 'ignore' }, client({ calls: stayCalls, id: 'stay-1' }));
assert.deepEqual(stay, { id: 'stay-1' });
assert.equal(stayCalls[0][1].p_name, null);
assert.equal(stayCalls[0][1].p_message, null);

await assert.rejects(
  submitWelcomeInquiry({ kind: 'stay', email: 'ada@example.com' }, client({ error: { message: 'permission denied' } })),
  /This page could not save that email/
);
await assert.rejects(
  submitWelcomeInquiry({ kind: 'contact', email: 'ada@example.com', name: 'Ada', message: 'Hi' }, client({ id: null, error: { message: 'NAME_REQUIRED' } })),
  /Enter your name/
);
await assert.rejects(
  submitWelcomeInquiry({ kind: 'stay', email: 'ada@example.com' }, client({ id: null })),
  /This page could not save that email/
);
await assert.rejects(
  submitWelcomeInquiry({ kind: 'contact', email: 'ada@example.com', name: 'Ada', message: 'Hi' }, client({ error: { message: 'permission denied' } })),
  /This page could not save that message/
);
await assert.rejects(
  submitWelcomeInquiry({ kind: 'stay', email: 'ada@example.com' }, null),
  /This page cannot save emails right now/
);
await assert.rejects(
  submitWelcomeInquiry({ kind: 'contact', email: 'ada@example.com', name: 'Ada', message: 'Hi' }, null),
  /This page cannot save messages right now/
);

const view = readFileSync(new URL('../src/views/WelcomeView.vue', import.meta.url), 'utf8');
assert.match(view, /submitWelcomeInquiry/);
assert.doesNotMatch(view, /from ['"][^'"]*supabase|createClient|fetch\(/);
assert.match(view, /Received\. Your email has been saved\./);
assert.match(view, /Received\. Your message has been saved\./);
assert.doesNotMatch(view, /Checked\. This page does not send/);
assert.doesNotMatch(view, /we will (email|reply)|we'll (email|reply)/i);

function functionBody(source, signature) {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, signature);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`unterminated ${signature}`);
}

for (const [signature, flag] of [['async function submitStay', 'stayDone'], ['async function submitContact', 'contactDone']]) {
  const body = functionBody(view, signature);
  const awaited = body.indexOf('await submitWelcomeInquiry');
  const confirmed = body.indexOf('if (!saved?.id)');
  const done = body.indexOf(`${flag}.value = true`);
  assert.ok(awaited > 0 && confirmed > awaited && done > confirmed, `${signature} confirms the saved id before success`);
}

const admin = readFileSync(new URL('../src/services/admin.service.js', import.meta.url), 'utf8');
const care = readFileSync(new URL('../src/views/admin/AdminCare.vue', import.meta.url), 'utf8');
function sliceFunction(source, header) {
  const start = source.indexOf(header);
  assert.ok(start >= 0, header);
  let open = start + header.length;
  while (source[open] === ' ' || source[open] === '\n') open += 1;
  assert.equal(source[open], '{');
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, index + 1);
    }
  }
  throw new Error(`unterminated ${header}`);
}
const listBody = sliceFunction(admin, "export function listWelcomeInquiries({ query = '', page = 0 } = {})");
assert.match(listBody, /await assertAdmin\(client\)/);
assert.match(listBody, /pageWindow\(page\)/);
assert.match(listBody, /from\('welcome_inquiries'\)\.select\('id, kind, email, name, message, created_at', \{ count: 'exact' \}\)/);
assert.match(listBody, /request\.or\(`email\.ilike\.%\$\{term\}%,name\.ilike\.%\$\{term\}%,message\.ilike\.%\$\{term\}%`\)/);
assert.match(listBody, /order\('created_at', \{ ascending: false \}\)\.range\(window\.from, window\.to\)/);
assert.match(admin, /const from = safePage \* ADMIN_PAGE_SIZE/);
assert.match(care, /mode\.value === 'inquiries'[\s\S]*listWelcomeInquiries\(\{ query: query\.value, page: page\.value \}\)/);
assert.match(care, /网站留言/);
assert.match(care, /kind === 'stay'\) return '留资'/);
assert.match(care, /kind === 'contact'\) return '留言'/);
assert.match(care, /还没有网站留言。欢迎页提交的留资和留言会显示在这里。/);
assert.match(care, /没有符合条件的网站留言。/);
assert.match(care, /搜索邮箱、姓名或内容/);
assert.match(care, /<th>类型<\/th><th>邮箱<\/th><th>姓名<\/th><th>内容<\/th><th>时间<\/th>/);
assert.match(care, /row\.email/);
assert.match(care, /row\.name \|\| '未留'/);
assert.match(care, /inquiryPreview\(row\)/);
assert.match(care, /formatAdminTime\(row\.created_at\)/);
assert.match(care, /:page-size="ADMIN_PAGE_SIZE"/);
assert.doesNotMatch(view, /listWelcomeInquiries|from\(['"]welcome_inquiries['"]\)/);

const initial = readFileSync(new URL('../supabase/migrations/001_initial.sql', import.meta.url), 'utf8');
const isAdmin = initial.slice(initial.indexOf('function private.is_admin()'), initial.indexOf('function private.set_user_role'));
assert.match(isAdmin, /security definer/);
assert.match(isAdmin, /id = auth\.uid\(\) and role = 'A'/);
assert.match(initial, /grant execute on function private\.is_admin\(\) to authenticated/);
assert.match(sql, /revoke all on public\.welcome_inquiries from public, anon, authenticated/);
assert.match(sql, /for select to authenticated\s+using \(private\.is_admin\(\)\)/);

console.log('welcome inquiry: validated insert, anon execute only, admin list');
