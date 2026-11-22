// Stand-in for supabase-js used only by the headless browser test.
(function () {
  var cats = [['dresses','Dresses'],['tops','Tops'],['knitwear','Knitwear'],['jackets-coats','Jackets & coats'],['pants-jeans','Pants & jeans'],['skirts','Skirts'],['shoes','Shoes'],['bags','Bags'],['jewelry','Jewelry'],['watches','Watches'],['sunglasses','Sunglasses'],['accessories','Other accessories']]
    .map(function (c, i) { return { slug: c[0], name: c[1], grp: 'x', sort: i }; });
  var spec = {
    'maison-ardent|Maison Ardent': { dresses: ['Silk slip dress','Wrap midi dress','Pleated maxi dress','Black column dress'], tops: ['Silk camisole','Poplin shirt'], skirts: ['Bias midi skirt'] },
    'north-row|North Row': { knitwear: ['Cashmere crewneck','Ribbed cardigan','Cable knit sweater'], 'jackets-coats': ['Wool overcoat','Cropped trench','Leather biker jacket'] },
    'lune-atelier|Lune Atelier': { jewelry: ['Gold hoop earrings','Pearl drop earrings','Herringbone chain necklace','Signet ring'], bags: ['Mini crossbody bag'] },
    'field-and-forme|Field & Forme': { shoes: ['Leather loafers','Pointed pumps','Strappy heels','Chelsea boots'], bags: ['Structured tote','Shoulder bag','Evening clutch'] },
    'oro-time|Oro Time': { watches: ['Mesh strap watch','Chronograph watch'] }
  };
  var brands = [], products = [], n = 0;
  Object.keys(spec).forEach(function (k, bi) {
    var id = 'b' + bi; brands.push({ id: id, slug: k.split('|')[0], name: k.split('|')[1], bio: 'Sample brand.', website: null });
    Object.keys(spec[k]).forEach(function (cat) {
      spec[k][cat].forEach(function (name) {
        n++;
        products.push({ id: 'p' + n, brand_id: id, name: name, description: n === 1 ? 'A bias-cut slip dress in washed silk.' : null, category_slug: cat,
          price: 100 + n * 7 + 0.99, sale_price: n % 6 === 0 ? 80 + n : null, currency: n % 3 ? 'CAD' : 'USD',
          image_url: n === 2 ? 'https://cdn.brand.test/wrap.jpg' : null,
          affiliate_url: 'https://example.com/aff?p=' + n, in_stock: n !== 5, is_featured: n === 3,
          created_at: new Date(Date.UTC(2026, 10, 1 + (n % 20))).toISOString() });
      });
    });
  });
  var data = { categories: cats, brands: brands, products: products, saved_items: [], follows: [], clicks: [] };
  window.__mock = data; window.__log = [];
  var listeners = [];
  function session() { try { return JSON.parse(localStorage.getItem('mock_session') || 'null'); } catch (e) { return null; } }
  function fire(evt) { var s = session(); listeners.forEach(function (cb) { setTimeout(function () { cb(evt, s); }, 0); }); }
  window.__mockSignIn = function (email) { localStorage.setItem('mock_session', JSON.stringify({ user: { id: 'u1', email: email, user_metadata: { full_name: 'Kasra Test' } } })); fire('SIGNED_IN'); };
  window.__mockExpire = function () { localStorage.removeItem('mock_session'); }; // silently, like a used-up link in another tab

  function Q(table) { this.t = table; this.filters = []; this.op = 'select'; this.rangeV = null; }
  Q.prototype.select = function () { return this; };
  Q.prototype.order = function () { return this; };
  Q.prototype.eq = function (c, v) { this.filters.push([c, v]); return this; };
  Q.prototype.range = function (a, b) { this.rangeV = [a, b]; return this; };
  Q.prototype.insert = function (row) { this.op = 'insert'; this.row = row; return this; };
  Q.prototype.delete = function () { this.op = 'delete'; return this; };
  Q.prototype.maybeSingle = function () { this.single1 = true; return this; };
  Q.prototype.run = function () {
    var self = this, rows = data[this.t] || [], s = session();
    var match = function (r) { return self.filters.every(function (f) { return r[f[0]] === f[1]; }); };
    window.__log.push(this.op + ' ' + this.t + ' ' + JSON.stringify(this.row || this.filters));
    if (this.op === 'insert') {
      if (this.t !== 'clicks' && (!s || this.row.user_id !== s.user.id)) return { data: null, error: { code: '42501', message: 'new row violates row-level security policy' }, status: 401 };
      if (this.t === 'saved_items' && rows.some(function (r) { return r.user_id === self.row.user_id && r.product_id === self.row.product_id; })) return { data: null, error: { code: '23505' } };
      rows.push(Object.assign({}, this.row)); return { data: null, error: null, status: 201 };
    }
    if (this.op === 'delete') {
      if (!s) return { data: null, error: { code: '42501' }, status: 401 };
      data[this.t] = rows.filter(function (r) { return !match(r); }); return { data: null, error: null };
    }
    var out = rows.filter(match);
    if ((this.t === 'saved_items' || this.t === 'follows') && !s) out = [];
    if (this.rangeV) out = out.slice(this.rangeV[0], this.rangeV[1] + 1);
    return { data: this.single1 ? (out[0] || null) : out, error: null };
  };
  Q.prototype.then = function (res, rej) { var r = this.run(); return new Promise(function (ok) { setTimeout(function () { ok(r); }, 5); }).then(res, rej); };

  window.supabase = { createClient: function () {
    return {
      from: function (t) { return new Q(t); },
      auth: {
        getSession: async function () { return { data: { session: session() } }; },
        refreshSession: async function () { return { data: { session: session() } }; },
        signInWithOtp: async function (o) { window.__log.push('otp ' + o.email); return { error: o.email.indexOf('limit') > -1 ? { status: 429, message: 'email rate limit exceeded' } : null }; },
        signInWithOAuth: async function () { return { error: { message: 'Unsupported provider: provider is not enabled' } }; },
        signOut: async function () { localStorage.removeItem('mock_session'); fire('SIGNED_OUT'); return { error: null }; },
        onAuthStateChange: function (cb) { listeners.push(cb); return { data: { subscription: { unsubscribe: function () {} } } }; }
      }
    };
  } };
})();
