async (page) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('http://localhost:3000/dev-preview/reunioes');
  const opener = page.getByRole('button', { name: 'Responder', exact: true }).first();
  await opener.waitFor({ state: 'visible' });
  await page.evaluate(() => window.scrollTo(0, 120));
  const before = await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find(item => item.textContent?.trim() === 'Responder');
    const rect = button?.getBoundingClientRect();
    return { y: window.scrollY, overflow: document.documentElement.style.overflow, paddingRight: document.documentElement.style.paddingRight, opener: rect ? { top: rect.top, bottom: rect.bottom } : null };
  });
  await opener.evaluate(element => element.click());
  await page.waitForFunction(() => Boolean(document.querySelector('dialog[open]')));
  const whileOpen = await page.evaluate(() => ({ y: window.scrollY, overflow: document.documentElement.style.overflow, paddingRight: document.documentElement.style.paddingRight }));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog[open]'));
  const after = await page.evaluate(() => ({ y: window.scrollY, overflow: document.documentElement.style.overflow, paddingRight: document.documentElement.style.paddingRight, focusText: document.activeElement?.textContent?.trim() ?? '' }));
  const preserved = before.y === whileOpen.y && before.y === after.y;
  const restoredStyles = after.overflow === before.overflow && after.paddingRight === before.paddingRight;
  if (!preserved || whileOpen.overflow !== 'hidden' || !restoredStyles) throw new Error('Opening/closing the details modal did not preserve context and restore document styles');
  return { before, whileOpen, after, preserved, restoredStyles };
}



