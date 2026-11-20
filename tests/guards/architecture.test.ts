import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(ts|tsx|js|mjs)$/.test(name) ? [path] : [];
  });
}

/** Source text with comments removed, so explanatory comments cannot trigger (or hide) a violation. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

const code = (path: string): string => stripComments(readFileSync(path, 'utf8'));

function importsOf(text: string): string[] {
  const specs: string[] = [];
  for (const m of text.matchAll(/(?:from|import|require)\s*\(?\s*['"]([^'"]+)['"]/g)) specs.push(m[1]!);
  return specs;
}

const core = sourceFiles(join(ROOT, 'src/core'));
const headless = sourceFiles(join(ROOT, 'src/headless'));
const rel = (p: string) => relative(ROOT, p);

const isThree = (s: string) => s === 'three' || s.startsWith('three/');
const isWebOrExtras = (s: string) => /(^|\/)(web|extras)(\/|$)/.test(s);
const isNodeFs = (s: string) => /^(node:)?fs(\/promises)?$/.test(s);
const isHeadless = (s: string) => /(^|\/)headless(\/|$)/.test(s);

describe('architecture guards', () => {
  it('finds the source files it is supposed to scan', () => {
    expect(core.length).toBeGreaterThanOrEqual(8);
    expect(headless.length).toBeGreaterThanOrEqual(2);
  });

  it('src/core imports no three, no web, no extras, no headless, no fs', () => {
    for (const file of core) {
      for (const spec of importsOf(code(file))) {
        expect(isThree(spec) || isWebOrExtras(spec) || isHeadless(spec) || isNodeFs(spec), `${rel(file)} imports "${spec}"`).toBe(false);
      }
    }
  });

  it('src/headless imports no three, no web, no extras', () => {
    for (const file of headless) {
      for (const spec of importsOf(code(file))) {
        expect(isThree(spec) || isWebOrExtras(spec), `${rel(file)} imports "${spec}"`).toBe(false);
      }
    }
  });

  it('src/core uses no Math.random, Date or performance.now', () => {
    for (const file of core) {
      const text = code(file);
      expect(/Math\.random/.test(text), `${rel(file)} uses Math.random`).toBe(false);
      expect(/\bDate\b/.test(text), `${rel(file)} uses Date`).toBe(false);
      expect(/performance\.now/.test(text), `${rel(file)} uses performance.now`).toBe(false);
    }
  });

  it('src/core touches no DOM globals', () => {
    for (const file of core) {
      expect(/\b(document|window|navigator|requestAnimationFrame)\b/.test(code(file)), rel(file)).toBe(false);
    }
  });

  it('the guard itself detects violations', () => {
    expect(importsOf(`import * as T from 'three';\nimport { x } from "../web/main";`)).toEqual(['three', '../web/main']);
    expect(importsOf(`const fs = require('node:fs');`)).toEqual(['node:fs']);
    expect(stripComments('// Math.random in a comment\nconst a = 1; /* Date */')).not.toMatch(/Math\.random|Date/);
    expect(/Math\.random/.test(stripComments('const r = Math.random();'))).toBe(true);
  });
});
