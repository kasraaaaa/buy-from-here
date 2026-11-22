// Pure helpers for reading affiliate product feeds. No network or database code here, so it can be tested on its own.

// Split a delimited file into rows of fields, handling quoted fields with commas, quotes and line breaks.
export function parseDelimited(text, delim) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (!delim) {
    const first = text.slice(0, text.indexOf('\n') > -1 ? text.indexOf('\n') : text.length);
    const counts = { ',': first.split(',').length, '\t': first.split('\t').length, '|': first.split('|').length };
    delim = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  }
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"' && field === '') inQ = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Column names differ by network (Awin, CJ, Impact, Rakuten, Google Shopping style). First match wins.
const ALIASES = {
  id: ['id', 'aw_product_id', 'product_id', 'catalogitemid', 'catalog_item_id', 'sku', 'merchant_product_id', 'unique_id'],
  name: ['title', 'product_name', 'name', 'productname'],
  description: ['description', 'product_short_description', 'short_description', 'product_description'],
  store: ['merchant_name', 'advertiser_name', 'program_name', 'advertiser', 'campaign_name', 'brand', 'brand_name', 'manufacturer'],
  storeId: ['merchant_id', 'advertiser_id', 'program_id', 'programid', 'campaignid', 'campaign_id', 'mid'],
  price: ['search_price', 'price', 'current_price', 'currentprice', 'retail_price', 'store_price'],
  salePrice: ['sale_price', 'saleprice'],
  originalPrice: ['rrp_price', 'original_price', 'originalprice', 'base_price'],
  currency: ['currency', 'price_currency'],
  image: ['merchant_image_url', 'image_link', 'aw_image_url', 'image_url', 'imageurl', 'large_image', 'large_image_url'],
  link: ['aw_deep_link', 'link', 'buy_url', 'affiliate_url', 'click_url', 'deeplink', 'url', 'product_link'],
  page: ['merchant_deep_link', 'product_url', 'producturl', 'mobile_link'],
  stock: ['availability', 'in_stock', 'stock_status', 'stockavailability', 'stock_availability', 'is_in_stock'],
  category: ['product_type', 'merchant_category', 'category_name', 'category', 'merchant_product_category_path', 'google_product_category', 'primary_category'],
  gender: ['gender', 'custom_1'],
};

export function headerMap(header) {
  const norm = header.map((h) => String(h).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''));
  const map = {};
  for (const key of Object.keys(ALIASES)) {
    for (const a of ALIASES[key]) { const i = norm.indexOf(a); if (i > -1) { map[key] = i; break; } }
  }
  return map;
}

// "129.00 USD", "$129", "129,00" -> { amount, currency }
export function parsePrice(raw) {
  if (raw == null) return { amount: null, currency: null };
  const s = String(raw).trim();
  if (!s) return { amount: null, currency: null };
  const cur = (s.match(/\b(CAD|USD)\b/i) || [])[1];
  let n = s.replace(/[^0-9.,]/g, '');
  if (/,\d{2}$/.test(n) && n.indexOf('.') === -1) n = n.replace(',', '.');
  n = n.replace(/,/g, '');
  const amount = n ? Number(n) : null;
  return { amount: Number.isFinite(amount) ? Math.round(amount * 100) / 100 : null, currency: cur ? cur.toUpperCase() : null };
}

export function inStock(raw) {
  if (raw == null || String(raw).trim() === '') return true;
  const s = String(raw).trim().toLowerCase();
  return !/(out of stock|out_of_stock|outofstock|sold out|discontinued|^no$|^n$|^0$|^false$)/.test(s);
}

