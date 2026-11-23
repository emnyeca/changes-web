import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome'});
try {
  const page=await browser.newPage({locale:'en-US'});
  await page.goto(process.env.APP_URL||'http://127.0.0.1:5186');
  await page.getByText('Create chart',{exact:true}).first().click();
  await page.locator('#newTitle').fill('EUB TEST');
  await page.locator('#newCells').fill('Dm7 | G7 || Cmaj7 | Fmaj7');
  await page.locator('#new').click();
  await page.getByRole('button',{name:'Generate',exact:true}).click();
  await page.getByRole('button',{name:'Download .syx'}).waitFor();
  assert.equal(await page.locator('table tr').count(),2);
  await page.getByLabel('Arrangement').selectOption('bundle');
  await page.getByRole('button',{name:'Generate',exact:true}).click();
  await page.getByRole('button',{name:'Download .syx'}).waitFor();
  assert.equal(await page.locator('table tr').count(),3);
  const names=await page.locator('table td:first-child').allTextContents();
  assert.equal(new Set(names).size,2);
  console.log('Editor, generate, single and multipart pattern table:',names);
  const old='irealbook://'+encodeURIComponent('Chart 1=EUB=Swing=C==|C7 |F7 Z===Chart 2=EUB=Swing=C==|Dm7 |G7 Z===Test');
  await page.locator('#files').setInputFiles({name:'list.txt',mimeType:'text/plain',buffer:Buffer.from(old)});
  await page.getByRole('button',{name:'Chart 1',exact:true}).waitFor();
  await page.getByRole('button',{name:'Chart 2',exact:true}).click();
  console.log('iReal playlist retained two numbered titles');
} finally {await browser.close();}
