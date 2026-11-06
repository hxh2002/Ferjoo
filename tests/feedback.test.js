import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { feedbackPayload, submitFeedback } from '../src/services/feedback.service.js';

const sql = readFileSync(new URL('../supabase/migrations/024_user_feedback.sql', import.meta.url), 'utf8');
assert.match(sql, /create table public\.user_feedback/);
assert.match(sql, /enable row level security/);
assert.match(sql, /grant select, insert on public\.user_feedback to authenticated/);
assert.doesNotMatch(sql, /grant\s+(update|delete|all)/i);
assert.match(sql, /user_feedback_insert_own/);
assert.match(sql, /user_id = \(select auth\.uid\(\)\)/);
assert.match(sql, /char_length\(btrim\(content\)\) between 1 and 2000/);

assert.deepEqual(feedbackPayload({ content: '  罐体读数偏高  ', contact: '  ' }), {
  content: '罐体读数偏高',
  contact: null
});
assert.throws(() => feedbackPayload({ content: '   ' }), /请填写反馈内容/);
assert.throws(() => feedbackPayload({ content: '好', contact: 'x'.repeat(121) }), /联系方式过长/);

function client({ userId = 'user-1', row = { id: 'feedback-1' }, error = null, calls = [] } = {}) {
  return {
    calls,
    auth: {
      getUser: async () => ({ data: { user: userId ? { id: userId } : null }, error: null })
    },
    from(table) {
      calls.push(table);
      return {
        insert(payload) {
          calls.push(payload);
          return { select: () => ({ single: async () => ({ data: row, error }) }) };
        }
      };
    }
  };
}

const savedCalls = [];
const saved = await submitFeedback({ content: '希望曲线能看整天', contact: 'a@b.c' }, client({ calls: savedCalls }));
assert.deepEqual(saved, { id: 'feedback-1' });
assert.deepEqual(savedCalls, ['user_feedback', {
  user_id: 'user-1',
  content: '希望曲线能看整天',
  contact: 'a@b.c'
}]);

const skipped = [];
await assert.rejects(submitFeedback({ content: '  ' }, client({ calls: skipped })), /请填写反馈内容/);
assert.deepEqual(skipped, []);

await assert.rejects(submitFeedback({ content: '一条意见' }, client({ userId: null })), /请登录后再提交反馈/);
await assert.rejects(submitFeedback({ content: '一条意见' }, client({ row: null, error: { code: '42501' } })), /请登录后再提交反馈/);
await assert.rejects(submitFeedback({ content: '一条意见' }, client({ row: {} })), /暂时无法提交，请稍后再试/);
await assert.rejects(submitFeedback({ content: '一条意见' }, null), /暂时无法提交，请稍后再试/);

const view = readFileSync(new URL('../src/views/mobile/MobileFeedback.vue', import.meta.url), 'utf8');
assert.match(view, /if \(!saved\?\.id\)/);
assert.doesNotMatch(view, /createClient|supabase\.from/);

console.log('feedback: own-row insert, empty rejection and confirmed id passed');
