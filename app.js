(function () {
  var db = window.bfhDb;
  var app = document.getElementById('app');
  var PAGE = 60;

  var cats = [], catBySlug = {};
  var brands = [], brandById = {}, brandBySlug = {};
  var products = [], productById = {};
  var user = null;
  var saved = {};                       // product_id -> true
  var follows = { brand: {}, category: {} };
  var lastSeen = 0;
  var shown = PAGE;                     // how many pins the current list shows
  var sortBy = 'new';
  var currentSource = 'home';

  var tones = ['#F3EAE0', '#EADBCB', '#E2CFBC', '#F6EFE7', '#3B302A', '#4A3D34', '#C9AE94', '#D8C3AE'];

  // ---------- Small helpers ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function hash(s) { var h = 0; s = String(s); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
  function money(v, cur) {
    try { return new Intl.NumberFormat('en-CA', { style: 'currency', currency: cur || 'CAD' }).format(Number(v)); }
    catch (e) { return '$' + Number(v).toFixed(2); }
  }
  function priceHtml(p) {
    if (p.sale_price != null && Number(p.sale_price) < Number(p.price)) {
      return '<span class="price"><span class="sale">' + money(p.sale_price, p.currency) + '</span><s>' + money(p.price, p.currency) + '</s></span>';
    }
    return '<span class="price">' + money(p.price, p.currency) + '</span>';
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  function setNav(key) {
    document.querySelectorAll('[data-nav]').forEach(function (a) {
      var on = a.getAttribute('data-nav') === key;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }
  function toast(msg) {
    document.querySelectorAll('.toast').forEach(function (old) { old.remove(); });
    var t = document.createElement('div');
    t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('out'); }, 3500);
    setTimeout(function () { t.remove(); }, 4200);
  }
  var heartSvg = '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>';
  var backSvg = '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10 3L5 8l5 5"/></svg>';

  // ---------- Pictures ----------
  // Brands' own photo when there is one, otherwise a quiet placeholder with the category and name.
  function placeholder(p, height) {
    var t = tones[hash(p.id) % tones.length];
    var dark = ['#3B302A', '#4A3D34'].indexOf(t) > -1;
    return '<span class="ph" style="background:' + t + ';color:' + (dark ? '#F3EAE0' : '#3B302A') + (height ? ';height:' + height + 'px' : '') + '">' +
      '<span class="label">' + esc((p.cat && p.cat.name) || 'Product') + '</span><span class="ph-name">' + esc(p.name) + '</span></span>';
  }
  function photo(p, opts) {
    opts = opts || {};
    if (!p.image_url) return placeholder(p, opts.phHeight);
    var src = window.bfhImg(p.image_url, opts.img);
    return '<img src="' + esc(src) + '" data-raw="' + esc(p.image_url) + '" alt="' + esc(p.name) + '" loading="lazy">';
  }
  // If Cloudinary can't fetch a brand's photo, fall back to the original; if that fails too, show the placeholder.
  document.addEventListener('error', function (e) {
    var img = e.target;
    if (!img || img.tagName !== 'IMG' || !img.dataset.raw) return;
    if (img.src !== img.dataset.raw && !img.dataset.triedRaw) { img.dataset.triedRaw = '1'; img.src = img.dataset.raw; return; }
    var box = img.closest('[data-pid]');
    var p = box && productById[box.getAttribute('data-pid')];
    if (p) img.outerHTML = placeholder(p, box.classList.contains('pin') ? 300 : 0);
  }, true);

  function heart(p) {
    var on = !!saved[p.id];
    return '<button type="button" class="heart" data-save="' + p.id + '" aria-pressed="' + on + '" aria-label="' + (on ? 'Remove ' : 'Save ') + esc(p.name) + (on ? ' from saved' : '') + '">' + heartSvg + '</button>';
  }
  function info(p) {
    return '<div class="pin-info">' +
      (p.brand ? '<a class="brand-label" href="#/b/' + esc(p.brand.slug) + '">' + esc(p.brand.name) + '</a>' : '') +
      '<strong>' + esc(p.name) + '</strong>' + priceHtml(p) + '</div>';
  }
  function badge(p, isNew) {
    if (!p.in_stock) return '<span class="tag light">Sold out</span>';
    if (isNew) return '<span class="tag">New</span>';
    if (p.sale_price != null && Number(p.sale_price) < Number(p.price)) return '<span class="tag light">On sale</span>';
    return '';
  }
  // Pinterest-style pin: the photo keeps its own shape.
  function pin(p, opts) {
    opts = opts || {};
    var h = 260 + (hash(p.id + 'h') % 6) * 40;
    return '<div class="pin' + (p.in_stock ? '' : ' sold-out') + '" data-pid="' + p.id + '">' + badge(p, opts.isNew) + heart(p) +
      '<button type="button" class="pin-open" data-open="' + p.id + '" aria-label="' + esc(p.name + (p.brand ? ' by ' + p.brand.name : '')) + '">' +
        '<span class="pin-photo">' + photo(p, { img: { w: 600 }, phHeight: h }) + '</span></button>' +
      info(p) + '</div>';
  }
  // Grid card: every photo cropped to the same 4:5 shape.
  function card(p) {
    return '<div class="shop-card' + (p.in_stock ? '' : ' sold-out') + '" data-pid="' + p.id + '">' + badge(p) + heart(p) +
      '<button type="button" class="pin-open" data-open="' + p.id + '" aria-label="' + esc(p.name + (p.brand ? ' by ' + p.brand.name : '')) + '">' +
        '<span class="pin-photo">' + photo(p, { img: { w: 500, h: 625, crop: 'pad', gravity: 'center' } }) + '</span></button>' +
      info(p) + '</div>';
  }
  function moreButton(total) {
    return total > shown ? '<div class="more-row"><button type="button" class="btn" id="show-more">Show more (' + (total - shown) + ' left)</button></div>' : '';
  }
  function wireMore(rerender) {
    var b = document.getElementById('show-more');
    if (b) b.addEventListener('click', function () { var y = window.scrollY; shown += PAGE; rerender(); window.scrollTo(0, y); });
  }

  // ---------- Ordering ----------
  // Mix brands so one big feed doesn't take over the page: featured first, then one from each brand in turn.
  function mixed(list) {
    var feat = list.filter(function (p) { return p.is_featured; });
    var rest = list.filter(function (p) { return !p.is_featured; });
    var byBrand = {}, order = [];
    rest.forEach(function (p) { if (!byBrand[p.brand_id]) { byBrand[p.brand_id] = []; order.push(p.brand_id); } byBrand[p.brand_id].push(p); });
    var out = feat.slice(), more = true;
    for (var i = 0; more; i++) {
      more = false;
      order.forEach(function (b) { if (byBrand[b][i]) { out.push(byBrand[b][i]); more = true; } });
    }
    return out;
  }
  function sorted(list) {
    var l = list.slice();
    function eff(p) { return Number(p.sale_price != null && Number(p.sale_price) < Number(p.price) ? p.sale_price : p.price); }
    if (sortBy === 'low') l.sort(function (a, b) { return eff(a) - eff(b); });
    else if (sortBy === 'high') l.sort(function (a, b) { return eff(b) - eff(a); });
    else if (sortBy === 'sale') l = l.filter(function (p) { return p.sale_price != null && Number(p.sale_price) < Number(p.price); });
    else l.sort(function (a, b) { return (b.created_at > a.created_at ? 1 : b.created_at < a.created_at ? -1 : 0); });
    // sold-out pieces go to the end
    return l.filter(function (p) { return p.in_stock; }).concat(l.filter(function (p) { return !p.in_stock; }));
  }
  function sortSelect() {
    return '<label class="sr" for="sort">Sort</label><select id="sort" class="field">' +
      [['new', 'Newest'], ['low', 'Price: low to high'], ['high', 'Price: high to low'], ['sale', 'On sale']].map(function (o) {
        return '<option value="' + o[0] + '"' + (sortBy === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('') + '</select>';
  }
  function wireSort(rerender) {
    var s = document.getElementById('sort');
    if (s) s.addEventListener('change', function () { sortBy = s.value; shown = PAGE; rerender(); });
  }
  function catChips(active) {
    var used = {};
    products.forEach(function (p) { if (p.category_slug) used[p.category_slug] = true; });
    return '<nav class="cat-chips" aria-label="Categories"><a class="chip" href="#/" aria-pressed="' + (!active) + '">All</a>' +
      cats.filter(function (c) { return used[c.slug]; }).map(function (c) {
        return '<a class="chip" href="#/c/' + esc(c.slug) + '" aria-pressed="' + (active === c.slug) + '"' + (active === c.slug ? ' aria-current="page"' : '') + '>' + esc(c.name) + '</a>';
      }).join('') + '</nav>';
  }

  // ---------- Pages ----------
  function renderHome() {
    document.title = 'Buy From Here — Discover';
    currentSource = 'home';
    var list = mixed(products.filter(function (p) { return p.in_stock; }));
    app.innerHTML =
      '<div class="home">' +
        '<section class="intro"><div><p class="eyebrow">Discover</p>' +
        '<h1>Pieces worth keeping,<br>from brands we like.</h1></div>' +
        '<p class="dir-count">' + plural(list.length, 'piece') + ' from ' + plural(brands.length, 'brand') + '</p></section>' +
        catChips(null) +
        (list.length ? '<section class="feed" aria-label="Products">' + list.slice(0, shown).map(function (p) { return pin(p); }).join('') + '</section>' + moreButton(list.length)
                     : '<p class="empty">New pieces are on their way. Check back soon.</p>') +
      '</div>';
    wireMore(renderHome);
  }

  function followBtn(kind, key, name) {
    var on = !!follows[kind][key];
    return '<button type="button" class="btn ' + (on ? '' : 'btn-dark') + '" data-follow="' + kind + ':' + esc(key) + '" aria-pressed="' + on + '">' +
      (on ? 'Following ✓' : 'Follow ' + esc(name)) + '</button>';
  }

  function renderCategory(c) {
    document.title = c.name + ' — Buy From Here';
    currentSource = 'category';
    var list = sorted(products.filter(function (p) { return p.category_slug === c.slug; }));
    app.innerHTML =
      '<div class="home">' +
        '<section class="page-head"><div><p class="eyebrow">Category</p><h1>' + esc(c.name) + '</h1>' +
          '<p class="muted" style="margin:10px 0 0">' + plural(list.length, 'piece') + '</p></div>' +
          '<div class="actions">' + followBtn('category', c.slug, c.name.toLowerCase()) + sortSelect() + '</div></section>' +
        catChips(c.slug) +
        (list.length ? '<section class="shop-grid" aria-label="' + esc(c.name) + '">' + list.slice(0, shown).map(card).join('') + '</section>' + moreButton(list.length)
                     : '<p class="empty">Nothing in ' + esc(c.name.toLowerCase()) + ' right now. Follow it to see new pieces as they arrive.</p>') +
      '</div>';
    wireSort(function () { renderCategory(c); });
    wireMore(function () { renderCategory(c); });
  }

  function renderBrands() {
    document.title = 'Brands — Buy From Here';
    currentSource = 'brands';
    var list = brands.filter(function (b) { return b.products.length; });
    var cards = list.map(function (b) {
      var photos = b.products.filter(function (p) { return p.image_url; }).slice(0, 4);
      var cover = photos.length
        ? '<div class="brand-cover">' + photos.map(function (p) { return '<img src="' + esc(window.bfhImg(p.image_url, { w: 300, h: 300, crop: 'fill', gravity: 'auto' })) + '" data-raw="' + esc(p.image_url) + '" alt="" loading="lazy">'; }).join('') + '</div>'
        : '<div class="brand-cover brand-cover-empty" aria-hidden="true"><span>' + esc(b.name) + '</span></div>';
      return '<a class="brand-card" href="#/b/' + esc(b.slug) + '">' + cover +
        '<div class="dir-meta"><div><strong>' + esc(b.name) + '</strong><span>' + plural(b.products.length, 'piece') + (follows.brand[b.id] ? ' · Following' : '') + '</span></div></div></a>';
    }).join('');
    app.innerHTML =
      '<div class="home">' +
        '<section class="intro"><div><p class="eyebrow">Brands</p><h1>Shop by brand.</h1></div>' +
        '<p class="dir-count">' + plural(list.length, 'brand') + '</p></section>' +
        (cards ? '<section class="dir-grid" aria-label="Brands">' + cards + '</section>' : '<p class="empty">Brands are on their way.</p>') +
      '</div>';
  }

  function renderBrandPage(b) {
    document.title = b.name + ' — Buy From Here';
    currentSource = 'brand';
    var list = sorted(b.products);
    app.innerHTML =
      '<div class="profile">' +
        '<a href="#/brands" class="back">' + backSvg + 'All brands</a>' +
        '<section class="hero brand-hero"><p class="eyebrow" style="margin:0">Brand</p><h1>' + esc(b.name) + '</h1>' +
          (b.bio ? '<p class="bio">' + esc(b.bio) + '</p>' : '') +
          '<p class="muted">' + plural(list.length, 'piece') + '</p>' +
          '<div class="actions">' + followBtn('brand', b.id, b.name) + sortSelect() + '</div>' +
        '</section>' +
        (list.length ? '<section class="shop-grid" aria-label="Products">' + list.slice(0, shown).map(card).join('') + '</section>' + moreButton(list.length)
                     : '<p class="empty">Nothing from ' + esc(b.name) + ' right now.</p>') +
      '</div>';
    wireSort(function () { renderBrandPage(b); });
    wireMore(function () { renderBrandPage(b); });
  }

  function renderSearch(q) {
    document.title = 'Search: ' + q + ' — Buy From Here';
    currentSource = 'search';
    var found = window.pntSearch(q, products.map(function (p) {
      return { p: p, text: [p.name, p.cat && p.cat.name, p.brand && p.brand.name].join(' '), boost: p.in_stock ? 0.2 : 0 };
    })).map(function (x) { return x.p; });
    var foundBrands = window.pntSearch(q, brands.filter(function (b) { return b.products.length; }).map(function (b) { return { b: b, text: b.name }; })).map(function (x) { return x.b; });
    var foundCats = window.pntSearch(q, cats.map(function (c) { return { c: c, text: c.name + ' ' + c.slug.replace(/-/g, ' ') }; })).map(function (x) { return x.c; });
    var total = found.length + foundBrands.length + foundCats.length;
    var html = '<div class="home"><section class="intro"><div><p class="eyebrow">Search</p>' +
      '<h1>' + (total ? 'Results for “' + esc(q) + '”' : 'Nothing found for “' + esc(q) + '”') + '</h1></div></section>';
    if (!total) html += '<p class="empty">Try another word, like a category (dress, heels, purse) or a brand name.</p>';
    if (foundBrands.length || foundCats.length) {
      html += '<div class="chips search-chips" style="margin-bottom:32px">' +
        foundCats.map(function (c) { return '<a class="chip" style="display:inline-flex;align-items:center" href="#/c/' + esc(c.slug) + '">' + esc(c.name) + '</a>'; }).join('') +
        foundBrands.map(function (b) { return '<a class="chip" style="display:inline-flex;align-items:center" href="#/b/' + esc(b.slug) + '">' + esc(b.name) + '</a>'; }).join('') +
        '</div>';
    }
    if (found.length) html += '<h2 class="section-h" style="margin-top:0">' + plural(found.length, 'piece') + '</h2><section class="shop-grid" aria-label="Products">' + found.slice(0, shown).map(card).join('') + '</section>' + moreButton(found.length);
    app.innerHTML = html + '</div>';
    wireMore(function () { renderSearch(q); });
  }

  function renderSaved() {
    document.title = 'Saved — Buy From Here';
    currentSource = 'saved';
    var head = '<section class="intro"><div><p class="eyebrow">Saved</p><h1>Your saved pieces.</h1></div></section>';
    if (!user) {
      app.innerHTML = '<div class="home">' + head + '<div class="panel narrow" style="text-align:center"><p>Tap the heart on anything you like and it waits for you here, on any device.</p>' +
        '<button type="button" class="btn btn-dark" id="saved-signin">Sign in to save pieces</button></div></div>';
      document.getElementById('saved-signin').addEventListener('click', function () { rememberAfterSignIn({ route: '#/saved' }); openSignIn(); });
      return;
    }
    var list = products.filter(function (p) { return saved[p.id]; });
    var soldOut = list.filter(function (p) { return !p.in_stock; }).length;
    app.innerHTML = '<div class="home">' + head +
      (list.length
        ? (soldOut ? '<p class="muted" style="margin:-24px 0 24px">' + plural(soldOut, 'piece is', 'pieces are') + ' sold out for now.</p>' : '') +
          '<section class="shop-grid" aria-label="Saved">' + list.map(card).join('') + '</section>'
        : '<div class="panel narrow" style="text-align:center"><p>Nothing saved yet. Tap the heart on any piece to keep it here.</p><a href="#/" class="btn btn-dark btn-link">Start browsing</a></div>') +
      '</div>';
  }

  // ---------- Following ----------
  function seenKey() { return 'bfh_seen_' + (user ? user.id : ''); }
  function readSeen() { try { return Number(localStorage.getItem(seenKey()) || 0); } catch (e) { return 0; } }
  function writeSeen(t) { try { localStorage.setItem(seenKey(), String(t)); } catch (e) {} }
  function followedProducts() {
    return products.filter(function (p) { return p.in_stock && (follows.brand[p.brand_id] || follows.category[p.category_slug]); })
      .sort(function (a, b) { return Date.parse(b.created_at) - Date.parse(a.created_at); });
  }
  function renderFollowing() {
    document.title = 'Following — Buy From Here';
    currentSource = 'following';
    var head = '<section class="intro"><div><p class="eyebrow">Following</p><h1>New from the brands<br>and categories you follow.</h1></div></section>';
    if (!user) {
      app.innerHTML = '<div class="home">' + head + '<div class="panel narrow" style="text-align:center"><p>Follow a brand or a category and its newest pieces show up here.</p>' +
        '<button type="button" class="btn btn-dark" id="following-signin">Sign in to start following</button></div></div>';
      document.getElementById('following-signin').addEventListener('click', function () { rememberAfterSignIn({ route: '#/following' }); openSignIn(); });
      return;
    }
    var fb = brands.filter(function (b) { return follows.brand[b.id]; });
    var fc = cats.filter(function (c) { return follows.category[c.slug]; });
    if (!fb.length && !fc.length) {
      app.innerHTML = '<div class="home">' + head + '<div class="panel narrow" style="text-align:center"><p>You’re not following anything yet. Open a brand or a category and choose <strong>Follow</strong>.</p>' +
        '<a href="#/brands" class="btn btn-dark btn-link">Browse brands</a></div></div>';
      return;
    }
    var list = followedProducts();
    var seenBefore = lastSeen;
    app.innerHTML = '<div class="home">' + head +
      '<div class="following-list" aria-label="You follow">' +
        fb.map(function (b) { return '<span class="follow-chip"><a href="#/b/' + esc(b.slug) + '">' + esc(b.name) + '</a><button type="button" class="link" data-follow="brand:' + b.id + '" aria-label="Unfollow ' + esc(b.name) + '">Unfollow</button></span>'; }).join('') +
        fc.map(function (c) { return '<span class="follow-chip"><a href="#/c/' + esc(c.slug) + '">' + esc(c.name) + '</a><button type="button" class="link" data-follow="category:' + esc(c.slug) + '" aria-label="Unfollow ' + esc(c.name) + '">Unfollow</button></span>'; }).join('') +
      '</div>' +
      (list.length ? '<section class="feed" aria-label="Newest pieces">' + list.slice(0, shown).map(function (p) {
          return pin(p, { isNew: seenBefore && Date.parse(p.created_at) > seenBefore });
        }).join('') + '</section>' + moreButton(list.length)
        : '<p class="empty">Nothing new yet from what you follow.</p>') +
      '</div>';
    wireMore(renderFollowing);
    var newest = list.length ? Date.parse(list[0].created_at) : 0;
    if (newest > lastSeen) { lastSeen = newest; writeSeen(newest); }
    updateHeader();
  }

  function renderHowItWorks() {
    document.title = 'How it works — Buy From Here';
    currentSource = 'about';
    app.innerHTML = '<div class="home"><section class="intro"><div><p class="eyebrow">How it works</p><h1>We find it.<br>You buy it from the brand.</h1></div></section>' +
      '<div class="prose">' +
        '<p>Buy From Here brings together clothes, shoes, bags, jewelry and watches from brands we like, so you can browse them in one place.</p>' +
        '<h2>Where you pay</h2><p>We don’t sell anything ourselves. When you tap <strong>Buy</strong>, you go to the brand’s own website and check out there. The brand handles payment, shipping, returns and customer service.</p>' +
        '<h2>How we make money</h2><p>Many of our links are affiliate links. If you buy something after clicking one, the brand may pay us a small commission. It doesn’t change the price you pay, and brands can’t pay to change what we show you.</p>' +
        '<h2>Prices and stock</h2><p>We update products every day, but the brand’s site always has the final price and stock. Prices are shown in the currency the brand sells in (Canadian or US dollars).</p>' +
        '<h2>Your account</h2><p>You can browse without an account. Signing in just lets you save pieces and follow brands and categories across your devices.</p>' +
      '</div></div>';
  }

  // ---------- Product pop-up ----------
  var pd = document.getElementById('product-dialog');
  var openId = null;
  function showProduct(id) {
    var p = productById[id];
    if (!p) { toast('That piece isn’t available any more.'); return; }
    openId = id;
    var b = p.brand || { name: 'the brand', slug: '' };
    var img = document.getElementById('pd-img');
    img.innerHTML = p.image_url
      ? '<img src="' + esc(window.bfhImg(p.image_url, { w: 1100 })) + '" data-raw="' + esc(p.image_url) + '" alt="' + esc(p.name) + '">'
      : placeholder(p);
    img.setAttribute('data-pid', p.id);
    var more = b.products ? b.products.filter(function (x) { return x.id !== p.id && x.in_stock; }).slice(0, 3) : [];
    var onSale = p.sale_price != null && Number(p.sale_price) < Number(p.price);
    document.getElementById('pd-side').innerHTML =
      '<div class="pd">' +
        '<div class="look-head">' + (b.slug ? '<a class="pd-brand" href="#/b/' + esc(b.slug) + '" data-close-pd>' + esc(b.name) + '</a>' : '<span></span>') +
          '<button type="button" class="icon-btn close-btn" data-close-pd aria-label="Close">&times;</button></div>' +
        '<h2 id="pd-name">' + esc(p.name) + '</h2>' + priceHtml(p) +
        '<div class="pd-meta">' + (p.cat ? '<span>' + esc(p.cat.name) + '</span>' : '') +
          '<span>Price in ' + (p.currency === 'USD' ? 'US dollars' : 'Canadian dollars') + '</span>' +
          (onSale ? '<span>On sale</span>' : '') + (p.in_stock ? '' : '<span>Sold out for now</span>') + '</div>' +
        (p.description ? '<p class="pd-desc">' + esc(p.description) + '</p>' : '') +
        '<a class="btn btn-dark buy-btn" href="' + esc(p.affiliate_url) + '" target="_blank" rel="sponsored noopener" data-buy="' + p.id + '"' + (p.in_stock ? '' : ' aria-disabled="true" tabindex="-1"') + '>' +
          (p.in_stock ? 'Buy at ' + esc(b.name) + ' <span aria-hidden="true">↗</span>' : 'Sold out') + '</a>' +
        '<p class="disclosure">You’ll check out on ' + esc(b.name) + '’s own site. We may earn a commission if you buy, at no extra cost to you.</p>' +
        '<div class="pd-actions">' +
          '<button type="button" class="btn" data-save="' + p.id + '" aria-pressed="' + !!saved[p.id] + '">' + (saved[p.id] ? 'Saved ✓' : 'Save') + '</button>' +
          (p.brand ? '<button type="button" class="btn" data-follow="brand:' + p.brand_id + '" aria-pressed="' + !!follows.brand[p.brand_id] + '">' + (follows.brand[p.brand_id] ? 'Following ✓' : 'Follow brand') + '</button>' : '') +
          '<button type="button" class="btn" id="pd-share">Share</button>' +
        '</div>' +
        (more.length ? '<div class="pd-more"><h3>More from ' + esc(b.name) + '</h3><div class="pd-more-row">' + more.map(function (x) {
            return '<button type="button" data-open="' + x.id + '" data-pid="' + x.id + '"><span class="pin-photo">' + photo(x, { img: { w: 240, h: 300, crop: 'pad', gravity: 'center' } }) + '</span><span class="n">' + esc(x.name) + '</span></button>';
          }).join('') + '</div></div>' : '') +
      '</div>';
    document.getElementById('pd-share').addEventListener('click', function (e) {
      var url = location.origin + location.pathname + '#/p/' + p.id;
      if (navigator.share) navigator.share({ title: p.name, url: url }).catch(function () {});
      else if (navigator.clipboard) { navigator.clipboard.writeText(url); e.target.textContent = 'Link copied'; }
    });
    if (!pd.open) pd.showModal();
    pd.querySelector('.look-side').scrollTop = 0;
  }
  pd.addEventListener('click', function (e) {
    if (e.target === pd || e.target.closest('[data-close-pd]')) pd.close();
  });
  pd.addEventListener('close', function () {
    openId = null;
    if (/^#\/p\//.test(location.hash)) history.replaceState(null, '', '#/');
  });

  // Buy clicks: log the click (anonymous unless signed in), then the link opens the brand's site.
  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-buy]');
    if (!a) return;
    var p = productById[a.getAttribute('data-buy')];
    if (!p || !p.in_stock) { e.preventDefault(); return; }
    db.from('clicks').insert({ product_id: p.id, brand_id: p.brand_id, source: currentSource + '-popup' }).then(function () {}, function () {});
  });

  // ---------- Saving and following (sign-in checked against the database every time) ----------
  function rememberAfterSignIn(o) {
    try { localStorage.setItem('bfh_after_signin', JSON.stringify(Object.assign({ at: Date.now() }, o))); } catch (e) {}
  }
  async function liveUser() {
    var r = await db.auth.getSession();
    var s = r.data && r.data.session;
    if (!s) { var rr = await db.auth.refreshSession(); s = rr.data && rr.data.session; }
    return s ? s.user : null;
  }
  // Runs a save/follow change for the signed-in shopper, refreshing a stale sign-in once before giving up.
  async function authedChange(intent, why, attempt) {
    if (!user) { rememberAfterSignIn(intent); openSignIn(why); return false; }
    var me = await liveUser();
    if (!me) return signedOutAgain(intent, why);
    if (me.id !== user.id) { user = me; await loadMine(); }
    var r = await attempt(me.id);
    if (r.error && r.error.code !== '23505') {
      var rr = await db.auth.refreshSession();
      if (!rr.data || !rr.data.session) return signedOutAgain(intent, why);
      r = await attempt(rr.data.session.user.id);
      if (r.error && r.error.code !== '23505') {
        if (r.error.code === '42501' || r.status === 401) return signedOutAgain(intent, why);
        toast('That didn’t go through. Please try again.');
        return false;
      }
    }
    return true;
  }
  function signedOutAgain(intent, why) {
    rememberAfterSignIn(intent);
    user = null; saved = {}; follows = { brand: {}, category: {} };
    updateHeader();
    openSignIn('Your sign-in on this page has expired. Please sign in again. ' + why);
    return false;
  }
  async function toggleSave(id) {
    var p = productById[id]; if (!p) return false;
    var on = !!saved[id];
    var ok = await authedChange({ route: location.hash || '#/', save: id }, 'Sign in to save ' + p.name + '. Your saved pieces stay with you on any device.', function (uid) {
      return on ? db.from('saved_items').delete().eq('user_id', uid).eq('product_id', id)
                : db.from('saved_items').insert({ user_id: uid, product_id: id });
    });
    if (!ok) return false;
    if (on) delete saved[id]; else saved[id] = true;
    updateHeader();
    return true;
  }
  async function toggleFollow(kind, key) {
    var name = kind === 'brand' ? (brandById[key] || {}).name : (catBySlug[key] || {}).name;
    if (!name) return false;
    var on = !!follows[kind][key];
    var col = kind === 'brand' ? 'brand_id' : 'category_slug';
    var ok = await authedChange({ route: location.hash || '#/', follow: kind + ':' + key }, 'Sign in to follow ' + name + '. New pieces will show up under Following.', function (uid) {
      if (on) return db.from('follows').delete().eq('user_id', uid).eq(col, key);
      var row = { user_id: uid }; row[col] = key;
      return db.from('follows').insert(row);
    });
    if (!ok) return false;
    if (on) delete follows[kind][key]; else follows[kind][key] = true;
    updateHeader();
    return true;
  }
  // Hearts and follow buttons anywhere on the page or in the pop-up.
  document.addEventListener('click', async function (e) {
    var s = e.target.closest('[data-save]');
    var f = e.target.closest('[data-follow]');
    var o = e.target.closest('[data-open]');
    if (s) {
      e.preventDefault();
      if (s.disabled) return; s.disabled = true;
      var id = s.getAttribute('data-save');
      var ok = await toggleSave(id);
      s.disabled = false;
      if (ok) refreshAfterChange();
      if (ok && saved[id]) toast('Saved. Find it any time under the heart at the top.');
    } else if (f) {
      e.preventDefault();
      if (f.disabled) return; f.disabled = true;
      var parts = f.getAttribute('data-follow').split(':');
      var ok2 = await toggleFollow(parts[0], parts.slice(1).join(':'));
      f.disabled = false;
      if (ok2) refreshAfterChange();
    } else if (o) {
      showProduct(o.getAttribute('data-open'));
    }
  });
  // Redraw the page (keeping the scroll spot) and the pop-up if it's open.
  function refreshAfterChange() {
    var y = window.scrollY;
    if (!/^#\/p\//.test(location.hash)) route(true);
    window.scrollTo(0, y);
    if (openId) showProduct(openId);
  }

  // After signing in (often in a new tab from the email link), go back and finish what was started.
  async function finishAfterSignIn() {
    if (!user) return;
    var p = null;
    try { p = JSON.parse(localStorage.getItem('bfh_after_signin') || 'null'); localStorage.removeItem('bfh_after_signin'); } catch (e) {}
    if (!p || Date.now() - (p.at || 0) > 2 * 60 * 60 * 1000) return;
    if (p.route && location.hash !== p.route) history.replaceState(null, '', p.route);
    var msg = '';
    if (p.save && productById[p.save] && !saved[p.save]) {
      if (await toggleSave(p.save)) msg = 'Saved ' + productById[p.save].name + '. Find it under the heart at the top.';
    }
    if (p.follow) {
      var parts = p.follow.split(':'), kind = parts[0], key = parts.slice(1).join(':');
      if (!follows[kind][key] && await toggleFollow(kind, key)) {
        var name = kind === 'brand' ? brandById[key].name : catBySlug[key].name;
        msg = 'You’re now following ' + name + '. New pieces will show under Following.';
      }
    }
    route();
    if (msg) toast(msg);
  }

  async function loadMine() {
    saved = {}; follows = { brand: {}, category: {} };
    if (!user) return;
    var r = await Promise.all([
      db.from('saved_items').select('product_id').eq('user_id', user.id),
      db.from('follows').select('brand_id, category_slug').eq('user_id', user.id)
    ]);
    (r[0].data || []).forEach(function (x) { saved[x.product_id] = true; });
    (r[1].data || []).forEach(function (x) { if (x.brand_id) follows.brand[x.brand_id] = true; else follows.category[x.category_slug] = true; });
  }

  function updateHeader() {
    document.getElementById('account-btn').textContent = user ? 'Account' : 'Sign in';
    var n = Object.keys(saved).filter(function (id) { return productById[id]; }).length;
    document.getElementById('saved-count').textContent = n;
    document.getElementById('saved-btn').setAttribute('aria-label', 'Saved, ' + plural(n, 'piece'));
    var badgeEl = document.getElementById('new-count');
    var fresh = (user && lastSeen) ? followedProducts().filter(function (p) { return Date.parse(p.created_at) > lastSeen; }).length : 0;
    badgeEl.hidden = !fresh || location.hash === '#/following';
    badgeEl.textContent = fresh > 99 ? '99+' : String(fresh);
  }

  // ---------- Sign-in and account dialogs ----------
  var signinDialog = document.getElementById('signin-dialog');
  function openSignIn(why) {
    window.bfhSignIn.mount(document.getElementById('signin-mount'), { db: db, why: why || '', returnUrl: location.origin + location.pathname });
    if (pd.open) pd.close();
    if (!signinDialog.open) signinDialog.showModal();
  }
  document.getElementById('signin-close').addEventListener('click', function () { signinDialog.close(); });
  var accountDialog = document.getElementById('account-dialog');
  document.getElementById('account-btn').addEventListener('click', function () {
    if (!user) { rememberAfterSignIn({ route: location.hash || '#/' }); openSignIn(); return; }
    document.getElementById('account-email').textContent = 'Signed in as ' + (user.email || '');
    accountDialog.showModal();
  });
  document.getElementById('account-close').addEventListener('click', function () { accountDialog.close(); });
  accountDialog.querySelectorAll('[data-close-account]').forEach(function (a) { a.addEventListener('click', function () { accountDialog.close(); }); });
  document.getElementById('account-signout').addEventListener('click', async function () { await db.auth.signOut(); accountDialog.close(); toast('You’re signed out.'); });
  [signinDialog, accountDialog].forEach(function (d) { d.addEventListener('click', function (e) { if (e.target === d) d.close(); }); });

  // ---------- Routing ----------
  var lastPath = null;
  function route(keepPaging) {
    var path = location.hash.replace(/^#\/?/, '');
    if (!keepPaging && path !== lastPath) { shown = PAGE; if (path.indexOf('search/') !== 0) sortBy = 'new'; }
    var samePage = path === lastPath;
    lastPath = path;
    if (path.indexOf('p/') === 0) {
      var pid = path.slice(2);
      if (!app.querySelector('.home, .profile')) renderHome();
      setNav('discover');
      showProduct(pid);
      updateHeader();
      return;
    }
    if (pd.open && !keepPaging) pd.close();
    if (path.indexOf('search/') === 0) {
      var q = decodeURIComponent(path.slice(7));
      var box = document.getElementById('search');
      if (box && document.activeElement !== box) box.value = q;
      setNav(''); renderSearch(q);
    } else if (path === 'following') { setNav('following'); renderFollowing(); }
    else if (path === 'saved') { setNav(''); renderSaved(); }
    else if (path === 'brands') { setNav('brands'); renderBrands(); }
    else if (path === 'how-it-works') { setNav(''); renderHowItWorks(); }
    else if (path.indexOf('b/') === 0 && brandBySlug[path.slice(2)]) { setNav('brands'); renderBrandPage(brandBySlug[path.slice(2)]); }
    else if (path.indexOf('c/') === 0 && catBySlug[path.slice(2)]) { setNav('discover'); renderCategory(catBySlug[path.slice(2)]); }
    else { setNav('discover'); renderHome(); }
    if (!keepPaging && !samePage) window.scrollTo(0, 0);
    if (path.indexOf('search/') !== 0) { var sb = document.getElementById('search'); if (sb && document.activeElement !== sb) sb.value = ''; }
    updateHeader();
  }

  // ---------- Loading the catalogue ----------
  // Supabase returns at most 1,000 rows per request, so products load in pages.
  async function loadAllProducts() {
    var all = [], size = 1000;
    for (var from = 0; ; from += size) {
      var r = await db.from('products')
        .select('id, brand_id, name, description, category_slug, price, sale_price, currency, image_url, affiliate_url, in_stock, is_featured, created_at')
        .order('created_at', { ascending: false }).order('id').range(from, from + size - 1);
      if (r.error) throw r.error;
      all = all.concat(r.data || []);
      if (!r.data || r.data.length < size) break;
    }
    return all;
  }
  async function load() {
    app.innerHTML = '<p class="empty">Loading…</p>';
    try {
      var res = await Promise.all([
        db.from('categories').select('slug, name, grp, sort').order('sort'),
        db.from('brands').select('id, slug, name, bio, website').order('name'),
        loadAllProducts()
      ]);
      if (res[0].error || res[1].error) throw (res[0].error || res[1].error);
      cats = res[0].data || [];
      brands = res[1].data || [];
      catBySlug = {}; cats.forEach(function (c) { catBySlug[c.slug] = c; });
      brandById = {}; brandBySlug = {};
      brands.forEach(function (b) { b.products = []; brandById[b.id] = b; brandBySlug[b.slug] = b; });
      products = res[2].filter(function (p) { return brandById[p.brand_id]; });
      productById = {};
      products.forEach(function (p) {
        p.brand = brandById[p.brand_id];
        p.cat = catBySlug[p.category_slug] || null;
        p.brand.products.push(p);
        productById[p.id] = p;
      });
    } catch (e) {
      app.innerHTML = '<div class="panel narrow" style="text-align:center"><p>We couldn’t load the shop just now. Please check your connection and try again.</p><button type="button" class="btn btn-dark" id="retry">Try again</button></div>';
      document.getElementById('retry').addEventListener('click', load);
      return;
    }
    route();
    finishAfterSignIn();
  }

  // When you come back to this tab, or sign in/out in another tab, re-check the real sign-in.
  async function resyncUser() {
    var r = await db.auth.getSession();
    var now = r.data && r.data.session ? r.data.session.user : null;
    if ((now && now.id) === (user && user.id)) return;
    user = now;
    lastSeen = readSeen();
    await loadMine();
    if (products.length) route(true); else updateHeader();
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) resyncUser(); });
  window.addEventListener('storage', function (e) { if (e.key && e.key.indexOf('sb-') === 0) resyncUser(); });

  var started = false;
  db.auth.onAuthStateChange(function (_evt, session) {
    if (!started) return;
    var was = user && user.id;
    user = session ? session.user : null;
    if ((user && user.id) === was) return;
    window.bfhWelcome(user);
    lastSeen = readSeen();
    loadMine().then(function () {
      if (signinDialog.open && user) signinDialog.close();
      if (products.length) { route(true); finishAfterSignIn(); } else updateHeader();
    });
  });

  // Search box: results update as you type
  var searchBox = document.getElementById('search');
  var searchTimer = null;
  function runSearch(push) {
    var q = searchBox.value.trim();
    var target = q ? '#/search/' + encodeURIComponent(q) : '#/';
    if (location.hash === target) return;
    if (push) location.hash = target;
    else { history.replaceState(null, '', target); route(); }
  }
  searchBox.addEventListener('input', function () {
    clearTimeout(searchTimer);
    var fresh = location.hash.indexOf('#/search/') !== 0;
    searchTimer = setTimeout(function () { runSearch(fresh); }, 200);
  });
  searchBox.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); clearTimeout(searchTimer); runSearch(location.hash.indexOf('#/search/') !== 0); }
  });

  window.addEventListener('hashchange', function () { route(); });
  db.auth.getSession().then(async function (r) {
    user = r.data.session ? r.data.session.user : null;
    window.bfhWelcome(user);
    lastSeen = readSeen();
    await loadMine();
    started = true;
    load();
  });
})();
