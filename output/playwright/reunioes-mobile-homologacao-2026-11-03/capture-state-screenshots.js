async (page) => {
  const cases = [
    { overlay: 'history', name: 'history-mobile-320-light.png', width: 320, color: 'light' },
    { overlay: 'linked', name: 'future-linked-mobile-427-light.png', width: 427, color: 'light' },
    { overlay: 'cancelled', name: 'cancelled-mobile-320-light.png', width: 320, color: 'light' },
  ];
  for (const item of cases) {
    await page.setViewportSize({ width: item.width, height: 800 });
    await page.emulateMedia({ colorScheme: item.color });
    await page.goto('http://localhost:3000/dev-preview/reunioes?overlay=' + item.overlay);
    await page.waitForFunction(() => Boolean(document.querySelector('dialog[open]')));
    await page.screenshot({ path: 'D:/nite-connect/output/playwright/reunioes-mobile-homologacao-2026-11-03/' + item.name, animations: 'disabled' });
  }
  return cases.map(item => item.name);
}
