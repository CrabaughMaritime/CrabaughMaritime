import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
import { validateReceipt } from '../_shared/receipt-validation.js';

const env = (name: string) => Deno.env.get(name) || '';
const url = env('SUPABASE_URL');
const db = createClient(url, env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false }
});
const origins = env('APP_ALLOWED_ORIGINS').split(',').map(value => value.trim());
const maxRequestBytes = 10 * 1024 * 1024 + 65536;
const isId = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);

async function readForm(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw Error('Choose a file to upload.');

  const parts: Uint8Array<ArrayBuffer>[] = [];
  let length = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maxRequestBytes) {
      await reader.cancel();
      throw Error('Choose a file up to 10 MB.');
    }
    parts.push(new Uint8Array(value));
  }

  return new Response(new Blob(parts), {
    headers: { 'Content-Type': request.headers.get('Content-Type') || '' }
  }).formData();
}

Deno.serve(async request => {
  const origin = request.headers.get('Origin');
  const cors: Record<string, string> = origin && origins.includes(origin) ? {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Vary': 'Origin'
  } : {};

  const reply = (value: unknown, status = 200) => Response.json(value, {
    status,
    headers: { ...cors, 'Cache-Control': 'no-store' }
  });

  if (origin && !origins.includes(origin)) {
    return reply({ error: 'Origin is not allowed.' }, 403);
  }
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return reply({ error: 'Use POST.' }, 405);

  try {
    const bearer = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];
    if (!bearer) return reply({ error: 'Sign in to continue.' }, 401);

    const { data: { user }, error } = await db.auth.getUser(bearer);
    if (error || !user) return reply({ error: 'Sign in to continue.' }, 401);

    if (Number(request.headers.get('Content-Length')) > maxRequestBytes) {
      return reply({ error: 'Choose a file up to 10 MB.' }, 413);
    }

    const form = await readForm(request).catch(() => null);
    if (!form) return reply({ error: 'The upload could not be read. Choose a file up to 10 MB.' }, 400);

    const orgId = form.get('orgId');
    const transactionId = form.get('transactionId') || null;
    const category = form.get('category') || null;
    const file = form.get('file');

    if (!isId(orgId) || (transactionId !== null && !isId(transactionId)) ||
        (category !== null && (typeof category !== 'string' || category.length > 160)) ||
        !(file instanceof File)) {
      return reply({ error: 'Invalid receipt details.' }, 400);
    }

    const membership = await db.from('memberships').select('org_id')
      .eq('org_id', orgId).eq('user_id', user.id).maybeSingle();
    if (membership.error) throw membership.error;
    if (!membership.data) return reply({ error: 'Workspace access required.' }, 403);

    if (transactionId) {
      const transaction = await db.from('transactions').select('id')
        .eq('org_id', orgId).eq('id', transactionId).maybeSingle();
      if (transaction.error) throw transaction.error;
      if (!transaction.data) return reply({ error: 'The linked transaction is unavailable.' }, 404);
    }

    let contentType;
    try {
      contentType = await validateReceipt(file);
    } catch (error) {
      return reply({ error: (error as Error).message }, 415);
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
    const path = `${orgId}/${crypto.randomUUID()}-${safeName}`;
    const bucket = db.storage.from('receipts');
    const upload = await bucket.upload(path, file, { contentType, upsert: false });
    if (upload.error) throw upload.error;

    const caller = createClient(url, env('SUPABASE_ANON_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${bearer}` } }
    });

    const result = await caller.from('receipts').insert({
      org_id: orgId,
      transaction_id: transactionId,
      category,
      file_path: path,
      file_name: file.name.slice(0, 255),
      uploaded_by: user.id
    });

    if (result.error) {
      const existing = await db.from('receipts').select('id')
        .eq('org_id', orgId).eq('file_path', path).maybeSingle();
      if (existing.data) return reply({ ok: true });
      if (!existing.error) {
        const cleanup = await bucket.remove([path]);
        if (cleanup.error) console.warn('Receipt cleanup failed');
      }
      throw result.error;
    }

    return reply({ ok: true }, 201);
  } catch (error) {
    console.error('Receipt upload failed', error instanceof Error ? error.name : 'Database error');
    return reply({ error: 'The receipt could not be saved. Try again.' }, 500);
  }
});
