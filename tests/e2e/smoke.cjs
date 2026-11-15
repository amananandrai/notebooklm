/* End-to-end smoke test of the UI against tests/e2e/stub_server.py.
 *   1) python tests/e2e/stub_server.py 8080
 *   2) npm run dev   (or: npx vite preview --port 5173 after a build)
 *   3) node tests/e2e/smoke.cjs
 * Env: BASE_URL (default http://localhost:5173), CHROMIUM_PATH (optional executable). */
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const FIX = path.join(__dirname, 'fixtures');
const NAME = `E2E Project ${Date.now()}`;
let failures = 0;
const check = (name, cond, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` (${extra})` : ''}`); if (!cond) failures++; };

async function generateTab(page, label) {
  await page.getByRole('tab', { name: label, exact: false }).first().click();
  await page.locator('button.btn-generate').first().click();
  return Promise.race([
    page.waitForSelector('.studio-content-badge', { timeout: 30000 }).then(() => 'ok'),
    page.waitForSelector('[role=alert]:has-text("⚠")', { timeout: 30000 }).then(async e => `error: ${await e.textContent()}`),
  ]).catch(() => 'timeout');
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 880 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const pageErrors = [];
  const dialogs = [];
  const generateBodies = [];
  let artifactRequests = 0;
  page.on('pageerror', e => pageErrors.push(e.message));
  page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  page.on('request', r => {
    if (r.url().includes('/api/generate')) generateBodies.push(r.postData() || '');
    if (/\/api\/projects\/[^/]+\/artifacts/.test(r.url())) artifactRequests++;
  });

  // Access key flow (only when the stub server requires a key)
  if (process.env.E2E_ACCESS_KEY) {
    await page.goto(BASE);
    await page.waitForSelector('#access-key-title', { timeout: 10000 }).catch(() => {});
    check('access-key prompt shown to a new visitor', (await page.locator('#access-key-title').count()) > 0);
    await page.fill('input[aria-label="Access key"]', 'wrong-key');
    await page.click('button[type=submit]');
    await page.waitForSelector('text=was not accepted', { timeout: 10000 }).catch(() => {});
    check('wrong key is rejected', (await page.locator('text=was not accepted').count()) > 0);
    await page.fill('input[aria-label="Access key"]', process.env.E2E_ACCESS_KEY);
    await page.click('button[type=submit]');
    await page.waitForSelector('.ph-create-card', { timeout: 10000 });
    check('correct key unlocks the app', (await page.locator('#access-key-title').count()) === 0);
  }

  // Home -> create project -> URL routing
  await page.goto(BASE);
  await page.click('.ph-create-card');
  await page.fill('input[placeholder^="e.g. Machine"]', NAME);
  await page.click('.modal-box button[type=submit]');
  await page.waitForURL(/\/p\/proj_/);
  check('creating a project opens /p/:projectId', /\/p\/proj_[^/]+$/.test(page.url()), page.url());

  const fileInput = page.locator('input[type=file][accept=".pdf"]');
  await fileInput.setInputFiles(path.join(FIX, 'broken.pdf'));
  await page.waitForTimeout(2000);
  check('invalid PDF is rejected with a message', dialogs.some(m => /Could not read this PDF/.test(m)));

  await fileInput.setInputFiles(path.join(FIX, 'report.pdf'));
  await page.waitForURL(/\/p\/proj_[^/]+\/pdf_[^/]+\/mindmap/, { timeout: 15000 });
  check('upload selects the document in the URL', /\/mindmap$/.test(page.url()));

  for (const [label, name] of [['Mind Map', 'mindmap'], ['Audio', 'audio'], ['Slides', 'slides'], ['Slides + Images', 'slides_img'],
    ['Infographic', 'infographic'], ['Report', 'report'], ['Data Table', 'datatable'], ['Study Guide', 'studyguide']]) {
    const res = await generateTab(page, label);
    check(`generate ${name}`, res === 'ok', res);
  }
  check('generate requests carry ids, not document text', generateBodies.length >= 8 && generateBodies.every(b => b.length < 400 && !b.includes('zeppelin')));

  // Deep link + refresh keeps the tab and loads saved results in one request
  await page.getByRole('tab', { name: 'Report' }).click();
  const reportUrl = page.url();
  artifactRequests = 0;
  await page.reload();
  await page.waitForSelector('.studio-content-badge', { timeout: 15000 });
  check('refresh keeps project, document and tab', page.url() === reportUrl && /\/report$/.test(page.url()));
  check('saved artifacts load in a single request', artifactRequests === 1, `${artifactRequests} requests`);
  await page.getByRole('tab', { name: 'Mind Map' }).click();
  await page.goBack();
  check('browser Back returns to the previous tab', /\/report$/.test(page.url()));

  // Exports
  for (const [tabLabel, button, label] of [['Report', /Download/, 'report'], ['Slides', /PPTX/i, 'pptx']]) {
    await page.getByRole('tab', { name: tabLabel }).first().click();
    try {
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.locator('button', { hasText: button }).first().click()]);
      const file = path.join(os.tmpdir(), `e2e_${label}`);
      await dl.saveAs(file);
      check(`export ${label}`, fs.statSync(file).size > 100, dl.suggestedFilename());
    } catch (e) {
      check(`export ${label}`, false, e.message.split('\n')[0]);
    }
  }

  // Chat
  await page.getByRole('tab', { name: 'Chat' }).click();
  await page.locator('textarea').last().fill('What was the zeppelin budget?');
  await page.locator('textarea').last().press('Enter');
  await page.waitForSelector('.chat-citation', { timeout: 15000 }).catch(() => {});
  check('chat answers with a page citation', (await page.locator('.chat-citation').allTextContents()).some(t => /Page 3/.test(t)));
  check('chat output is HTML-escaped', !(await page.evaluate(() => window.__xss)));

  // Second source + project-level synthesis
  await fileInput.setInputFiles(path.join(FIX, 'wind.pdf'));
  await page.waitForTimeout(2500);
  check('second source listed', /Sources \(2\)/.test(await page.locator('body').innerText()));
  const synth = await generateTab(page, 'Synthesis');
  check('cross-document synthesis', synth === 'ok' && (await page.locator('text=Where the Sources Disagree').count()) > 0, synth);
  await page.locator('.ws-source-item').first().click();
  await page.getByRole('tab', { name: 'Synthesis' }).click();
  await page.waitForTimeout(800);
  check('synthesis visible from the other document', (await page.locator('text=Overall Synthesis').count()) > 0);

  // Notes
  await page.locator('button', { hasText: /Notes$/ }).first().click();
  await page.fill('input[placeholder^="Note title"]', 'E2E note');
  await page.fill('textarea[placeholder^="Capture an insight"]', 'Body');
  await page.locator('.ws-notes-form button[type=submit]').click();
  await page.waitForTimeout(800);
  await page.reload();
  await page.locator('button', { hasText: /Notes$/ }).first().click();
  await page.waitForTimeout(1000);
  check('note persists after reload', (await page.locator('text=E2E note').count()) > 0);
  await page.locator('button', { hasText: /Sources/ }).first().click();

  // 3D Video Studio (lazy chunk) in its own tab: software WebGL is heavy in headless browsers
  await page.locator('.ws-source-item').first().click();
  await page.getByRole('tab', { name: 'Mind Map' }).click();
  const studioUrl = page.url().replace(/\/mindmap$/, '/video');
  const studio = await ctx.newPage();
  studio.on('pageerror', e => pageErrors.push(e.message));
  await studio.goto(studioUrl);
  await studio.waitForSelector('canvas', { timeout: 20000 }).catch(() => {});
  check('3D video studio renders (deep link to /video)', (await studio.locator('canvas').count()) > 0);
  await studio.close();

  // Delete source, then project
  await page.locator('.ws-source-del').last().click();
  await page.waitForTimeout(1500);
  check('delete source', /Sources \(1\)/.test(await page.locator('body').innerText()));
  await page.locator('button', { hasText: 'Back' }).first().click();
  await page.waitForURL(`${BASE}/`);
  const card = page.locator('.ph-project-card', { hasText: NAME }).first();
  await card.locator('button').first().click();
  await page.locator('button', { hasText: /Delete/i }).first().click();
  await page.waitForTimeout(1500);
  check('delete project', (await page.locator('.ph-project-card', { hasText: NAME }).count()) === 0);

  // Unknown project deep link
  await page.goto(`${BASE}/p/does-not-exist`);
  await page.waitForTimeout(2500);
  check('unknown project shows "not found"', (await page.locator('text=Project not found').count()) > 0);

  // Offline banner when the API is unreachable
  const offline = await ctx.newPage();
  await offline.route(url => new URL(url).pathname.startsWith('/api/'), r => r.abort());
  await offline.goto(BASE);
  await offline.waitForTimeout(4000);
  check('offline banner when the API is unreachable', (await offline.locator("text=Can't reach the server").count()) > 0);

  check('no page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  await browser.close();
  console.log(`\nFAILURES: ${failures}`);
  process.exit(failures ? 1 : 0);
})().catch(err => { console.error(err); process.exit(1); });
