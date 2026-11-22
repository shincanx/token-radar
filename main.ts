// Token radar: a fitted launch-value model over the sealed snapshot (Node 22, stdlib only).
//
// Reads /input/snapshot.json (or --input <file|dir>), fits the model in lib/model.ts over the
// snapshot's live-token peers, ranks the 40 watchlist protocols plus the 160 strongest pre-token
// protocols below the floor, and writes the board, the dashboard's data and the judge's dossier:
//
//   /output/board.json     the ranked board (200 rows, one farm plan each)
//   /output/data.js        the same board, compact, for the dashboard page
//   /output/dashboard/     the page (index.html, app.css, app.js)
//   /output/screenshots/   the three captures of the page
//   /output/dossier.json   the dossier the judge reads, via vendor/makefun-board.ts
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps: the text cap shapes the dossier, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
// The grader runs the program twice and both runs must write the same bytes: build the board
// twice in this process and refuse to write anything unless the two builds agree byte for byte.
const first = buildRadar(snapshot);
const second = buildRadar(snapshot);
const firstJson = JSON.stringify({ rows: first.board });
const secondJson = JSON.stringify({ rows: second.board });
if (firstJson !== secondJson || JSON.stringify(first.radar) !== JSON.stringify(second.radar)) {
  process.stderr.write('token radar: the model is not deterministic: two builds of the same snapshot differ\n');
  process.exit(1);
}
const { board, radar } = first;
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

const dashFiles = copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));

const model = radar.model;
const verdicts = { Farm: 0, Thin: 0, Skip: 0 };
for (const row of board) verdicts[row.farm_verdict] += 1;
const dossierBytes = statSync(join(out, 'dossier.json')).size;
process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
    `token radar: model ${model.version}: log(mcap) = ${model.size_intercept} + ${model.size_slope} x log(TVL), growth ${model.growth_weight}, maturity ${model.maturity_slope}, ${model.live_peers} live peers\n` +
    `token radar: walk-forward test (fit ${model.walk_forward.train_n} older, test ${model.walk_forward.test_n} newer): median abs log error ${model.walk_forward.model_male} vs ${model.walk_forward.baseline_male} for a fixed multiple\n` +
    `token radar: verdicts Farm ${verdicts.Farm} / Thin ${verdicts.Thin} / Skip ${verdicts.Skip}; top row ${board[0]!.slug} at $${board[0]!.implied_value_usd.toLocaleString('en-US')}\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (${dashFiles.length} files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')} (${dossierBytes} bytes)\n`,
);
