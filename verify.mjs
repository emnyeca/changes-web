import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
const browser = await chromium.launch({channel:process.env.CHROME_CHANNEL || 'chrome'});
try {
  const page = await browser.newPage();
  await page.goto(process.env.APP_URL || 'http://127.0.0.1:5186');
  const xml = '<score-partwise><work><work-title>Two chords</work-title></work><part><measure><harmony><root><root-step>D</root-step></root><kind text="m7">minor-seventh</kind></harmony></measure></part></score-partwise>';
  await page.locator('#files').setInputFiles({name:'test.musicxml',mimeType:'application/xml',buffer:Buffer.from(xml)});
  await page.getByRole('button',{name:'Two chords'}).click();
  assert.equal(await page.locator('.bar').textContent(),'Dm7');
  await page.locator('#lang').selectOption('ja');
  await page.reload();
  await page.getByRole('button',{name:'Two chords'}).waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'),'ja');
  const downloading=page.waitForEvent('download');
  await page.locator('#save').click();
  const backup=await readFile(await (await downloading).path());
  const fresh=await browser.newPage();
  await fresh.goto(page.url());
  fresh.on('dialog',dialog=>dialog.accept());
  await fresh.locator('#restore').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:backup});
  await fresh.getByRole('button',{name:'Two chords'}).click();
  assert.equal(await fresh.locator('.bar').textContent(),'Dm7');
  console.log('MusicXML import, language persistence and cross-profile backup restore passed');
} finally {await browser.close();}
