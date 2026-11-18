const puppeteer=require('puppeteer');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await puppeteer.launch({headless:true,timeout:15000,protocolTimeout:20000});
 try{
  const page=await browser.newPage();await page.setViewport({width:390,height:844,isMobile:true,deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:3001/',{waitUntil:'networkidle0',timeout:60000});
  assert.equal(await page.$eval('select[aria-label="Choose rankings week"]',e=>e.value),'10');
  assert.equal(await page.$$eval('.deep-ranking',e=>e.length),12);
  await page.$eval('.deep-ranking',e=>e.open=true);
  assert(await page.$eval('.deep-ranking-content',e=>e.innerText.includes('Use depth pieces to take a stab at another star')));
  assert(await page.$eval('.deep-ranking-content',e=>e.innerText.includes('Roster coverage')));
  assert(await page.$eval('.deep-ranking-score',e=>e.innerText.includes('112.11')));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Mobile horizontal overflow');
  await page.screenshot({path:'tmp/week10-mobile.png'});
  await page.select('select[aria-label="Choose rankings week"]','9');
  assert.equal(await page.$$eval('.deep-ranking',e=>e.length),12);
  await page.select('select[aria-label="Choose rankings week"]','10');
  const tabLabels=['Trades','Projections','Positions','Averages','Strength of schedule','Perfect lineup'];
  for(const label of tabLabels){
   const clicked=await page.evaluate(label=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===label);if(!b)return false;b.click();return true;},label);assert(clicked,'Missing tab '+label);
   await page.waitForFunction(()=>document.body.innerText.includes('1–10')||document.body.innerText.includes('through Week 10'),{timeout:15000});
   const text=await page.$eval('main',e=>e.innerText);
   assert(!text.includes('temporarily unavailable'),label+' analytics unavailable');
   if(label==='Averages')await page.screenshot({path:'tmp/week10-averages-mobile.png'});
   console.log('Verified tab:',label);
  }
  const response=await page.goto('http://localhost:3001/rankings/ucdegens-week-10.pdf');assert.equal(response.status(),200);
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('Verified Week 10 default, 12 edited entries, Week 9 archive, all analytics tabs through Week 10, mobile fit, PDF download, no runtime errors.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
