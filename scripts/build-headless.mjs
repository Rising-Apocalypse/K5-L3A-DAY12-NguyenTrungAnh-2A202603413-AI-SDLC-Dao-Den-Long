// Bundles the headless CLI (and the pure core it uses) into one ESM file.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/headless/cli.ts'],
  outfile: 'dist/headless.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  // JSON (game.contract.json) is inlined by esbuild's default json loader.
  logLevel: 'info',
});
