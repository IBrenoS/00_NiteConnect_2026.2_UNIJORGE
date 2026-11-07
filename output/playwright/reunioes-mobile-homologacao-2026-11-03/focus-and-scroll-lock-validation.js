async (page) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('http://localhost:3000/dev-preview/reunioes');
  const opener = page.getByRole('button', { name: 'Responder', exact: true }).first();
  const openerCount = await opener.count();
  await opener.click();
  await page.waitForFunction(() => Boolean(document.querySelector('dialog[open]')));
  const initial = await page.evaluate(() => ({
    activeText: document.activeElement?.textContent?.trim() ?? '',
    activeRole: document.activeElement?.getAttribute('role') ?? null,
    activeTag: document.activeElement?.tagName ?? null,
    activeInsideDialog: Boolean(document.querySelector('dialog[open]')?.contains(document.activeElement)),
    closeCount: document.querySelectorAll('dialog[open] button[aria-label="Fechar detalhes da reunião"]').length,
    totalCloseControls: [...document.querySelectorAll('dialog[open] button')].filter(button => /fechar/i.test(button.getAttribute('aria-label') || button.textContent || '')).length,
  }));
  await page.keyboard.press('Tab');
  const closeFocus = await page.evaluate(() => {
    const button = document.activeElement;
    const rect = button?.getBoundingClientRect();
    const style = button ? getComputedStyle(button) : null;
    return {
      label: button?.getAttribute('aria-label') ?? null,
      insideDialog: Boolean(document.querySelector('dialog[open]')?.contains(button)),
      rect: rect ? { width: rect.width, height: rect.height } : null,
      outline: style ? { width: style.outlineWidth, style: style.outlineStyle, color: style.outlineColor } : null,
    };
  });
  const activeAfterTab = [];
  for (let index = 0; index < 4; index++) {
    await page.keyboard.press('Tab');
    activeAfterTab.push(await page.evaluate(() => ({ tag: document.activeElement?.tagName ?? null, label: document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.trim() ?? '', inside: Boolean(document.querySelector('dialog[open]')?.contains(document.activeElement)) })));
  }
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('dialog[open]'));
  const escapeClose = await page.evaluate(() => ({ returnedToButton: document.activeElement instanceof HTMLButtonElement && document.activeElement.textContent?.trim() === 'Responder', activeText: document.activeElement?.textContent?.trim() ?? '', dialogClosed: !document.querySelector('dialog[open]') }));
  await opener.click();
  await page.waitForFunction(() => Boolean(document.querySelector('dialog[open]')));
  await page.getByRole('button', { name: 'Fechar detalhes da reunião' }).click();
  await page.waitForFunction(() => !document.querySelector('dialog[open]'));
  const closeButtonReturn = await page.evaluate(() => ({ returnedToButton: document.activeElement instanceof HTMLButtonElement && document.activeElement.textContent?.trim() === 'Responder', activeText: document.activeElement?.textContent?.trim() ?? '', dialogClosed: !document.querySelector('dialog[open]') }));

  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('http://localhost:3000/dev-preview/reunioes?overlay=invite');
  await page.waitForFunction(() => Boolean(document.querySelector('dialog[open]')));
  await page.evaluate(() => { document.documentElement.style.fontSize = '20px'; window.scrollTo(0, 0); });
  const scrollInitial = await page.evaluate(() => ({ pageY: window.scrollY, docHeight: document.documentElement.scrollHeight, docClient: document.documentElement.clientHeight, bodyHeight: document.body.scrollHeight, bodyClient: document.body.clientHeight, modalY: document.querySelector('dialog[open] div.overflow-y-auto')?.scrollTop ?? 0 }));
  await page.mouse.move(160, 20);
  await page.mouse.wheel(0, 280);
  await page.waitForTimeout(50);
  const afterBackdropWheel = await page.evaluate(() => ({ pageY: window.scrollY, docY: document.documentElement.scrollTop, bodyY: document.body.scrollTop, modalY: document.querySelector('dialog[open] div.overflow-y-auto')?.scrollTop ?? 0 }));
  const scrollRect = await page.evaluate(() => { const r = document.querySelector('dialog[open] div.overflow-y-auto')?.getBoundingClientRect(); return r ? { top: r.top, bottom: r.bottom } : null; });
  if (scrollRect) {
    await page.mouse.move(160, Math.min(scrollRect.bottom - 8, scrollRect.top + 80));
    await page.mouse.wheel(0, 1800);
    await page.waitForTimeout(80);
  }
  const atBottom = await page.evaluate(() => ({ pageY: window.scrollY, docY: document.documentElement.scrollTop, bodyY: document.body.scrollTop, modalY: document.querySelector('dialog[open] div.overflow-y-auto')?.scrollTop ?? 0, modalMax: (() => { const element = document.querySelector('dialog[open] div.overflow-y-auto'); return element ? element.scrollHeight - element.clientHeight : 0; })() }));
  await page.mouse.wheel(0, 1200);
  await page.waitForTimeout(60);
  const afterBoundaryWheel = await page.evaluate(() => ({ pageY: window.scrollY, docY: document.documentElement.scrollTop, bodyY: document.body.scrollTop, modalY: document.querySelector('dialog[open] div.overflow-y-auto')?.scrollTop ?? 0 }));
  if (openerCount !== 1 || !initial.activeInsideDialog || initial.closeCount !== 1 || initial.totalCloseControls !== 1) throw new Error('Initial focus or single close control check failed');
  if (!closeFocus.insideDialog || closeFocus.rect.width < 44 || closeFocus.rect.height < 44 || closeFocus.outline.width !== '3px' || closeFocus.outline.style !== 'solid') throw new Error('Close button target size or keyboard focus visibility failed');
  if (activeAfterTab.some(item => !item.inside)) throw new Error('Keyboard focus escaped the modal');
  if (!escapeClose.returnedToButton || !escapeClose.dialogClosed || !closeButtonReturn.returnedToButton || !closeButtonReturn.dialogClosed) throw new Error('Escape/close did not return focus to the opener');
  if (afterBackdropWheel.pageY !== 0 || atBottom.pageY !== 0 || atBottom.modalY !== atBottom.modalMax || afterBoundaryWheel.pageY !== 0) throw new Error('Modal scroll escaped to the background page');
  return { openerCount, initial, closeFocus, activeAfterTab, escapeClose, closeButtonReturn, scrollLock: { initial: scrollInitial, afterBackdropWheel, atBottom, afterBoundaryWheel } };
}

