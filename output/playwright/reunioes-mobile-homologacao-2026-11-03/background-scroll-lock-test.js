async (page) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('http://localhost:3000/dev-preview/reunioes?overlay=invite');
  await page.waitForFunction(() => Boolean(document.querySelector('dialog[open]')));
  await page.evaluate(() => { document.documentElement.style.fontSize = '20px'; window.scrollTo(0, 0); });
  const before = await page.evaluate(() => ({ pageY: window.scrollY, overflow: document.documentElement.style.overflow, docHeight: document.documentElement.scrollHeight, docClient: document.documentElement.clientHeight, dialogBottom: document.querySelector('dialog[open]')?.getBoundingClientRect().bottom ?? null, closeCount: document.querySelectorAll('dialog[open] button[aria-label="Fechar detalhes da reunião"]').length, closeRect: (() => { const rect = document.querySelector('dialog[open] button[aria-label="Fechar detalhes da reunião"]')?.getBoundingClientRect(); return rect ? { width: rect.width, height: rect.height } : null; })(), horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth }));
  if (before.overflow !== 'hidden' || before.closeCount !== 1 || (before.closeRect?.width ?? 0) < 44 || (before.closeRect?.height ?? 0) < 44 || before.horizontalOverflow || (before.dialogBottom ?? Infinity) > 568) throw new Error('Dialog bounds, close control, root lock, or horizontal overflow check failed');
  await page.screenshot({ path: 'D:/nite-connect/output/playwright/reunioes-mobile-homologacao-2026-11-03/invite-long-320x568-text125-top.png', animations: 'disabled' });
  await page.mouse.move(160, 20);
  await page.mouse.wheel(0, 280);
  await page.waitForTimeout(60);
  const afterBackdrop = await page.evaluate(() => window.scrollY);
  if (afterBackdrop !== before.pageY) throw new Error(`Background page moved from ${before.pageY} to ${afterBackdrop} with modal open`);
  const scrollRect = await page.evaluate(() => { const rect = document.querySelector('dialog[open] div.overflow-y-auto')?.getBoundingClientRect(); return rect ? { top: rect.top, bottom: rect.bottom } : null; });
  if (!scrollRect) throw new Error('Dialog scroll container was not found');
  await page.mouse.move(160, Math.min(scrollRect.bottom - 8, scrollRect.top + 80));
  await page.mouse.wheel(0, 1800);
  await page.waitForTimeout(80);
  await page.mouse.wheel(0, 1200);
  await page.waitForTimeout(60);
  const bottom = await page.evaluate(() => {
    const dialog = document.querySelector('dialog[open]');
    const scroller = dialog?.querySelector('div.overflow-y-auto');
    const buttons = [...(dialog?.querySelectorAll('button') ?? [])].map(button => { const rect = button.getBoundingClientRect(); return { name: (button.innerText || button.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' '), top: Math.round(rect.top), bottom: Math.round(rect.bottom), whollyVisible: rect.top >= 0 && rect.bottom <= innerHeight }; });
    return { pageY: window.scrollY, modalTop: scroller?.scrollTop ?? 0, modalMax: scroller ? scroller.scrollHeight - scroller.clientHeight : 0, dialogBottom: dialog?.getBoundingClientRect().bottom ?? null, buttons };
  });
  if (bottom.modalMax <= 0 || bottom.modalTop !== bottom.modalMax || bottom.pageY !== before.pageY || bottom.dialogBottom > 568 || bottom.buttons.some(button => !button.whollyVisible)) throw new Error('Dialog bottom content or actions are not fully reachable without moving the background');
  await page.screenshot({ path: 'D:/nite-connect/output/playwright/reunioes-mobile-homologacao-2026-11-03/invite-long-320x568-text125-bottom.png', animations: 'disabled' });
  return { pass: true, before, afterBackdrop, bottom };
}
