# Buy From Here

A Pinterest-style fashion site. Shoppers browse dresses, shoes, bags, jewelry and watches from many brands, save what they like, follow brands and categories, and tap **Buy** to check out on the brand's own site through an affiliate link. We don't sell, ship or take payments.

Live (once GitHub Pages is on): https://kasraaaaa.github.io/buy-from-here

## How it's built

| Part | Where |
|---|---|
| Site (plain HTML, CSS, JS on GitHub Pages) | `index.html`, `style.css`, `app.js` |
| Settings, image helper, friendly email errors | `config.js` |
| Sign-in (Google or email link) | `signin.js` |
| Typo-tolerant search (from Pin NOT Terest, unchanged) | `search.js` |
| Daily feed importer (Supabase Edge Function) | `supabase/functions/import-feeds/` |
| Database | Supabase project `buy-from-here` (`uaahjqlenzdztqcqjksb`) |

Database tables: `categories`, `brands`, `products`, `saved_items`, `follows`, `clicks`, `feeds`, `feed_runs`, `app_settings`. Row-level security is on for all of them: anyone can read active brands and products, shoppers can only see and change their own saves and follows, anyone can log a Buy click but nobody can read clicks from the site, and `feeds`, `feed_runs` and `app_settings` are only reachable by the importer.

## Releasing a change

1. `git fetch && git rebase origin/main` before pushing (other chats push to this repo too).
2. Change the `?v=` number on every file in `index.html` so browsers pick up the new CSS and JS.
3. Test in a headless browser with sample data before pushing.

## Adding an affiliate feed

Once a network approves you and a brand, copy the product feed URL from the network (Awin, CJ, Impact and Rakuten all work; CSV, tab or pipe files, gzipped or not) and run this in the Supabase SQL editor:

```sql
insert into feeds (network, label, url, default_currency)
values ('awin', 'Awin – Brand name', 'PASTE-FEED-URL-HERE', 'CAD');
```

It imports every day at about 1–2 am Vancouver time. To run it right away:

```sql
select net.http_post(
  url := 'https://uaahjqlenzdztqcqjksb.supabase.co/functions/v1/import-feeds',
  headers := jsonb_build_object('Content-Type','application/json','x-import-secret',(select value from app_settings where key='import_secret')),
  body := '{}'::jsonb, timeout_milliseconds := 300000);
```

Then check `select * from feed_runs order by id desc;` for what came in and what was skipped (menswear, other currencies, categories we don't carry).

What the importer does: maps each network's column names, sorts products into our categories, skips menswear and anything not in CAD or USD, creates brands as needed, and marks products sold out when they drop out of the feed (it never deletes them, and does nothing if a download comes back empty).

## Handy queries

```sql
-- remove the sample catalogue once real products are in
delete from brands where is_sample;

-- which products and brands get Buy clicks
select * from click_report limit 50;

-- hide or feature a product
update products set is_active = false where id = '...';
update products set is_featured = true where id = '...';
```
