const CONTENT_LIMIT = 2000;
const CONTACT_LIMIT = 120;

export function feedbackPayload({ content, contact } = {}) {
  const body = typeof content === 'string' ? content.trim() : '';
  if (!body) throw new Error('请填写反馈内容。');
  if (body.length > CONTENT_LIMIT) throw new Error('反馈内容过长，请缩短后再提交。');
  const reach = typeof contact === 'string' ? contact.trim() : '';
  if (reach.length > CONTACT_LIMIT) throw new Error('联系方式过长，请缩短后再提交。');
  return { content: body, contact: reach || null };
}

function feedbackError(error) {
  const message = String(error?.message || '');
  if (error?.code === '42P01' || error?.code === 'PGRST205' || /relation .* does not exist|Could not find the table/i.test(message)) {
    return new Error('暂时无法提交，请稍后再试。');
  }
  if (error?.code === '42501' || /permission denied|JWT|AUTH_REQUIRED/i.test(message)) {
    return new Error('请登录后再提交反馈。');
  }
  return new Error('暂时无法提交，请稍后再试。');
}

export async function submitFeedback(input, client) {
  const row = feedbackPayload(input);
  const db = client === undefined ? (await import('../lib/supabase.js')).supabase : client;
  if (!db) throw new Error('暂时无法提交，请稍后再试。');
  const { data: authData, error: authError } = await db.auth.getUser();
  if (authError || !authData?.user?.id) throw new Error('请登录后再提交反馈。');
  const { data, error } = await db.from('user_feedback').insert({
    user_id: authData.user.id,
    content: row.content,
    contact: row.contact
  }).select('id').single();
  if (error || !data?.id) throw feedbackError(error);
  return { id: data.id };
}
