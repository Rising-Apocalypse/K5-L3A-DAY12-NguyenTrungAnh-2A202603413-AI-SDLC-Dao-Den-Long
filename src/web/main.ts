// Entry point. `?bench=1` runs the benchmark scene (served by scripts/bench.mjs); anything else is the game.
if (new URLSearchParams(window.location.search).get('bench') === '1') {
  void import('./bench').then((m) => m.runBench());
} else {
  void import('./game');
}
