// Imports every active affiliate feed (table `feeds`) into brands + products.
// Runs every day from pg_cron. Protected by a shared secret kept in the private `app_settings` table.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { parseDelimited, headerMap, toProduct, slugify } from './feed-lib.js';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function readFeed(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': 'BuyFromHere-FeedImporter/1.0' } });
  if (!res.ok || !res.body) throw new Error(`The feed address answered with status ${res.status}`);
  const gz = /\.gz($|\?)/i.test(url) || (res.headers.get('content-type') || '').includes('gzip');
  const stream = gz ? res.body.pipeThrough(new DecompressionStream('gzip')) : res.body;
  return await new Response(stream).text();
}

// deno-lint-ignore no-explicit-any
async function importFeed(feed: any) {
  const started = new Date().toISOString();
  const run = await db.from('feed_runs').insert({ feed_id: feed.id, started_at: started }).select('id').single();
  const stats = { rows_read: 0, products_upserted: 0, products_marked_out: 0, rows_skipped: 0 };
  const skipped: Record<string, number> = {};
  try {
    const text = await readFeed(feed.url);
    const delim = feed.format === 'csv' ? ',' : feed.format === 'tsv' ? '\t' : feed.format === 'pipe' ? '|' : undefined;
    const rows = parseDelimited(text, delim);
    if (rows.length < 2) throw new Error('The feed was empty.');
    const map = headerMap(rows[0]);
    for (const need of ['id', 'name', 'link', 'price']) {
      if (map[need] == null) throw new Error(`Couldn't find a "${need}" column. Columns were: ${rows[0].slice(0, 30).join(', ')}`);
    }

    // brands already known for this network
    const known = await db.from('brands').select('id, slug, name, network_advertiser_id').eq('network', feed.network);
    const byKey = new Map<string, string>();
    for (const b of known.data || []) byKey.set(b.network_advertiser_id || 'name:' + b.name.toLowerCase(), b.id);

    // deno-lint-ignore no-explicit-any
    const batch: any[] = [];
    const now = new Date().toISOString();
    for (const row of rows.slice(1)) {
      stats.rows_read++;
      const r = toProduct(row, map, feed.default_currency);
      if (r.skip) { stats.rows_skipped++; skipped[r.skip] = (skipped[r.skip] || 0) + 1; continue; }
      const key = r.storeId || 'name:' + r.store.toLowerCase();
      let brandId = byKey.get(key);
      if (!brandId) {
        let slug = slugify(r.store);
        const clash = await db.from('brands').select('id').eq('slug', slug).maybeSingle();
        if (clash.data) slug = slug + '-' + feed.network;
        const ins = await db.from('brands').insert({ slug, name: r.store, network: feed.network, network_advertiser_id: r.storeId }).select('id').single();
        if (ins.error) throw new Error('Could not add brand ' + r.store + ': ' + ins.error.message);
        brandId = ins.data.id as string;
        byKey.set(key, brandId);
      }
      batch.push({ ...r.product, brand_id: brandId, network: feed.network, feed_id: feed.id, last_seen_at: now });
    }

    // the same product id can appear twice in a feed (one per size); keep the first
    const seen = new Set<string>();
    const unique = batch.filter((p) => (seen.has(p.external_id) ? false : (seen.add(p.external_id), true)));
    for (let i = 0; i < unique.length; i += 500) {
      const up = await db.from('products').upsert(unique.slice(i, i + 500), { onConflict: 'network,external_id' });
      if (up.error) throw new Error('Saving products failed: ' + up.error.message);
      stats.products_upserted += Math.min(500, unique.length - i);
    }

    // Anything from this feed that wasn't in today's file is marked sold out (not deleted, so saved lists keep it).
    // Skipped if today's file gave us nothing, so one broken download can't empty the shop.
    if (stats.products_upserted > 0) {
      const out = await db.from('products').update({ in_stock: false }).eq('feed_id', feed.id).lt('last_seen_at', started).eq('in_stock', true).select('id');
      stats.products_marked_out = out.data?.length || 0;
    }
    await db.from('feed_runs').update({ ...stats, finished_at: new Date().toISOString(), error: Object.keys(skipped).length ? 'skipped: ' + JSON.stringify(skipped) : null }).eq('id', run.data!.id);
    return { feed: feed.label, ...stats, skipped };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.from('feed_runs').update({ ...stats, finished_at: new Date().toISOString(), error: msg }).eq('id', run.data!.id);
    return { feed: feed.label, ...stats, error: msg };
  }
}

Deno.serve(async (req) => {
  const secret = await db.from('app_settings').select('value').eq('key', 'import_secret').single();
  if (!secret.data || req.headers.get('x-import-secret') !== secret.data.value) return json({ error: 'Not allowed' }, 401);
  const body = await req.json().catch(() => ({}));
  let q = db.from('feeds').select('*').eq('is_active', true);
  if (body && body.feed_id) q = q.eq('id', body.feed_id);
  const feeds = await q;
  if (!feeds.data || !feeds.data.length) return json({ message: 'No active feeds yet. Add one to the feeds table once an affiliate network approves you.' });
  const results = [];
  for (const f of feeds.data) results.push(await importFeed(f));
  return json({ results });
});
