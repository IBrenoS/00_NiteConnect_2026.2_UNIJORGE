async (page) => {
  const cases = [
    { name: 'invite-desktop-1440-dark.png', width: 1440, height: 1000, color: 'dark' },
    { name: 'invite-mobile-360-dark.png', width: 360, height: 800, color: 'dark' },
    { name: 'invite-mobile-360-light.png', width: 360, height: 800, color: 'light' },
    { name: 'invite-mobile-427-light.png', width: 427, height: 800, color: 'light' },
  ];
  const files = [];
  for (const item of cases) {
    await page.setViewportSize({ width: item.width, height: item.height });
    await page.emulateMedia({ colorScheme: item.color });
    await page.goto('http://localhost:3000/dev-preview/reunioes?overlay=invite');
    await page.waitForFunction(() => Boolean(document.querySelector('dialog[open]')));
    await page.screenshot({ path: 'D:/nite-connect/output/playwright/reunioes-mobile-homologacao-2026-11-03/' + item.name, animations: 'disabled' });
    files.push(item.name);
  }
  return files;
}
