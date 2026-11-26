# Claude development workflow

## Giving Claude a task

1. Open a GitHub issue. Describe the goal, the pages affected and what "done" looks like.
2. Add the label **`ai:todo`**.
3. The `Claude (issues & PRs)` workflow then runs:
   - It changes the label to `ai:in-progress`.
   - Claude reads the issue and inspects the code.
   - It creates a `claude/...` branch, implements the change and runs the CI commands.
   - It opens a PR and comments on the issue with a report.
4. CI runs on the PR. You review, and **you merge**. Vercel deploys `main`.
5. Follow-ups: comment `@claude <instruction>` on the PR or issue.

## Labels

| Label | Meaning |
|---|---|
| `ai:todo` | Claude should start |
| `ai:in-progress` | Claude is working |
| `needs-human-review` | Touches a restricted path (payments, webhooks, checkout, auth, migrations, prod config) |
| `weekly-report` | Weekly audit output |

## Weekly audit

- `.github/workflows/weekly-audit.yml` runs every Monday at 09:00 IST. You can also run it by hand from the Actions tab.
- It checks technical SEO, broken links, build health, performance and UX.
- It opens a single `weekly-report` issue, plus PRs for safe fixes only.

**Search Console data:** Windsor.ai is a claude.ai connector and is not available inside GitHub Actions. To include Search Console data, run a Claude Code scheduled routine (cloud) that uses the Windsor connector, and have it post a summary into the weekly issue. Alternatively, export the GSC CSV and attach it to an issue labelled `ai:todo`.

## Safety model

- **Blocked tools:** agents can't run `fly`, `vercel`, `gh pr merge`, `gh secret` or `gh api`, and can't force-push or push to `main`.
- **Repository protection:** branch protection or rulesets on `main` would enforce this at the GitHub level. For a private repo that **needs GitHub Pro** (see the protection section below).
- **Secrets:** the workflows only receive the Claude token. They have no production database or Fly credentials.
- **Restricted paths:** `.github/CODEOWNERS` lists them, and `CLAUDE.md` holds the rules.

## Specialist agents (`.claude/agents/`)

| Agent | Role |
|---|---|
| `seo` | Titles, meta, category copy |
| `technical-seo` | Sitemap, canonicals, JSON-LD, feed |
| `frontend-ui` | UI and mobile UX |
| `backend` | API (non-restricted parts) |
| `testing` | Tests and CI |
| `performance` | Speed and Vercel CPU |
| `competitor-research` | Read-only research |

The main session coordinates the agents. Two agents never edit the same file in parallel.

## GitHub protection

- **Current plan:** private repo on GitHub Free. The branch-protection API returns *403 "Upgrade to GitHub Pro or make this repository public"*. Rulesets have the same limit on private repos.
- **With GitHub Pro (~$4/month):** Settings → Branches → Add rule for `main`:
  - Require a pull request, with 1 approval.
  - Require review from Code Owners.
  - Require status checks: `API (svcar-api)`, `Storefront (svcar-india)`, `Brand config in sync`.
  - Block force pushes.
  - Do not allow bypass.
- **Until then:** the protections are by convention only (`CLAUDE.md`, tool deny-lists in the workflows, `CODEOWNERS` as documentation). The owner account can still push to `main`.

## Security hardening (security-hardening PR)

| Control | How it is enforced | Guaranteed on GitHub Free? |
|---|---|---|
| AI workflows off by default | Repo variable `AI_AUTONOMY_ENABLED` must be `true` | Yes |
| No AI run without protected `main` | `.github/scripts/ai-preflight.sh` checks branch protection/rulesets before Claude starts, fails closed | Yes (it refuses to run) |
| Only trusted people can trigger | `author_association` must be OWNER/MEMBER/COLLABORATOR | Yes |
| Least-privilege tokens | `permissions: {}` at top; per-job minimum; no `id-token: write` (uses `github_token`) | Yes |
| Pinned actions | Every third-party action pinned to a full commit SHA | Yes |
| Limits | 1 AI run at a time repo-wide, 45 min timeout, 40 turns, 5 runs/day, max 3 attempts per issue (`ai:attempt-N` labels) | Yes |
| Label not removed early | `ai:todo` is changed only after the run | Yes |
| Untrusted web content | Weekly audit is read-only: no Bash/Write/Edit, WebFetch only to svcarcustoms.in, report posted by a separate job | Yes |
| Writer has no network | WebFetch, curl, wget, `npx` and `gh api` are blocked in the code-writing job | Best effort (tool list) |
| Sensitive paths need owner approval | `sensitive-paths.yml` fails without an APPROVED owner review on the latest commit; Claude PRs auto-labelled `needs-human-review` | Check runs, but **cannot be required** on Free |
| Nothing reaches `main` except via PR | Branch protection / ruleset | **No: needs GitHub Pro.** `main-guard.yml` only *alerts* after a direct push |

**Known limit:** the writer can edit `package.json` scripts and then run `npm test`, which is arbitrary code with the job token. That is why branch protection on `main` is the real control, and why preflight blocks the AI until it exists.

**Enable order:** 1) GitHub Pro + branch protection on `main` (require PR, 1 approval, code owners, required checks incl. `Owner approval for sensitive paths`, no bypass). 2) Staging verified. 3) Add `CLAUDE_CODE_OAUTH_TOKEN`. 4) Set `AI_AUTONOMY_ENABLED=true`.
