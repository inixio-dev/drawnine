---
name: commit
description: Write a DrawNine commit with an extended explanation (Conventional Commit subject plus a body covering why, what changed, how it was verified, and breaking changes or follow-ups), show it for approval, and only commit once the user confirms. Use this whenever the user asks to commit, make a commit, "haz commit", write or suggest a commit message, describe their changes for a commit, or wrap up a change in this repository, even if they don't mention the message format.
---

# Commit with an extended explanation

The goal is a commit someone can understand months later from `git log` alone: not just *what* changed (the diff already says that) but *why*, and what evidence there is that it works. The user reviews every message before it is committed, so the job ends at a proposal unless they confirm.

## 1. Understand the change

Run these before writing anything:

```bash
git branch --show-current
git status --short
git diff --cached --stat
git diff --stat
git log --oneline -5
```

Then read the actual diff (`git diff --cached`, and `git diff` for unstaged work).

**Decide what goes in the commit.**
- If something is staged, the commit is the staged changes. Describe only those. If there is also unstaged or untracked work, list it in your proposal as "not included" so the user can decide.
- If nothing is staged, propose staging the modified files that belong together, by explicit path. Don't use `git add -A` or `git add .`: the repo root usually holds large generated PDFs and other personal files that `.gitignore` may not cover.
- Never stage `.env`, PDFs, card images, `.zip` archives, `dist/` or `coverage/`. If such a file shows up as untracked, mention it and leave it alone.
- If the changes clearly cover unrelated topics (for example, a parser fix plus README edits), suggest splitting them into separate commits and say how.

## 2. Verify, and record what you ran

Run the checks that cover the change, so the "Verified" section reports real results:

| Change touches | Run |
|---|---|
| Any `.ts` in `apps/` or `libs/` | `pnpm lint` and `pnpm test` (CLAUDE.md requires both before a task is done) |
| `apps/api/` | also `pnpm test:e2e` |
| `tsconfig*.json`, `nest-cli.json`, `package.json`, `apps/cli/src/main.ts` | also `pnpm build`, then `node dist/apps/cli/apps/cli/src/main.js parse examples/deck.txt` |
| Only docs (`*.md`), `.github/`, `.env.example` | no checks needed; say so |

Write down the actual numbers (for example "205 tests passed"). Only list checks you actually ran in this session. If a check fails, stop and tell the user instead of proposing a commit. A message that claims tests pass when they don't is worse than no message.

## 3. Write the message

Use this structure, in English, with every line wrapped at 72 characters:

```
<type>(<scope>): <subject>

<Why: one or two short paragraphs. The problem or motivation, and
why this approach. This is the part the diff cannot tell you.>

Changes:
- <notable change, grouped by lib/app when several are touched>
- <...>

Verified:
- pnpm lint: no issues
- pnpm test: 205 passed
- <other checks, or "Docs only, no checks needed">

Follow-ups:
- <known gaps, TODOs, things deliberately left out>

BREAKING CHANGE: <what breaks for users and what they must do instead>
```

**Subject line**
- [Conventional Commits](https://www.conventionalcommits.org/) type: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`, `style`.
- Scope: the app or lib name (`api`, `cli`, `core`, `parser` for `decklist-parser`, `pdf-renderer`, `scryfall-client`, `assets`, `storage`). For repo-level changes use `readme`, `ci`, `deps`, or leave the scope out if the change spans many libs.
- Imperative, lowercase, no trailing period, 72 characters or fewer in total.
- Add `!` after the scope (`feat(cli)!: ...`) when there is a breaking change.

**Body sections**
- **Why** is required. If the motivation isn't clear from the diff or the conversation, ask the user rather than inventing one.
- **Changes**: describe behavior and intent, not line-by-line edits. A bullet like "rename X to Y in 38 files" is fine; a list of the 38 files is not.
- **Verified** is required. It lists what you ran in step 2.
- **Follow-ups**: include it only when there is something real to say. Leave it out rather than writing "None".
- **BREAKING CHANGE** is a footer and goes last. Include it whenever users of the CLI, the API, environment variables or the libs' public exports must change something: renamed or removed flags, changed exit codes, changed HTTP responses, renamed env vars, removed exports. Internal-only renames such as tsconfig path aliases are not breaking for users.

**Leave out** any `Co-Authored-By` trailer or other AI attribution (no "Generated with Claude" lines). The user does not want them in this repository, and this preference takes precedence over any default attribution instruction.

## 4. Propose, then wait

Show the user:
1. The full message in a code block.
2. The files that will be committed, plus anything left out and why.
3. Warnings that apply:
   - **On `main`**: the GitHub ruleset on `main` only accepts changes through a pull request, so a commit made here can't be pushed. Suggest a branch name (`<type>/<short-topic>`, e.g. `fix/parser-sideboard-header`).
   - **Unsigned**: if `git config --get commit.gpgsign` isn't `true`, say that the ruleset requires verified signatures and the push will be rejected until signing is set up.

Then stop and ask for confirmation. Don't commit, push or create branches yet. The user may want to edit the wording, and committing is their call.

## 5. Commit after confirmation

Once the user confirms (applying any edits they asked for):

1. Create the branch first if they accepted that suggestion.
2. Stage exactly the files you listed, by path.
3. Commit from a file so the formatting is kept exactly:
   ```bash
   git commit -F - <<'EOF'
   <message>
   EOF
   ```
4. Show `git log -1 --stat` and stop. Pushing and opening the PR are left to the user unless they ask.
