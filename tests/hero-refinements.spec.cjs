const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8888';let browser;
before(async()=>{browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});});after(async()=>{await browser?.close();});
async function page(options={}){const {route='/',...settings}=options;const p=await browser.newPage(settings);p.setDefaultTimeout(1800);await p.goto(base+route);return p;}
test('the first screen leads with mortgage help, bold type, the logo, and D Magazine recognition',async()=>{
 const p=await page({viewport:{width:1440,height:1000}});const hero=p.locator('.texas-hero');
 assert.match(await hero.getByRole('heading',{level:1}).innerText(),/home loans/i);
 assert.ok(await hero.getByRole('heading',{level:1}).evaluate(e=>parseInt(getComputedStyle(e).fontWeight)>=700));
 assert.ok(await p.getByRole('img',{name:'Funded By Pyles Texas home loan logo'}).isVisible());
 assert.match(await hero.innerText(),/D Magazine/);for(const year of ['2024','2025','2026'])assert.match(await hero.innerText(),new RegExp(year));
 await p.close();
});
test('each hub actually zooms into its region, exposes local places, and returns to the statewide view',async()=>{
 const p=await page({reducedMotion:'reduce'});const map=p.locator('.texas-map');
 for(const [name,nearby,attraction]of[['DFW','Frisco','Kimbell'],['Houston','The Woodlands','Space Center'],['Austin','Round Rock','Barton Springs'],['San Antonio','New Braunfels','River Walk'],['El Paso','Socorro','Franklin Mountains']]){
  await p.getByRole('tab',{name,exact:true}).click();const box=(await map.getAttribute('viewBox')).split(/\s+/).map(Number);assert.ok(box[2]<240,'zoomed width for '+name);
  assert.ok(await map.getByText(nearby,{exact:true}).isVisible());assert.match(await p.getByRole('tabpanel').innerText(),new RegExp(attraction));
  await p.getByRole('button',{name:'View all Texas',exact:true}).click();assert.equal((await map.getAttribute('viewBox')).split(/\s+/).map(Number)[2],560);
 }
 await p.close();
});
test('rapid hub selections settle on the last region without old animation overwriting it',async()=>{
 const p=await page();await p.getByRole('tab',{name:'Houston',exact:true}).click();await p.getByRole('tab',{name:'Austin',exact:true}).click();await p.getByRole('tab',{name:'El Paso',exact:true}).click();
 await p.waitForFunction(()=>document.querySelector('.texas-map').dataset.zoom==='el-paso');const x=await p.locator('.texas-map').getAttribute('viewBox');await p.waitForTimeout(1000);assert.equal(await p.locator('.texas-map').getAttribute('viewBox'),x);await p.close();
});
test('each mortgage goal opens an email addressed to Neal with the selected goal',async()=>{
 const p=await page({route:'/programs/'});for(const label of ['Buy a home','Refinance my home','Finance an investment']){const link=p.locator('.goal-email').filter({hasText:label});assert.match(await link.getAttribute('href'),/^mailto:npyles@lonestarfinancing\.com\?subject=/);assert.match(decodeURIComponent(await link.getAttribute('href')),new RegExp(label==='Buy a home'?'buy':label==='Refinance my home'?'refinance':'investment','i'));}assert.equal(await p.locator('#goals input').count(),0);await p.close();
});
test('search engines get unique homepage metadata, mortgage content, factual recognition, and valid JSON-LD',async()=>{
 const p=await page({javaScriptEnabled:false});assert.match(await p.title(),/Texas Home Loans/);assert.equal(await p.locator('link[rel="canonical"]').getAttribute('href'),'https://nealpyles.com/');
 const data=await p.locator('script[type="application/ld+json"]').allTextContents();const parsed=data.map(JSON.parse);const person=parsed.find(x=>x['@type']==='Person');assert.ok(person);assert.equal(person.award.length,3);
 assert.ok(await p.getByRole('link',{name:'Start your application',exact:true}).isVisible());assert.match(await p.locator('.home-program-grid').innerText(),/refinance/i);await p.close();
});

test('the revised font system keeps body copy and controls readable on mobile and desktop',async()=>{
 for(const width of [390,1440]){
  const p=await page({viewport:{width,height:1000},reducedMotion:'reduce'});
  const type=await p.locator('.texas-copy h1').evaluate(e=>getComputedStyle(e).fontFamily);
  assert.match(type,/Barlow Condensed/);
  for(const selector of ['.texas-intro','.hub-description','.home-advisor p:not(.site-kicker)','.hub-discover>p:not(.atlas-kicker)'])assert.ok(await p.locator(selector).first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=17),selector+' must be at least 17px');
  for(const selector of ['.hero-secondary','.hub-tabs button','.fact-source','.hero-proof span','.hero-recognition>span>span','.home-programs .site-text-link'])assert.ok(await p.locator(selector).first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize)>=14),selector+' must be at least 14px');
  await p.getByRole('tab',{name:'Houston',exact:true}).click();
  const label=await p.locator('.local-map-place text').filter({hasText:'The Woodlands'}).evaluate(e=>{const r=e.getBoundingClientRect();return{height:r.height,width:r.width}});
  assert.ok(label.height>=14,'map labels must render at a readable size');
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no overflow at '+width);await p.close();
 }
});