// Our categories (women's clothing + accessories). Order matters: the first rule that matches wins.
const RULES = [
  ['watches', /\bwatch(es)?\b|timepiece/],
  ['sunglasses', /sunglass|eyewear|\bshades\b/],
  ['jewelry', /jewel|necklace|earring|\brings?\b|bracelet|pendant|anklet|bangle|brooch|\bchains?\b/],
  ['bags', /\bbags?\b|handbag|\btotes?\b|clutch|purse|backpack|wallet|card ?holder|crossbody|satchel|pouch/],
  ['shoes', /\bshoes?\b|footwear|\bboots?\b|booties|\bheels?\b|sneaker|trainer|sandal|loafer|\bpumps?\b|\bflats\b|\bmules?\b|espadrille|slipper/],
  ['dresses', /\bdress(es)?\b|\bgowns?\b/],
  ['skirts', /\bskirts?\b/],
  ['jackets-coats', /jacket|\bcoats?\b|blazer|trench|parka|outerwear|gilet|\bvests?\b/],
  ['knitwear', /sweater|cardigan|knit|pullover|jumper|hoodie|sweatshirt/],
  ['pants-jeans', /\bpants?\b|trouser|\bjeans?\b|denim|legging|\bshorts\b|jogger/],
  ['tops', /\btops?\b|\bshirts?\b|blouse|\btees?\b|t-shirt|\btanks?\b|camisole|\bcami\b|bodysuit|polo/],
  ['accessories', /scarf|scarves|\bbelts?\b|\bhats?\b|\bcaps?\b|beanie|gloves?|hair (clip|accessor)|headband|keychain/],
];
export function categorize(categoryText, name) {
  const pools = [String(categoryText || '').toLowerCase(), String(name || '').toLowerCase()];
  // product name is more specific than a broad feed category, so try the name first
  for (const text of [pools[1], pools[0]]) {
    if (!text) continue;
    for (const [slug, re] of RULES) if (re.test(text)) return slug;
  }
  return null;
}

// Menswear is skipped for now; unisex and women's stay.
export function isMenswear(gender, categoryText, name) {
  const g = String(gender || '').trim().toLowerCase();
  if (g) return /^(male|men|mens|men's|man)$/.test(g);
  const t = (String(categoryText || '') + ' ' + String(name || '')).toLowerCase();
  if (/\b(women|womens|women's|ladies|unisex)\b/.test(t)) return false;
  return /\b(men|mens|men's|man's)\b/.test(t);
}

export function slugify(s) {
  return String(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'brand';
}

// Turn one feed row into a product (or a reason it was skipped).
export function toProduct(row, map, defaultCurrency) {
  const get = (k) => (map[k] == null ? '' : String(row[map[k]] ?? '').trim());
  const id = get('id'), name = get('name'), link = get('link');
  if (!id || !name || !link) return { skip: 'missing id, name or link' };
  if (!/^https?:\/\//i.test(link)) return { skip: 'link is not a web address' };
  if (isMenswear(get('gender'), get('category'), name)) return { skip: 'menswear' };
  const category = categorize(get('category'), name);
  if (!category) return { skip: 'not a category we carry' };
  const p = parsePrice(get('price'));
  const sale = parsePrice(get('salePrice'));
  const orig = parsePrice(get('originalPrice'));
  if (p.amount == null) return { skip: 'no price' };
  let price = p.amount, salePrice = sale.amount;
  // Some feeds give the current price plus the old (RRP) price instead of a sale price.
  if (salePrice == null && orig.amount != null && orig.amount > price) { salePrice = price; price = orig.amount; }
  if (salePrice != null && salePrice >= price) salePrice = null;
  let currency = (get('currency') || p.currency || defaultCurrency || 'CAD').toUpperCase();
  if (currency !== 'CAD' && currency !== 'USD') return { skip: 'currency ' + currency };
  const image = get('image');
  return {
    product: {
      external_id: id.slice(0, 200),
      name: name.slice(0, 300),
      description: get('description').slice(0, 2000) || null,
      category_slug: category,
      price, sale_price: salePrice, currency,
      image_url: /^https?:\/\//i.test(image) ? image : null,
      affiliate_url: link,
      product_url: /^https?:\/\//i.test(get('page')) ? get('page') : null,
      in_stock: inStock(get('stock')),
    },
    store: get('store') || 'Unknown brand',
    storeId: get('storeId') || null,
  };
}
