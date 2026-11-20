# PRD-0 — Đảo Đèn Lồng (English working copy, Phase 1)

Source: lab board, Phase 1 tab. Lab board wins on any disagreement. Requirements are intentionally vague;
our interpretations live in `docs/notes/assumptions.md`.

## What the customer wants
A 3D game named **Đảo Đèn Lồng** (Lantern Island). The player controls **Mây**, the young lantern keeper of an
island in a sea of clouds. Black fog swallowed the island's light. Mây runs around collecting light motes
(fireflies) and brings them back to relight the **Great Lanterns**.

**Ink Shades** (Bóng Mực) live in the fog, chase Mây, and cost a life (flame) on contact. Mây can **glow**
(pulse) to drive them off, but that costs light. Shades fear the lanterns.

Light all lanterns → win. Lose all flames → lose. There is a score.

## Phase 1 scope
1. One level: **Night 1 – Đảo Bến**, a round island with **5 Great Lanterns**.
2. Character walks, jumps; 3D camera.
3. Motes appear scattered on the island and can be picked up.
4. Deposit light into a lantern to light it.
5. Shades appear and chase the player.
6. Pulse (glow) to repel shades.
7. Win, lose, score, HUD with the necessary information.
8. Can replay after winning or losing.

## Look & feel
Night, warm, fairy-tale. Island brightens as lanterns are lit. Warm yellow-orange = good, purple-black =
danger. Simple but pretty, not realistic. Mây wears a conical hat (nón lá) with a small lantern hanging from
it. No violence, no blood.

## Creative freedom (encouraged)
Extra characters, shade/mote types, small mechanics, events, story, effects, sound… **Must not break PRD-0
or the Test Contract; extras must not change headless output (disable them in headless).** README needs a
short "Sáng tạo của tôi" section with brief evidence the core still works.

## Tech
Free choice. Must run on a laptop (macOS or Linux).

## Phase 1 deliverables (tag `phase-1`, public repo)
1. Playable Night 1 from start to win/lose.
2. `README.md`: install & run in ≤ 3 commands, controls, how our scoring works.
3. `game.contract.json` + headless mode per Test Contract v1.0 (`docs/spec/contract-v1.0.md`).
4. Evidence the game behaves as required + short notes (assumptions, AI usage log).
5. The AI harness used (`AGENTS.md` or equivalent, skills, hooks…).
