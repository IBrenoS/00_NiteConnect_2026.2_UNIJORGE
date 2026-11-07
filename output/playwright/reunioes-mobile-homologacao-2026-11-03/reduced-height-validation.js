async (page) => {
  const results = [];
  for (const [width, height] of [[320, 568], [360, 640]]) {
    for (const overlay of ['history', 'linked', 'cancelled', 'invite']) {
      await page.setViewportSize({ width, height });
      await page.goto('http://localhost:3000/dev-preview/reunioes?overlay=' + overlay);
      await page.waitForFunction(() => Boolean(document.querySelector('dialog[open]')));
      await page.evaluate(() => { document.documentElement.style.fontSize = '20px'; window.scrollTo(0, 0); });
      const initial = await page.evaluate(() => {
        const dialog = document.querySelector('dialog[open]');
        const scroller = dialog?.querySelector('div.overflow-y-auto');
        const dr = dialog?.getBoundingClientRect();
        return { viewport: { width: innerWidth, height: innerHeight }, dialogBottom: dr?.bottom ?? null, scroll: scroller ? { top: scroller.scrollTop, client: scroller.clientHeight, total: scroller.scrollHeight } : null, horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, pageY: window.scrollY };
      });
      const scrollRect = await page.evaluate(() => { const rect = document.querySelector('dialog[open] div.overflow-y-auto')?.getBoundingClientRect(); return rect ? { top: rect.top, bottom: rect.bottom } : null; });
      if (scrollRect) {
        await page.mouse.move(width / 2, Math.min(scrollRect.bottom - 8, scrollRect.top + 80));
        await page.mouse.wheel(0, 1600);
        await page.waitForTimeout(50);
      }
      const final = await page.evaluate(() => {
        const dialog = document.querySelector('dialog[open]');
        const scroller = dialog?.querySelector('div.overflow-y-auto');
        const actions = [...(dialog?.querySelectorAll('button') ?? [])].map(button => { const r = button.getBoundingClientRect(); return { name: (button.innerText || button.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' '), top: Math.round(r.top), bottom: Math.round(r.bottom), visible: r.bottom > 0 && r.top < innerHeight }; });
        return { pageY: window.scrollY, modalTop: scroller?.scrollTop ?? 0, modalMax: scroller ? scroller.scrollHeight - scroller.clientHeight : 0, dialogBottom: dialog?.getBoundingClientRect().bottom ?? null, actions };
      });
      results.push({ width, height, overlay, initial, final });
    }
  }
  return results;
}
