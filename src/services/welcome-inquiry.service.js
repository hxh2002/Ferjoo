const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_LIMIT = 254;
const NAME_LIMIT = 80;
const MESSAGE_LIMIT = 2000;

export function welcomeInquiryPayload({ kind, email, name, message } = {}) {
  if (kind !== 'stay' && kind !== 'contact') throw new Error('Choose a form.');
  const address = typeof email === 'string' ? email.trim() : '';
  if (!address) throw new Error('Enter your email address.');
  if (address.length > EMAIL_LIMIT || !EMAIL_PATTERN.test(address)) throw new Error('Enter a valid email address.');
  if (kind === 'stay') return { kind, email: address, name: null, message: null };
  const person = typeof name === 'string' ? name.trim() : '';
  const body = typeof message === 'string' ? message.trim() : '';
  if (!person) throw new Error('Enter your name.');
  if (person.length > NAME_LIMIT) throw new Error('Enter a shorter name.');
  if (!body) throw new Error('Enter a message.');
  if (body.length > MESSAGE_LIMIT) throw new Error('Enter a shorter message.');
  return { kind, email: address, name: person, message: body };
}

function inquiryError(error, kind) {
  const message = String(error?.message || '');
  if (message.includes('EMAIL_REQUIRED')) return new Error('Enter your email address.');
  if (message.includes('EMAIL_INVALID')) return new Error('Enter a valid email address.');
  if (message.includes('NAME_REQUIRED')) return new Error('Enter your name.');
  if (message.includes('NAME_TOO_LONG')) return new Error('Enter a shorter name.');
  if (message.includes('MESSAGE_REQUIRED')) return new Error('Enter a message.');
  if (message.includes('MESSAGE_TOO_LONG')) return new Error('Enter a shorter message.');
  return new Error(kind === 'stay' ? 'This page could not save that email.' : 'This page could not save that message.');
}

export async function submitWelcomeInquiry(input, client) {
  const row = welcomeInquiryPayload(input);
  const db = client === undefined ? (await import('../lib/supabase.js')).supabase : client;
  if (!db) throw new Error(row.kind === 'stay' ? 'This page cannot save emails right now.' : 'This page cannot save messages right now.');
  const { data, error } = await db.rpc('submit_welcome_inquiry', {
    p_kind: row.kind,
    p_email: row.email,
    p_name: row.name,
    p_message: row.message
  });
  if (error || !data) throw inquiryError(error, row.kind);
  return { id: data };
}
