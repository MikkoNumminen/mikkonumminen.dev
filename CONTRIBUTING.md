# Contributing

A personal portfolio, so contributions are mostly the owner's — but the flow is
written down so it's reproducible (by a human or an automated agent).

> Automated agents: read [`AGENTS.md`](AGENTS.md) first — it holds the hard
> constraints, the repo map, and the security boundaries.

## Setup

```bash
nvm use            # Node 22 (pinned in .nvmrc)
npm install
npm run dev        # http://localhost:4321
```

## The gates (must pass before merge)

CI runs these on every PR, on Node 22, in this order — run them locally first:

```bash
npm run typecheck    # astro check
npm run format:check # prettier
npm run lint         # eslint (no-explicit-any is an error)
npm test             # vitest
npm run build        # astro build (must succeed)
```

`npm run format` fixes formatting in place.

## Flow

1. Branch off `master` (`git switch -c <type>-<short-desc>`). Don't commit to `master`.
2. Small, focused commits in [Conventional Commits](https://www.conventionalcommits.org/)
   style (`feat:`, `fix:`, `chore:`, `refactor:`, `docs:`, `perf:`, `test:`).
   **No commit trailers or co-author lines.**
3. Open a PR; let CI go green; **squash-merge** and delete the branch.
4. Record decisions of consequence as an ADR under [`docs/decisions/`](docs/decisions/)
   (see its README for the template).

## Hard constraints

Non-negotiable — see [`AGENTS.md`](AGENTS.md) for the full list:

- **Fully static output** (no SSR/edge) — see [ADR 0002](docs/decisions/0002-static-output-only.md).
- No Next.js / React / component libraries.
- 60fps animations: dispose Three.js resources, `requestAnimationFrame`, honour
  `prefers-reduced-motion`.
- Security boundaries: see [`SECURITY.md`](SECURITY.md) and the threat model.
