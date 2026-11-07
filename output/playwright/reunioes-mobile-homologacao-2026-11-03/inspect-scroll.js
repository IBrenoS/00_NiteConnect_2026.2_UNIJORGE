async (page) => await page.evaluate(() => {
  const dialog = document.querySelector('dialog[open]');
  const toInfo = element => { const r = element.getBoundingClientRect(); const s = getComputedStyle(element); return { tag: element.tagName, className: typeof element.className === 'string' ? element.className : '', text: (element.textContent || '').trim().slice(0, 80), rect: { top: r.top, bottom: r.bottom, height: r.height }, scroll: { top: element.scrollTop, client: element.clientHeight, total: element.scrollHeight }, overflowY: s.overflowY }; };
  const bodyScroller = dialog?.querySelector('div.overflow-y-auto');
  const header = dialog?.querySelector('header');
  const close = dialog?.querySelector('[aria-label="Fechar detalhes da reunião"]');
  return { viewport: { innerHeight, scrollY, visualViewport: visualViewport ? { height: visualViewport.height, offsetTop: visualViewport.offsetTop, pageTop: visualViewport.pageTop, scale: visualViewport.scale } : null }, dialog: dialog ? toInfo(dialog) : null, children: dialog ? [...dialog.children].map(toInfo) : [], header: header ? toInfo(header) : null, scroller: bodyScroller ? toInfo(bodyScroller) : null, close: close ? toInfo(close) : null };
})
