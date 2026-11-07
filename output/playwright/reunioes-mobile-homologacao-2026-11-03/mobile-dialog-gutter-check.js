async (page) => {
  const widths = [320, 360, 375, 390, 393, 414, 427, 430, 639, 640, 641, 768, 1024, 1440];
  const results = [];
  for (const width of widths) {
    await page.setViewportSize({ width, height: 932 });
    const metrics = await page.evaluate(() => {
      const dialog = document.querySelector('dialog[open]');
      const parent = dialog?.parentElement;
      const rect = dialog?.getBoundingClientRect();
      const parentRect = parent?.getBoundingClientRect();
      const style = dialog ? getComputedStyle(dialog) : null;
      return {
        viewport: innerWidth,
        dialog: rect ? { x: rect.x, right: rect.right, width: rect.width } : null,
        parent: parentRect ? { x: parentRect.x, right: parentRect.right, width: parentRect.width } : null,
        leftGap: rect ? rect.left : null,
        rightGap: rect ? innerWidth - rect.right : null,
        margins: style ? { left: style.marginLeft, right: style.marginRight } : null,
        computedWidth: style?.width ?? null,
        maxWidth: style?.maxWidth ?? null,
        documentWidth: document.documentElement.scrollWidth,
      };
    });
    results.push(metrics);
    if (width === 430) await page.screenshot({ path: 'D:/nite-connect/output/playwright/reunioes-mobile-homologacao-2026-11-03/gutter-after-430.png', animations: 'disabled' });
  }
  const asymmetric = results.filter(item => Math.abs((item.leftGap ?? 0) - (item.rightGap ?? 0)) > 0.5);
  if (asymmetric.length) throw new Error('Mobile dialog has asymmetric horizontal gutters: ' + JSON.stringify(asymmetric));
  return results;
}


