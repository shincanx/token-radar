# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/shincanx/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/shincanx/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar — a pre-token launch radar. A size-elastic value model fitted on the snapshot's 128 live-token peers and walk-forward tested (median log error 1.16 vs 1.67 for a fixed multiple), launch odds from the peers' record, and costed Farm / Thin / Skip verdicts for 200 ranked protocols: the 40-protocol watchlist plus the 160 strongest pre-token protocols below the $50M floor.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input snapshot.json
```

`main.ts` (Node 22, standard library only) reads the sealed snapshot, fits the model, writes the ranked board to `out/board.json`, the dashboard's data to `out/data.js`, and copies `dashboard/` and `screenshots/` plus the judge's `dossier.json` into `out/`. Open `out/dashboard/index.html` to use the radar: a sortable, filterable board, a detail view per protocol with the model breakdown and a costed farm plan, a live-token view at market values, and a model page showing the fit and its walk-forward test.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
