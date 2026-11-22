import subprocess, time, sys
from playwright.sync_api import sync_playwright

import os
HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(HERE)
MOCK = open(os.path.join(HERE, 'mock-supabase.js')).read()
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8765', '--directory', SITE], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
os.makedirs(os.path.join(HERE, 'shots'), exist_ok=True)
results, errors = [], []
def check(name, ok, extra=''):
    results.append(('PASS' if ok else 'FAIL') + '  ' + name + (('  -> ' + str(extra)) if extra and not ok else ''))

def route(r):
    u = r.request.url
    if 'cdn.jsdelivr.net' in u: return r.fulfill(body=MOCK, content_type='application/javascript')
    if u.startswith('http://localhost:8765'): return r.continue_()
    return r.abort()

try:
  with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 1360, 'height': 900})
    ctx.route('**/*', route)
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: m.type == 'error' and 'net::ERR_FAILED' not in m.text and 'Failed to load resource' not in m.text and errors.append('console: ' + m.text))
    pg.goto('http://localhost:8765/index.html')
    pg.wait_for_selector('.feed .pin')
    pins = pg.locator('.feed .pin').count()
    check('home feed shows in-stock pieces', pins == 26, pins)
    check('featured piece comes first', 'Pleated maxi dress' in pg.locator('.feed .pin').first.inner_text())
    check('footer has commission note', 'may earn a commission' in pg.locator('footer').inner_text())
    pg.screenshot(path=os.path.join(HERE, 'shots', '01-home.png'))

    # category
    pg.click('.cat-chips >> text=Bags')
    pg.wait_for_selector('.shop-grid')
    check('bags category shows 4 bags', pg.locator('.shop-grid .shop-card').count() == 4, pg.locator('.shop-grid .shop-card').count())
    pg.select_option('#sort', 'low')
    prices = pg.locator('.shop-card .price').all_inner_texts()
    check('sort by price works', len(prices) == 4, prices)
    # sold-out piece at the end of its brand page
    pg.goto('http://localhost:8765/index.html#/b/maison-ardent')
    pg.wait_for_selector('.shop-card')
    last = pg.locator('.shop-card').last
    check('sold-out piece is last and labelled', 'SOLD OUT' in last.inner_text().upper(), last.inner_text())

    # typo-tolerant search
    pg.fill('#search', 'pusre')
    pg.wait_for_function("location.hash.indexOf('#/search/') === 0")
    pg.wait_for_selector('.shop-grid')
    txt = pg.locator('#app').inner_text()
    check('search "pusre" finds bags', 'Structured tote' in txt and 'Bags' in txt, txt[:200])
    pg.fill('#search', 'hils')
    pg.wait_for_timeout(400)
    check('search "hils" finds heels', 'Strappy heels' in pg.locator('#app').inner_text())
    pg.fill('#search', 'lune')
    pg.wait_for_timeout(400)
    check('search finds a brand', pg.locator('a.chip[href="#/b/lune-atelier"]').count() == 1)

    # product pop-up + Buy
    pg.goto('http://localhost:8765/index.html#/')
    pg.wait_for_selector('.feed .pin')
    pg.locator('[data-open="p1"]').first.click()
    pg.wait_for_selector('#product-dialog[open]')
    buy = pg.locator('#product-dialog [data-buy]')
    check('Buy button names the brand', 'Buy at Maison Ardent' in buy.inner_text(), buy.inner_text())
    check('Buy link is the affiliate link, new tab, sponsored', buy.get_attribute('href') == 'https://example.com/aff?p=1' and buy.get_attribute('target') == '_blank' and 'sponsored' in buy.get_attribute('rel'))
    check('commission note near Buy', 'may earn a commission' in pg.locator('#product-dialog .disclosure').inner_text())
    pg.screenshot(path=os.path.join(HERE, 'shots', '02-product.png'))
    with ctx.expect_page() as newp: buy.click()
    newp.value.close()
    pg.wait_for_timeout(200)
    clicks = pg.evaluate('window.__mock.clicks')
    check('Buy click is logged', len(clicks) == 1 and clicks[0]['product_id'] == 'p1' and clicks[0]['brand_id'] == 'b0', clicks)
    # More from brand switches product
    pg.locator('.pd-more-row button').first.click()
    check('More from this brand opens another piece', pg.locator('#pd-name').inner_text() != 'Silk slip dress')
    pg.keyboard.press('Escape')

    # sold-out pop-up: Buy disabled
    pg.goto('http://localhost:8765/index.html#/p/p5')
    pg.wait_for_selector('#product-dialog[open]')
    check('deep link opens the product', pg.locator('#pd-name').inner_text() == 'Silk camisole', pg.locator('#pd-name').inner_text())
    check('sold-out piece has no live Buy', pg.locator('[data-buy]').get_attribute('aria-disabled') == 'true')
    pg.keyboard.press('Escape')
    pg.wait_for_timeout(100)
    check('closing a deep-linked piece clears the link', pg.evaluate('location.hash') == '#/', pg.evaluate('location.hash'))

    # signed-out save -> sign in -> save finishes
    pg.locator('.feed [data-save="p2"]').click()
    pg.wait_for_selector('#signin-dialog[open]')
    check('signed-out save asks to sign in, with reason', 'Sign in to save Wrap midi dress' in pg.locator('#signin-dialog').inner_text())
    pg.screenshot(path=os.path.join(HERE, 'shots', '03-signin.png'))
    pg.fill('#si-email', 'over-limit@test.com'); pg.click('#si-form button[type=submit]'); pg.wait_for_timeout(200)
    m = pg.locator('#si-msg').inner_text()
    check('rate-limit error is in plain words', 'Too many sign-in emails' in m and 'rate limit exceeded' not in m, m)
    pg.click('#si-google'); pg.wait_for_timeout(200)
    check('Google not set up yet: friendly message', 'switched on yet' in pg.locator('#si-msg').inner_text(), pg.locator('#si-msg').inner_text())
    pg.evaluate("window.__mockSignIn('kasra@test.com')")
    pg.wait_for_timeout(600)
    check('sign-in closes the dialog', not pg.locator('#signin-dialog').evaluate('d => d.open'))
    check('the save they tapped is finished after sign-in', any(r['product_id'] == 'p2' for r in pg.evaluate('window.__mock.saved_items')))
    check('saved count shows 1', pg.locator('#saved-count').inner_text() == '1')
    check('welcome back banner', pg.locator('.welcome-pop').count() == 1 and 'Kasra' in pg.locator('.welcome-pop').inner_text())

    # save in pop-up, unsave from heart
    pg.locator('[data-open="p3"]').first.click(); pg.wait_for_selector('#product-dialog[open]')
    pg.locator('#product-dialog [data-save="p3"]').click(); pg.wait_for_timeout(200)
    check('save from pop-up', pg.locator('#product-dialog [data-save="p3"]').inner_text() == 'Saved ✓')
    pg.locator('#product-dialog [data-follow]').click(); pg.wait_for_timeout(200)
    check('follow brand from pop-up', pg.locator('#product-dialog [data-follow]').inner_text() == 'Following ✓')
    pg.keyboard.press('Escape')
    pg.goto('http://localhost:8765/index.html#/saved'); pg.wait_for_selector('.shop-grid')
    check('saved page lists 2 pieces', pg.locator('.shop-grid .shop-card').count() == 2)
    pg.screenshot(path=os.path.join(HERE, 'shots', '04-saved.png'))

    # follow a category, following page
    pg.goto('http://localhost:8765/index.html#/c/shoes'); pg.wait_for_selector('[data-follow="category:shoes"]')
    pg.click('[data-follow="category:shoes"]'); pg.wait_for_timeout(200)
    check('follow category', 'Following' in pg.locator('[data-follow="category:shoes"]').inner_text())
    pg.click('a[data-nav=following]'); pg.wait_for_selector('.following-list')
    ft = pg.locator('#app').inner_text()
    check('Following page lists brand and category', 'Maison Ardent' in ft and 'Shoes' in ft and 'Strappy heels' in ft, ft[:300])
    pg.screenshot(path=os.path.join(HERE, 'shots', '05-following.png'))

    # expired sign-in (link used in another tab): next save asks again, then finishes
    pg.evaluate('window.__mockExpire()')
    pg.goto('http://localhost:8765/index.html#/c/watches'); pg.wait_for_selector('.shop-card')
    pg.locator('[data-save="p27"]').first.click() if pg.locator('[data-save="p27"]').count() else pg.locator('.shop-card [data-save]').first.click()
    pg.wait_for_selector('#signin-dialog[open]')
    check('stale sign-in is caught before saving', 'Sign in' in pg.locator('#signin-dialog').inner_text())
    before = len(pg.evaluate('window.__mock.saved_items'))
    pg.evaluate("window.__mockSignIn('kasra@test.com')"); pg.wait_for_timeout(700)
    check('...and the save finishes after signing in again', len(pg.evaluate('window.__mock.saved_items')) == before + 1)

    # how it works
    pg.click('footer >> text=How it works'); pg.wait_for_selector('.prose')
    check('How it works page', 'commission' in pg.locator('.prose').inner_text())

    # mobile
    m = b.new_page(viewport={'width': 390, 'height': 844}); m.route('**/*', route)
    m.on('pageerror', lambda e: errors.append('mobile pageerror: ' + str(e)))
    m.goto('http://localhost:8765/index.html'); m.wait_for_selector('.feed .pin')
    sw = m.evaluate('document.documentElement.scrollWidth')
    check('mobile has no sideways scroll', sw <= 390, sw)
    m.screenshot(path=os.path.join(HERE, 'shots', '06-mobile.png'))
    m.locator('[data-open="p1"]').first.click(); m.wait_for_selector('#product-dialog[open]')
    m.screenshot(path=os.path.join(HERE, 'shots', '07-mobile-product.png'))
    b.close()
finally:
    srv.terminate()
print('\n'.join(results))
print('ERRORS:', errors if errors else 'none')
