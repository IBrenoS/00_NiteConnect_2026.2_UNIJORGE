async (page) => {
  const results = [];
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('http://localhost:3000/dev-preview/reunioes?overlay=invite');
    await page.waitForFunction(() => Boolean(document.querySelector('dialog[open]')));
    const values = await page.evaluate(() => {
      const rgb = value => { const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/); return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null; };
      const luminance = color => { const [r, g, b] = color.map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const ratio = (foreground, background) => { const a = luminance(foreground); const b = luminance(background); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
      const dialog = document.querySelector('dialog[open]');
      const defaultBg = rgb(getComputedStyle(dialog).backgroundColor);
      const samples = [...dialog.querySelectorAll('.text-nite-text-secondary, .text-nite-text-muted')].filter(element => element.textContent?.trim()).map(element => {
        let parent = element;
        let background = null;
        while (parent && dialog.contains(parent)) { const parsed = rgb(getComputedStyle(parent).backgroundColor); if (parsed && getComputedStyle(parent).backgroundColor !== 'rgba(0, 0, 0, 0)') { background = parsed; break; } parent = parent.parentElement; }
        const foreground = rgb(getComputedStyle(element).color);
        return { text: element.textContent.trim().replace(/\s+/g, ' ').slice(0, 48), fontSize: getComputedStyle(element).fontSize, foreground: getComputedStyle(element).color, background: background ? `rgb(${background.join(', ')})` : 'dialog', contrast: foreground && (background || defaultBg) ? Math.round(ratio(foreground, background || defaultBg) * 100) / 100 : null };
      });
      return { scheme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light', dialogBackground: getComputedStyle(dialog).backgroundColor, samples };
    });
    results.push(values);
  }
  return results;
}
