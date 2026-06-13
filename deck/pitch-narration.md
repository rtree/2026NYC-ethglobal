# IntentOS — Narration Script（録画読み上げ専用 / テレプロンプター版）

> **用途**: Zoom 一発撮りの **読み上げ台本**。`pitch-demo-outline.md` (v3) の EN ナレーションと完全同期。
> **読み方**: 太字の EN だけを声に出す。`▷` は画面操作・`⏱` は時間・`↘` はブレス（息継ぎ）の目安。
> **トーン**: 煽らず、落ち着いて事実を積む。~150 wpm。**1か所だけ画面切替**（S3 → D1）。
> **背骨（絶対にブレない1行）**: *Autonomous agents need alignment, not trust.*

---

## 使い方（録画前チェック）

- [ ] product はフルスクリーン、通知 OFF、不要タブ・ブックマークバー非表示。
- [ ] デモ各ステップは **事前に状態を作り**、「結果が出る画面」を操作するだけにする。
- [ ] このファイルを別画面 or 紙で見ながら読む（テレプロンプター代わり）。
- [ ] **切替は1回だけ**：S3 を言い終えた瞬間に slides → product。
- [ ] 詰まったら頭から録り直し。各 beat 単位で録って後で連結も可。

**全体ペース**: 230s / 約 510 words / ~150 wpm。`⏱` の時刻はあくまで目安、**言い切ることを優先**。

---

# ━━━━━━━━━━━━━━━━━━━━━━━━━━
# PART 1 — SLIDES（0:00–1:12）　画面 = スライド
# ━━━━━━━━━━━━━━━━━━━━━━━━━━

## ⏱ 0:00 — TITLE（イントロ・任意 / ~5s）
> ▷ Title スライドを表示したまま、軽く一言で入る。

**“IntentOS — autonomy without authority. Let me show you why that matters.”**

---

## ⏱ 0:00–0:28 — S1 · THE PROBLEM（~28s / ~65 words）
> ▷ 画面: Problem スライド（2:14 AM / "Grow my ETH while I sleep" / optimized perfectly）

**“While you sleep, / the best on-chain opportunities don't wait for you. ↘
So you might hand the job to an AI — / *‘Grow my ETH while I sleep.’* ↘
It can do exactly that, / perfectly. ↘
And that's the real risk: / not an evil AI, / but a wrong intention optimized perfectly — / it missed what you actually meant. ↘
It didn't fail; / it followed the instruction. ↘
Until now you had two bad choices: / approve every action by hand and miss the opportunity, / or hand over authority and lose control.”**

> 💡 最後の "two bad choices" は口頭のみ（スライドにカードは無し）。

---

## ⏱ 0:28–0:52 — S2 · THE THESIS ★背骨（~24s / ~56 words）
> ▷ 画面: Thesis スライド（"Autonomy without authority." + 4本柱カード）

**“IntentOS is a third option: / autonomy without authority. ↘
We compile your intent into a bounded agent — / and align it at every layer. ↘
Intent Builder gives *initial* alignment, / understanding what you mean. ↘
EIP-7702 gives *mechanical* alignment, / enforcing it on-chain. ↘
A Watcher gives *semantic* alignment over time. ↘
The whole idea is one line: / autonomous agents need alignment, / not trust.”**

> 💡 “alignment, not trust” は **ゆっくり・区切って**。ここがピッチの心臓。

---

## ⏱ 0:52–1:12 — S3 · POSITIONING ＋ 予告（~20s / ~48 words）
> ▷ 画面: Positioning スライド（Others vs IntentOS / WATCH FOR THREE THINGS）

**“So IntentOS is not an AI wallet — / it's an alignment and execution layer. ↘
Others ask how to *trust* AI with permissions; / we ask why trust should be required at all. ↘
Let me show you the live product. / Watch for three things: ↘
your intent becomes an agent NFT; / it executes while you sleep; / and a Watcher can tighten it — / but never loosen it.”**

> 🔀 **ここで画面共有を product に切替（唯一の切替）。** 言い切ってから切替→一拍おいて D1 へ。

---

# ━━━━━━━━━━━━━━━━━━━━━━━━━━
# PART 2 — LIVE DEMO（1:12–3:50）　画面 = product
# ━━━━━━━━━━━━━━━━━━━━━━━━━━

## ⏱ 1:12–2:04 — D1 · INITIAL ALIGNMENT 👀見どころ1 / 柱①（~52s / ~115 words）
> ▷ ①既存wallet接続 → ②**World ID で人間証明** → ③Intent Builder の**面談**（質問が出る）→ ④Constitution 表示 → ⑤Owner 署名 → ⑥**NFT mint（"minted ✓"）**

**“Here's the product. / I connect my existing wallet / and prove I'm human with World ID — / that keeps real cloud runtimes from being farmed by bots. ↘
Now, most AI hears ‘accumulate ETH’ / and says ‘OK, starting.’ ↘
IntentOS stops and says: / I need to understand your intent first. ↘
It interviews me — / what matters more, / profit or protecting capital? ↘
If ETH drops thirty percent, / opportunity or abnormal? / What should never happen? ↘
My answers compile into an Intent Constitution / I review and sign — / and the agent is minted as an NFT. ↘
The AI cannot silently decide what I meant.”**

