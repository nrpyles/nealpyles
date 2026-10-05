const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8888';
let browser;
before(async () => { browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']}); });
after(async () => { await browser?.close(); });

test('hub selection updates the local guide and dated facts without losing the application action', async () => {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 page.setDefaultTimeout(1500);await page.goto(base);
 assert.equal(await page.getByRole('tab').count(),5,'five Texas hubs must be available');
 for(const [label,route,population] of [['Houston','houston','2,304,580'],['Austin','austin','961,855'],['San Antonio','san-antonio','1,434,625'],['El Paso','el-paso','678,815'],['DFW','dallas','1,304,379']]) {
  const tab=page.getByRole('tab',{name:label,exact:true});await tab.click();
  assert.equal(await tab.getAttribute('aria-selected'),'true');
  const panel=page.getByRole('tabpanel');assert.equal(await panel.count(),1);
  assert.match(await panel.innerText(),new RegExp(population));
  assert.match(await panel.innerText(),/2020/);
  assert.equal(await panel.getByRole('link',{name:/mortgage guide/i}).getAttribute('href'),'/'+route+'/');
 }
 assert.ok(await page.getByRole('link',{name:'Start your application',exact:true}).isVisible());
 await page.close();
});

test('hubs work from the map and with keyboard navigation',async()=>{
 const page=await browser.newPage();page.setDefaultTimeout(1500);await page.goto(base);
 await page.getByRole('button',{name:'Select Austin hub',exact:true}).click();
 assert.equal(await page.getByRole('tab',{name:'Austin',exact:true}).getAttribute('aria-selected'),'true');
 await page.getByRole('tab',{name:'Austin',exact:true}).focus();await page.keyboard.press('ArrowRight');
 assert.equal(await page.getByRole('tab',{name:'San Antonio',exact:true}).getAttribute('aria-selected'),'true');
 await page.keyboard.press('End');assert.equal(await page.getByRole('tab',{name:'El Paso',exact:true}).getAttribute('aria-selected'),'true');
 await page.keyboard.press('Home');assert.equal(await page.getByRole('tab',{name:'DFW',exact:true}).getAttribute('aria-selected'),'true');
 await page.close();
});

test('mobile stays within the viewport and its menu can close with Escape',async()=>{
 const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(1500);await page.goto(base);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
 const menu=page.getByRole('button',{name:'Menu',exact:true});await menu.click();
 assert.equal(await menu.getAttribute('aria-expanded'),'true');
 await page.keyboard.press('Escape');assert.equal(await menu.getAttribute('aria-expanded'),'false');
 await page.getByRole('tab',{name:'El Paso',exact:true}).click();assert.ok(await page.getByRole('tabpanel').getByRole('link',{name:/mortgage guide/i}).isVisible());
 await page.close();
});

test('reduced motion makes hub switching immediate and stops hero animations',async()=>{
 const page=await browser.newPage({reducedMotion:'reduce'});page.setDefaultTimeout(1500);await page.goto(base);
 await page.getByRole('tab',{name:'Houston',exact:true}).click();
 assert.equal(await page.getByRole('tab',{name:'Houston',exact:true}).getAttribute('aria-selected'),'true');
 assert.equal(await page.locator('.hero').evaluate(el=>el.getAnimations({subtree:true}).filter(a=>a.playState==='running').length),0);
 await page.close();
});

test('the default guide and mortgage application remain useful without JavaScript',async()=>{
 const page=await browser.newPage({javaScriptEnabled:false});page.setDefaultTimeout(1500);await page.goto(base);
 assert.ok(await page.getByRole('heading',{level:1}).isVisible());
 assert.ok(await page.getByRole('link',{name:'Start your application',exact:true}).isVisible());
 assert.ok(await page.getByRole('link',{name:/DFW mortgage guide/i}).isVisible());
 await page.close();
});

test('Lone Star affiliation is linked in context and the hero has no browser errors',async()=>{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(1500);await page.goto(base);
 const links=page.locator('a[href="https://www.lonestarfinancing.com/"]');assert.ok(await links.count()>=2);
 assert.ok(await page.locator('.hero').getByRole('link',{name:/Lone Star Financing/}).isVisible());
 await page.getByRole('tab',{name:'Houston',exact:true}).click();assert.deepEqual(errors,[]);
 await page.close();
});
