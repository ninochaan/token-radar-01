# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/ninochaan/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/ninochaan/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: a Node program (`main.ts`, standard library only)
that reads the competition's sealed DefiLlama snapshot and ranks the
protocols that record no token yet by implied launch value, each with a
concrete farm plan, and renders them as a static dashboard.

The model prices a pre-token protocol from the snapshot's own figures:
TVL × its category multiple — the median market-cap/TVL of the
already-trading protocols in the same category, shrunk toward the global
median and capped at 3× — adjusted by bounded factors for seven-day TVL
momentum, years running at scale with no token, and chain breadth.
Nothing is priced by name. Bridges, liquid-staking wrappers, exchange
products and other derivatives of tokens that already trade are screened
out with the reason kept (145 of 342 tokenless protocols): their launch
already happened. 197 protocols are ranked; all 40 of the snapshot's
watchlist are covered.

Each board row carries a farm plan generated from the protocol's own
record — its category's playbook, its cheapest chain's gas level, its
TVL size tier — and the closing steps quote the protocol's own TVL and
seven-day move, so no two plans differ only in the name. Every step
names a dollar cost and a time. The dashboard (`dashboard/`) is
sortable and filterable (search, category, chain, watchlist-only),
separates the already-launched protocols that calibrate the model,
and shows the full pricing equation per protocol, including the base
value at traded-peer pricing and how many traded peers set the
multiple.
`main.ts` also writes `board.json` and the judge's `dossier.json`
(via the vendored `vendor/makefun-board.ts`). Deterministic: the same
snapshot produces byte-identical output on every run.

MIT licensed — see `LICENSE`.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
