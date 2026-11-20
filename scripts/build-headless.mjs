// Bundles the headless CLI, the soak CLI and the launcher (and the pure core they use) into ESM files.
import { build } from 'esbuild';

const entries = [
  ['src/headless/cli.ts', 'dist/headless.js'],
  ['src/soak/cli.ts', 'dist/soak.js'],
  ['src/play/cli.ts', 'dist/play.js'],
];

for (const [entry, outfile] of entries) {
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    // JSON (game.contract.json) is inlined by esbuild's default json loader.
    logLevel: 'info',
  });
}
