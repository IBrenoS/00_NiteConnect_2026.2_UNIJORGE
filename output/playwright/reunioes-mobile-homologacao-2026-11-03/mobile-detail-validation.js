async (page) => {
  const base = 'http://localhost:3000/dev-preview/reunioes?overlay=';
  const cases = [
    { overlay: 'invite', label: 'futura-com-quatro-convidados' },
    { overlay: 'history', label: 'anterior' },
    { overlay: 'cancelled', label: 'cancelada' },
  ];
  const results = [];
  for (const item of cases) {
    for (const width of [320, 360, 427]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(base + item.overlay);
      await page.waitForFunction(() => Boolean(document.querySelector('dialog[open]')));
      const before = await page.evaluate(() => {
        const dialog = document.querySelector('dialog[open]');
        const scroller = dialog?.querySelector('div.overflow-y-auto');
        const dialogRect = dialog?.getBoundingClientRect();
        const scrollRect = scroller?.getBoundingClientRect();
        window.scrollTo(0, 0);
        return {
          viewport: { width: innerWidth, height: innerHeight },
          dialog: dialogRect ? { top: dialogRect.top, bottom: dialogRect.bottom, height: dialogRect.height } : null,
          scroll: scroller ? { client: scroller.clientHeight, total: scroller.scrollHeight, top: scroller.scrollTop, rectTop: scrollRect?.top, rectBottom: scrollRect?.bottom } : null,
          pageY: window.scrollY,
        };
      });
      if (before.scroll && before.scroll.total > before.scroll.client) {
        await page.mouse.move(width / 2, Math.min(before.scroll.rectBottom - 12, before.scroll.rectTop + 90));
        await page.mouse.wheel(0, 360);
        await page.waitForTimeout(70);
      }
      const afterWheel = await page.evaluate(() => ({
        pageY: window.scrollY,
        bodyY: document.body.scrollTop,
        docY: document.documentElement.scrollTop,
        modalY: document.querySelector('dialog[open] div.overflow-y-auto')?.scrollTop ?? 0,
      }));
      const atBottom = await page.evaluate(() => {
        const dialog = document.querySelector('dialog[open]');
        const scroller = dialog?.querySelector('div.overflow-y-auto');
        if (scroller) scroller.scrollTop = scroller.scrollHeight;
        const actions = [...(dialog?.querySelectorAll('button') ?? [])].map(button => {
          const rect = button.getBoundingClientRect();
          return { label: (button.innerText || button.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' '), disabled: button.disabled, top: Math.round(rect.top), bottom: Math.round(rect.bottom), visible: rect.bottom > 0 && rect.top < innerHeight };
        });
        return {
          scrollTop: scroller?.scrollTop ?? 0,
          scrollMax: scroller ? scroller.scrollHeight - scroller.clientHeight : 0,
          dialogBottom: dialog ? Math.round(dialog.getBoundingClientRect().bottom) : null,
          actions,
        };
      });
      results.push({ state: item.label, width, height: before.viewport.height, before, afterWheel, atBottom });
    }
  }

  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(base + 'invite');
  await page.waitForFunction(() => Boolean(document.querySelector('dialog[open]')));
  await page.evaluate(() => { document.documentElement.style.fontSize = '20px'; window.scrollTo(0, 0); });
  await page.waitForTimeout(120);
  await page.screenshot({ path: 'D:/nite-connect/output/playwright/reunioes-mobile-homologacao-2026-11-03/invite-long-320x568-text125-top.png', animations: 'disabled' });
  const reducedBefore = await page.evaluate(() => {
    const dialog = document.querySelector('dialog[open]');
    const scroller = dialog?.querySelector('div.overflow-y-auto');
    const d = dialog?.getBoundingClientRect();
    return { viewport: { width: innerWidth, height: innerHeight }, fontSize: getComputedStyle(document.documentElement).fontSize, dialog: d ? { top: d.top, bottom: d.bottom, height: d.height } : null, scroll: scroller ? { client: scroller.clientHeight, total: scroller.scrollHeight, top: scroller.scrollTop } : null, pageY: window.scrollY };
  });
  const reducedScrollRect = await page.evaluate(() => { const r = document.querySelector('dialog[open] div.overflow-y-auto')?.getBoundingClientRect(); return r ? { top: r.top, bottom: r.bottom } : null; });
  if (reducedScrollRect) {
    await page.mouse.move(160, Math.min(reducedScrollRect.bottom - 8, reducedScrollRect.top + 80));
    await page.mouse.wheel(0, 1400);
    await page.waitForTimeout(120);
  }
  const reducedBottom = await page.evaluate(() => {
    const dialog = document.querySelector('dialog[open]');
    const scroller = dialog?.querySelector('div.overflow-y-auto');
    const buttons = [...(dialog?.querySelectorAll('button') ?? [])].map(button => { const r = button.getBoundingClientRect(); return { label: (button.innerText || button.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' '), disabled: button.disabled, top: Math.round(r.top), bottom: Math.round(r.bottom), visible: r.bottom > 0 && r.top < innerHeight }; });
    return { pageY: window.scrollY, bodyY: document.body.scrollTop, docY: document.documentElement.scrollTop, modalY: scroller?.scrollTop ?? 0, scrollMax: scroller ? scroller.scrollHeight - scroller.clientHeight : 0, dialogBottom: dialog ? Math.round(dialog.getBoundingClientRect().bottom) : null, buttons };
  });
  await page.screenshot({ path: 'D:/nite-connect/output/playwright/reunioes-mobile-homologacao-2026-11-03/invite-long-320x568-text125-bottom.png', animations: 'disabled' });
  return { cases: results, reducedHeightText125: { before: reducedBefore, bottom: reducedBottom } };
}
