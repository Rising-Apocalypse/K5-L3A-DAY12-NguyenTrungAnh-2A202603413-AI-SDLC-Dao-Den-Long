import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync(new URL('../../src/web/index.html', import.meta.url), 'utf8');
const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');

/** Every font-size / font shorthand value in the CSS (declarations only). */
function fontDeclarations(text: string): Array<{ prop: string; value: string }> {
  const out: Array<{ prop: string; value: string }> = [];
  for (const m of text.matchAll(/(?<![-\w])(font-size|font)\s*:\s*([^;}]+)/g)) out.push({ prop: m[1]!, value: m[2]!.trim() });
  return out;
}
/** px lengths in a value; `calc(18px * var(--ui-scale))` gives 18. */
const pxValues = (value: string): number[] => [...value.matchAll(/(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));

describe('UI font size (index.html)', () => {
  const decls = fontDeclarations(css);

  it('finds the declarations', () => {
    expect(decls.length).toBeGreaterThan(15);
  });

  it('no font-size or font shorthand below 18px (px values; --ui-scale is 1 at 1280x720)', () => {
    const small = decls.filter((d) => pxValues(d.value).some((px) => px < 18));
    expect(small).toEqual([]);
  });

  it('every font-size is in px (or inherited), so the 18px floor is checkable', () => {
    const odd = decls.filter((d) => d.prop === 'font-size' && pxValues(d.value).length === 0 && d.value !== 'inherit');
    expect(odd).toEqual([]);
  });

  it('every px font size goes through --ui-scale so the large-text option multiplies it', () => {
    const unscaled = decls.filter((d) => d.prop === 'font-size' && !d.value.includes('var(--ui-scale)'));
    expect(unscaled.filter((d) => d.value !== 'inherit')).toEqual([]);
    expect(css).toMatch(/--ui-scale:\s*1\s*;/);
  });

  it('the body text itself is >= 18px', () => {
    expect(css).toMatch(/body\s*\{[^}]*font-size:\s*calc\(18px \* var\(--ui-scale\)\)/);
  });
});