> 🏆 World = bot/sybil から Runtime を守る human gate（必然）。💡「既存ウォレットのまま」を一言。

---

## ⏱ 2:04–2:24 — D2 · MECHANICAL（自分の wallet に付与）🏆ENS / 柱②（~20s / ~46 words）
> ▷ Agent 詳細画面で `agent-123.intentos.eth` / "funds stay in your wallet" / "session key: 0 ETH" を指し示す

**“Here's the mechanical alignment. / We don't move your funds into a new contract wallet. ↘
With EIP-7702, / the rules attach to your own wallet — / funds never move, / you keep self-custody. ↘
The agent is born with a name — / agent-123-dot-intentos-dot-eth — / its permanent ENS identity / that the runtime, the evidence, and the watcher all reference. ↘
And it holds a session key worth zero ETH: / it can request execution, / never own the authority to move your money.”**

> 🏆 ENS = tokenId 確定後に subname 付与・発見可能な公開ID。

---

## ⏱ 2:24–3:00 — D3 · 2:14 AM 自律実行 👀見どころ2 / 柱②（~36s / ~80 words）
> ▷ Runtime Dashboard → "opportunity detected" → Proposal: Swap 50 USDC→ETH → checks ✓(token/amount/slippage/protocol) → **EXECUTE** → tx success → EvidenceCommitted

**“Now I'm offline, / asleep. ↘
The agent runs in its own isolated runtime — / holding no funds — / and proposes: / swap fifty USDC to ETH. ↘
My EIP-7702 account checks the request against my intent — / token, / amount, / slippage, / protocol — / all inside. ↘
Execute. ↘
The agent acted, / I approved nothing, / and authority never left my account. ↘
Anything outside the guardrails / is simply rejected.”**

> 💡 チェックが順に✓ → EXECUTE の瞬間が山。**結果が出る画面**を見せる。

---

## ⏱ 3:00–3:35 — D4 · WATCHER が締める 👀見どころ3 / 柱③（~35s / ~78 words）
> ▷ ETH -40% → Executor「cheaper → keep buying」→ Hard rules "Allowed ✓" → **Watcher** が original intent 読み直し → **TIGHTEN** `$100/day → $10/day`

**“But intent depends on tomorrow's context. / Say ETH drops forty percent. ↘
The executor reasons / ‘it's cheaper — keep buying,’ / and the hard rules still allow it — / it's not broken, / it's optimizing the goal. ↘
So I add a Watcher Agent / for semantic alignment. ↘
It re-reads my original priority — / protect capital first — / sees the extreme volatility, / and tightens the limit: / a hundred dollars a day, / down to ten. ↘
The key design: / a Watcher can only tighten or freeze — / never loosen. ↘
Even if it were compromised, / it could only make me safer. / Only I can loosen again.”**

> 💡 IntentOS が最も光る beat。“never loosen” を**強く・ゆっくり**。

---

## ⏱ 3:35–3:50 — D5 · CLOSING（4本柱回収）/ 柱④（~15s / ~35 words）
> ▷ timeline 全体を一望（Intent → NFT → execution → evidence → watcher）。**デモ後 Closing スライドへ戻す。**

**“Intent Builder aligns at the start, / EIP-7702 enforces it, / the Watcher guards the meaning over time — / and the agent is a transferable NFT, / the start of an agent economy. ↘
Autonomous agents don't need your trust; / they need to stay aligned with what you meant. ↘
We separate intelligence from authority.”**

> 🔚 最後の一文で Closing スライド（"Separate intelligence from authority."）を出して締める。

---

# ━━━━━━━━━━━━━━━━━━━━━━━━━━
# ペース表（語数 → 秒）
# ━━━━━━━━━━━━━━━━━━━━━━━━━━

| Beat | 画面 | 尺 | 語数 | 累計 |
|---|---|---|---|---|
| Title | slide | ~5s | ~12 | 0:05 |
| S1 Problem | slide | 28s | ~65 | 0:28 |
| S2 Thesis ★ | slide | 24s | ~56 | 0:52 |
| S3 Positioning | slide | 20s | ~48 | 1:12 |
| 🔀 切替 slides→product | | | | |
| D1 Initial | product | 52s | ~115 | 2:04 |
| D2 Mechanical | product | 20s | ~46 | 2:24 |
| D3 自律実行 | product | 36s | ~80 | 3:00 |
| D4 Watcher | product | 35s | ~78 | 3:35 |
| D5 Closing | →slide | 15s | ~35 | 3:50 |
| **合計** | | **230s** | **~535** | |

> 語数が 510→535 とやや多め。**早口にせず**、詰まりそうなら S1/D1 の従属節を1つ落として尺を作る。

---

# トラブル時の保険
- 言い間違えたら **その beat の頭から**録り直す（beat 単位で録って連結可）。
- デモが固まったら → 該当画面を**静止画/図に差し替え**て口頭で繋ぐ。最悪 **slides に戻す**。
- 時間超過しそうなら、削ってよい順: ① Title の一言 → ② S1 の "two bad choices" → ③ D2 の ENS 補足。
