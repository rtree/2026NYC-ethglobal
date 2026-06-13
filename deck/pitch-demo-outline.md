# IntentOS — Pitch & Demo Outline (v3 / 母艦準拠・Zoom 2部構成)

> 母艦 `pitch-master.md`（背骨=「alignment, not trust」＋4本柱）から切り出した **3:50 録画版**。
> Zoom 一発撮り前提。前半スライド ~1:12（背骨を立てる）→ 後半ライブデモ ~2:38 の2部構成。
> v3 変更点: **S2 に背骨（alignment, not trust）を復活**、**D1 に Intent Builder の面談を復活**。

## 制約・前提（確定事項）

| 項目 | 値 |
|---|---|
| 尺 | **3分50秒 = 230秒** |
| 1次審査 | **事前録画動画**（＝この台本のメイン用途。デモは画面録画＋ナレーションで確実に魅せる） |
| 2次審査 | **オフライン登壇**（ファイナリスト）。同じ beat を生ピッチへ転用（§7に派生版メモ） |
| 狙う賞 | **Finalist** + **ENS** + **World** |
| 言語 | **英語ナレーション + 和訳併記** |

### 録画方針（Zoom 一発撮り・2部構成）
- **Zoom 画面共有で一発撮り**。凝った編集はしない（失敗したら頭から録り直し）。
- 構成は **2部**: 前半 **スライド ~1:12**（背骨を立てる）→ 後半 **ライブデモ公開 ~2:38**。
- 画面共有の切替は **1回だけ**（slides → product）。これで事故ポイントを最小化。
- 喋りは ~150 wpm 想定。230秒で実ナレーション約490〜510語。デモは操作しながら喋るので少し速くてOK。
- **背骨（絶対にブレない1本）**: 「**Autonomous agents need alignment, not trust（信頼ではなく整合）**」。全 beat はこの一文に向かう。母艦 `pitch-master.md` §0 と同期。
  - 整合の4本柱: ① Intent Builder = Initial / ② EIP-7702 = Mechanical / ③ Watcher = Semantic / ④ Agent NFT = Economy。
- **トーンは「煽り」より「落ち着いた説明」**。事実を淡々と積んで引き込む。ドラマ化しすぎない。
- **スポンサーより先に IntentOS の優位性**を主役に。スポンサー技術（World / ENS / EIP-7702）は優位性を実現する手段として従属させる:
  - 優位性1: **既存ウォレットのまま Self-Custody**（EIP-7702 / 新SCW移行不要・資金が動かない）
  - 優位性2: **ゼロ資産 Runtime**（Agent は 0 ETH の session key のみ・資金を持たない）
  - 優位性3: **一方向ガバナンス**（Watcher は締めるだけ・緩めるのは Owner だけ）
- スライドで「デモで見るべき3点」を**予告** → デモで**回収**（記憶に残す構造）:
  - 見どころ1: Intent → **NFT mint**（動く証拠）
  - 見どころ2: **2:14 AM の自律実行**（承認ゼロで動く）
  - 見どころ3: **Watcher が締める**（締めることしかできない）

### Zoom 撮影 Tips
- デモは**事前に同じ手順を3回**練習し、手が覚えた状態で本番。
- tx / ネット遅延対策: 重い処理は**事前に状態を作っておき**、デモは「結果が出る画面」を見せる。
- product は**フルスクリーン**、ブックマークバー・通知・余計なタブは隠す。
- 1テイク前提だが、**スライドとデモを別ファイルで録って後で連結**も保険として可。

---

## 1. タイムバジェット（230秒 / 2部構成）

**前半：スライド（0:00–1:12 = 72s）／後半：ライブデモ公開（1:12–3:50 = 158s）**

### Part 1 — Slides（72s）※背骨「alignment, not trust」をここで立てる
| # | Beat | 柱 | 時間 | 尺 | 語数目安 |
|---|------|----|------|----|---------|
| S1 | Problem（2:14 AM フック＋間違った意図＋two bad choices） | — | 0:00–0:28 | 28s | ~65 |
| S2 | Thesis（alignment, not trust ＋ 4本柱の地図） | 全体 | 0:28–0:52 | 24s | ~56 |
| S3 | Positioning ＋ 見どころ予告（AI walletではない） | — | 0:52–1:12 | 20s | ~48 |

### Part 2 — Live Demo（158s）※ここで画面共有を product に切替（1回だけ）
| # | Beat | 柱 | 時間 | 尺 | 語数目安 | 見どころ |
|---|------|----|------|----|---------|---------|
| D1 | Initial: Intent Builder 面談 ＋ World ID ＋ mint | ① | 1:12–2:04 | 52s | ~115 | 👀1 |
| D2 | Mechanical: 自分の wallet に付与 / 0 ETH key / ENS | ② | 2:04–2:24 | 20s | ~46 | 🏆ENS |
| D3 | Mechanical: 2:14 AM 自律実行 | ② | 2:24–3:00 | 36s | ~80 | 👀2 |
| D4 | Semantic: Watcher が締める | ③ | 3:00–3:35 | 35s | ~78 | 👀3 |
| D5 | Closing（4本柱回収 ＋ separate） | ④ | 3:35–3:50 | 15s | ~35 | |
|  | **合計** | | | **230s** | **~510** | |

> D2 はデモ画面の上に図解オーバーレイ or 一瞬スライドに戻す。基本は product 画面のまま口頭補足が安全。

---

## 2. Beat 別 台本（EN ナレーション / 和訳 / 画面 / 見せ場）

---
## Part 1 — Slides（0:00–1:12）※背骨を立てる
---

### S1 — Problem（0:00–0:28 / Slide）
- **スライド**: 静かな背景に「2:14 AM」。眠っている人と動き続けるチャート → `Goal: MAXIMIZE_ETH` → Paperclip → 下に "two bad choices"。
- **EN**: "While you sleep, the best on-chain opportunities don't wait for you. So you might hand the job to an AI — *'Grow my ETH while I sleep.'* It can do exactly that, perfectly. And that's the real risk: not an evil AI, but a wrong intention optimized perfectly — it missed what you actually meant. It didn't fail; it followed the instruction. Until now you had two bad choices: approve every action by hand and miss the opportunity, or hand over authority and lose control."
- **和訳**: 「あなたが眠っている間も、オンチェーンの良いチャンスは待ってはくれません。だからAIにこう任せるかもしれません——『寝ている間にETHを増やしておいて』。AIはその通りに、完璧にこなせます。そして、そこにこそ本当のリスクがあります——悪意あるAIではなく、間違った意図が完璧に最適化されること。あなたが本当に意図したことを取りこぼしたまま。AIは失敗していません。指示に従っただけです。これまで選択肢は2つの悪手だけでした。毎回手で承認してチャンスを逃すか、権限を渡して制御を失うか。」
- **キーコピー（画面）**: *"AI did not fail. It followed the instruction."*
- **母艦対応**: Slide 2。

### S2 — Thesis: alignment, not trust（0:28–0:52 / Slide）★背骨
- **スライド**: 中央に大きく **"Autonomy without authority."**。下に4本柱の地図 `Human → Intent Builder ① → Intent Constitution → Executor (NFT ④) → EIP-7702 ② → Watcher ③`。
- **EN**: "IntentOS is a third option: autonomy without authority. We compile your intent into a bounded agent — and align it at every layer. Intent Builder gives initial alignment, understanding what you mean. EIP-7702 gives mechanical alignment, enforcing it on-chain. A Watcher gives semantic alignment over time. The whole idea is one line: autonomous agents need alignment, not trust."
- **和訳**: 「IntentOSは第三の選択肢です——権限を渡さない自律。あなたのIntentを境界づけられたAgentへコンパイルし、あらゆる層で整合させます。Intent Builderが“最初の整合”——あなたの意味を理解します。EIP-7702が“機械的な整合”——それをオンチェーンで強制します。Watcherが時間を超えた“意味的な整合”を与えます。すべてはたった1行に集約されます——自律Agentに必要なのは、信頼ではなく、整合。」
- **キーコピー（画面）**: *"Autonomous agents need alignment, not trust."*
- **母艦対応**: Slide 3 + Final（背骨と4本柱）。**前回欠落していた最重要 beat**。

### S3 — Positioning ＋ 見どころ予告（0:52–1:12 / Slide）
- **スライド**: `Others: "How can we trust AI with permissions?"` vs `IntentOS: "Why should trust be required?"`。右に「今からライブで見せる3つ」。
- **EN**: "So IntentOS is not an AI wallet — it's an alignment and execution layer. Others ask how to trust AI with permissions; we ask why trust should be required at all. Let me show you the live product. Watch for three things: your intent becomes an agent NFT; it executes while you sleep; and a Watcher can tighten it — but never loosen it."
- **和訳**: 「だからIntentOSはAIウォレットではありません——“整合＆実行レイヤー”です。他は『どうすればAIに権限を任せて信頼できるか』を問いますが、私たちは『そもそもなぜ信頼が必要なのか』を問います。これからライブで製品をお見せします。注目点は3つ。Intentが**Agent NFT**になること。**眠っている間に実行**されること。そして**Watcher**はそれを締められるが、決して緩められないこと。」
- **制作メモ**: 見どころ3点を予告し、言い終えたら**画面共有を product に切替（唯一の切替）**。
- **母艦対応**: Slide 12 + 見どころ予告。

---
## Part 2 — Live Demo（1:12–3:50）※product 画面を共有
---

### D1 — Initial alignment: Intent Builder 面談 ＋ World ID ＋ mint（1:12–2:04 / Demo）👀見どころ1 / 柱①
- **操作**: ①既存wallet接続 → ②**World ID で人間証明**（明確に映す）→ ③IntentBuilder の**面談**（質問が出る様子を見せる）→ ④Intent Constitution / Hard・Semantic Guardrails 表示 → ⑤Owner 署名 → ⑥**Executor Agent NFT mint**（"minted ✓"）。
- **EN**: "Here's the product. I connect my existing wallet and prove I'm human with World ID — that keeps real cloud runtimes from being farmed by bots. Now, most AI hears 'accumulate ETH' and says 'OK, starting.' IntentOS stops and says: I need to understand your intent first. It interviews me — what matters more, profit or protecting capital? If ETH drops thirty percent, opportunity or abnormal? What should never happen? My answers compile into an Intent Constitution I review and sign — and the agent is minted as an NFT. The AI cannot silently decide what I meant."
- **和訳**: 「これが製品です。既存のウォレットを接続し、World IDで人間だと証明します——これで本物のクラウドRuntimeがbotに量産されるのを防ぎます。さて、多くのAIは『ETHを貯めて』と聞けば『OK、始めます』と言います。IntentOSは立ち止まってこう言います——まずあなたの意図を理解させてください。そしてインタビューします——利益と元本保護、どちらが大事ですか？ ETHが30%下落したら、好機ですか異常ですか？ 絶対に起きてはいけないことは？ 私の答えは、私が確認して署名する Intent Constitution にコンパイルされ——Agentが**NFTとしてmint**されます。AIが“私の意味”を勝手に決めることはできません。」
- **キーコピー（画面）**: *"Normal AI: 'OK. Starting.' / IntentOS: 'I need to understand your intent first.'*
- **💡 柱①の核心**: 「意図を理解してから動く」= **Initial alignment**。IntentOS 最大の差別化（前回これを落としていた）。
- **💡 優位性A**: 「**既存ウォレットのまま**」始められる（新SCW移行不要）を一言添える。
- **🏆 World 見せ場**: 「Runtime 量産（bot/sybil）を防ぐ human proof gate」という**必然性**を口頭で明示。

### D2 — Mechanical alignment: 自分の wallet に付与（2:04–2:24 / Demo＋口頭）💡優位性 + 🏆ENS / 柱②
- **操作**: mint 直後の Agent 詳細画面で `agent-123.intentos.eth`（ENS名）と「funds stay in your wallet」「session key: 0 ETH」を指し示す。
- **EN**: "Here's the mechanical alignment. We don't move your funds into a new contract wallet. With EIP-7702, the rules attach to your own wallet — funds never move, you keep self-custody. The agent is born with a name — agent-123-dot-intentos-dot-eth — its permanent ENS identity that the runtime, the evidence, and the watcher all reference. And it holds a session key worth zero ETH: it can request execution, never own the authority to move your money."
- **和訳**: 「これが“機械的な整合”です。資金を新しいコントラクトウォレットへ移しません。EIP-7702で、ルールは*あなた自身のウォレット*に付与されます——資金は動かず、セルフカストディが保たれます。Agentは名前を持って生まれます——**agent-123.intentos.eth**、Runtime・証跡・Watcherがすべて参照する恒久的な**ENS**アイデンティティです。そしてAgentが持つのは**0 ETH**のセッションキーだけ。実行を要求はできても、あなたのお金を動かす権限は決して持てません。」
- **💡 優位性A/B**: ①**既存ウォレットのまま Self-Custody**／②**ゼロ資産 Runtime**（key 0 ETH）。どちらも柱②の証明。
- **🏆 ENS 見せ場**: 「tokenId 確定後に subname 付与」「ENSIP-26 text records（agent-context / agent-endpoint）に紐づく**発見可能な公開ID**」を口頭で強調。

### D3 — Mechanical alignment: 2:14 AM 自律実行（2:24–3:00 / Demo）👀見どころ2 / 柱②
- **操作**: Runtime Dashboard → "opportunity detected" → Proposal: Swap 50 USDC→ETH → EIP-7702 account のチェックが順に✓（token / amount / slippage / protocol）→ **EXECUTE** → tx success → timeline に EvidenceCommitted。
- **EN**: "Now I'm offline, asleep. The agent runs in its own isolated runtime — holding no funds — and proposes: swap fifty USDC to ETH. My EIP-7702 account checks the request against my intent — token, amount, slippage, protocol — all inside. Execute. The agent acted, I approved nothing, and authority never left my account. Anything outside the guardrails is simply rejected."
- **和訳**: 「いま私はオフライン、眠っています。Agentは資金を一切持たない隔離Runtimeの中で動き、提案します——50 USDCをETHにスワップ。私のEIP-7702アカウントが、その要求を私の意図と照合します——トークン、金額、スリッページ、プロトコル——すべて内側。**実行**。Agentは動き、私は何も承認せず、権限は一度も私のアカウントを離れていません。ガードレールの外にあるものは、ただ拒否されます。」
- **💡 柱②の証明**: 隔離 Runtime ＋ ゼロ資産で 24/7 自律。外側は contract が revert（機械的強制）。
- **制作メモ**: チェックが順に✓→EXECUTE の瞬間が山。事前に状態を作り、結果が出る画面を見せる。

### D4 — Semantic alignment: Watcher が締める（3:00–3:35 / Demo）👀見どころ3 / 柱③
- **操作**: ETH -40% アラート → Executor「cheaper → keep buying」→ Hard rules "Allowed ✓" → **Watcher Agent** が original intent を読み直す → "protect capital first" → **TIGHTEN** `$100/day → $10/day`。一方向ガバナンスの注記。
- **EN**: "But intent depends on tomorrow's context. Say ETH drops forty percent. The executor reasons 'it's cheaper — keep buying,' and the hard rules still allow it — it's not broken, it's optimizing the goal. So I add a Watcher Agent for semantic alignment. It re-reads my original priority — protect capital first — sees the extreme volatility, and tightens the limit: a hundred dollars a day, down to ten. The key design: a Watcher can only tighten or freeze — never loosen. Even if it were compromised, it could only make me safer. Only I can loosen again."
- **和訳**: 「ただしIntentは明日の文脈に左右されます。たとえばETHが40%下落したとします。Executorは『安くなった、買い続けよう』と判断し、ハードルール上はそれが許可されます——壊れてはいません、目標を最適化しているだけです。そこで“意味的な整合”のために**Watcher Agent**を追加します。Watcherは私の本来の優先順位——元本保護を最優先——を読み直し、極端なボラティリティを見て、上限を**締めます**。1日100ドルを、10ドルへ。核となる設計はこれです——Watcherにできるのは**“締める・凍結する”だけ。決して緩められません**。仮に乗っ取られても、できるのは私をより安全にすることだけ。緩められるのは私だけです。」
- **💡 柱③の証明 / 優位性C**: **一方向ガバナンス**。Watcher を信頼しなくてよい設計（壊れても安全側）。IntentOS 独自性が最も光る beat。
- **キーコピー（画面/口頭）**: *"Rules protect actions. Watchers protect intentions."*

### D5 — Closing: 4本柱回収（3:35–3:50 / Demo画面のまま or ロゴへ）/ 柱④
- **操作**: timeline 全体を一望（Intent → NFT → execution → evidence → watcher）。最後にロゴ＋4本柱。
- **EN**: "Intent Builder aligns at the start, EIP-7702 enforces it, the Watcher guards the meaning over time — and the agent is a transferable NFT, the start of an agent economy. Autonomous agents don't need your trust; they need to stay aligned with what you meant. We separate intelligence from authority."
- **和訳**: 「Intent Builderが最初に整合し、EIP-7702がそれを強制し、Watcherが時間を超えて意味を守る——そしてAgentは譲渡可能なNFT、Agent経済の始まりです。自律Agentに必要なのは“信頼”ではなく、あなたが意図したものとアラインし続けることです。私たちは**知性を、権限から切り離します。**」
- **制作メモ**: 4本柱（① Intent Builder / ② EIP-7702 / ③ Watcher / ④ NFT）を一息で回収 → "separate intelligence from authority" で締める。
- **母艦対応**: Slide 11 + 12 + Final。

---

## 3. IntentOS の優位性 ＆ スポンサー賞フィット

> 方針: **IntentOS の優位性を主役**にし、スポンサー技術はそれを実現する手段として語る。
> 「技術の寄せ集め」ではなく「優位性に必然的にこの技術が要る」と聞かせる。

### 💡 IntentOS の3つの優位性（ナラティブの軸）
| # | 優位性 | 何が嬉しいか | 実現手段（従属） | 登場 beat |
|---|--------|-------------|----------------|----------|
| 1 | **既存ウォレットのまま Self-Custody** | 新SCW(Safe等)へ移行不要・資金が動かない・移行UXの壁ゼロ | EIP-7702 | D1 / D2 |
| 2 | **ゼロ資産 Runtime** | Agent は 0 ETH の session key のみ。鍵漏洩でも資金は無事 | session key + KMS + 署名/支払い分離 | D2 / D3 |
| 3 | **一方向ガバナンス** | Watcher は締めるだけ。壊れても安全側に倒れる＝Watcher を信頼不要 | Watcher + ExecutionContract | D4 |

### 🏆 World（D1）
- 使い所: **Runtime 作成前の human proof gate**。
- 殺し文句: "World ID gates real cloud runtimes against bot/sybil abuse." 
- なぜ必然か: Agent ごとに Cloud Run 上の本物 Runtime を立てるため、無制限利用だと compute/model cost が破綻 → だから人間証明が**経済的に必要**。「飾りの統合ではない」と言い切れる。

### 🏆 ENS（D2）
- 使い所: `agent-<tokenId>.intentos.eth` の **subname**＝Agent の恒久アイデンティティ。
- 殺し文句: "Every agent is born with an ENS name that runtime, evidence, and watcher all reference."
- 深み: **ENSIP-25/26** text records（agent-context / agent-endpoint / agent-registration）＋ **ERC-8004** registration と接続 → 「発見可能な Agent 公開ID」。

> メモ: North Star は `intentos.base.eth`（Basename）表記。ENS賞を主眼にするなら録画では `*.eth`（ENS）に寄せた表記で見せるのが無難。最終的にどちらを正にするか要確認（§6 Q4）。

---

## 4. ライブデモ 操作シナリオ（Zoom 画面共有）

> 一発撮り前提。各ステップは**事前に状態を作っておき**、デモでは「結果が出る画面」を操作して見せる。

| Step | Beat | 画面 | 操作・見せる要素 | 事前準備（仕込み） |
|---|---|---|---|---|
| 1 | D1 | Onboarding | wallet 接続 → **World ID 証明** | テストwallet接続済み、World ID はsandbox/モック可 |
| 2 | D1 | Intent Builder | 自然言語入力 → Constitution 表示 | プロンプト文面を固定、応答を安定化 |
| 3 | D1 | Mint | "Executor Agent NFT minted ✓" | テストネットで事前に通る状態に |
| 4 | D2 | Agent 詳細 | `agent-123.intentos.eth` / funds stay / key 0 ETH | ENS 名は解決済み表示 or 図 |
| 5 | D3 | Runtime Dashboard | Proposal → Guard ✓ → EXECUTE → tx → Evidence | swap 状態を直前まで用意 |
| 6 | D4 | Watcher | -40% → TIGHTEN `$100→$10` | -40% シナリオを注入できる状態に |

- **詰まった時の保険**: 該当 Step を静止画/図に差し替えて口頭で繋ぐ。最悪 **slides に戻れる**よう手元に控える。
- **切替は1回**（slides → product）。デモ内ではタブ/画面の行き来を最小化。

---

## 5. 母艦 → 録画版の cut（13枚 → 2部構成）／ v3 変更点

**母艦 `pitch-master.md` からの写像:**
| 録画 beat | 母艦スライド | 柱 |
|---|---|---|
| S1 Problem | Slide 2 | — |
| **S2 Thesis（背骨）** | **Slide 3 + Final** | 全体 |
| S3 Positioning＋予告 | Slide 12 | — |
| **D1 面談＋mint** | **Slide 4** + 5 | ① |
| D2 Mechanical | Slide 6 + 7 | ② |
| D3 自律実行 | Slide 8 | ② |
| D4 Watcher | Slide 9 + 10 | ③ |
| D5 Closing | Slide 11 + 12 + Final | ④ |

**v3 で復活させた2点（v2で欠落していた背骨）:**
- ✅ **S2 に「alignment, not trust」＋4本柱**を立てた（Slide 3 + Final 由来）。前半で思想の背骨が通る。
- ✅ **D1 に Intent Builder の面談**（`Normal AI:「OK. Starting.」` vs `IntentOS:「理解させてください」`＋3つの質問）を主役化（Slide 4 由来）。差別化の核を回復。

**その他の圧縮方針（維持）:**
- Slide 6/7（EIP-7702 / Zero-Asset）→ D2 に圧縮（デモ画面上で口頭）。
- Slide 13(Future) は録画では割愛（尺優先）→ 2次オフライン版で口頭補足（§7）。
- 優位性（Self-Custody / ゼロ資産 / 一方向）は単独羅列せず、各柱の**証明**として配置。

---

## 6. オープン質問（ブラッシュアップ前に確認したい）

1. **デモ素材の現実性**: Step1–6 のうち、今“実画面”で操作できるのはどこまで？（できない所は静止画/図に振る）
2. **mint チェーン**: 録画で見せるのは Base 前提でOK？（North Star は Base 言及あり）
3. **2:14 AM デモの数値**: "50 USDC→ETH" / "$100→$10" の具体値はこの台本の値で確定してよい？
4. **命名表記**: ENS賞狙いとして録画は `agent-123.intentos.eth`（ENS）で統一する？それとも `*.intentos.base.eth`（Basename）？
5. **ロゴ/ビジュアル**: 既存のブランド素材（色・ロゴ・フォント）はある？なければ Marp テーマを新規作成。
6. **前半スライドの作り方**: 3枚は Marp（Markdown→PDF/PPTX）で作ってよい？

---

## 7. 2次審査（オフライン登壇）派生メモ

- 同じ **S1–S3 ＋ D1–D5** を土台に、デモは録画を再生 or 一部ライブ。登壇では「間」と熱量を足せる。
- 追加で入れる候補（録画では割愛したもの）:
  - Future（Phase 1/2/3、Agent economy）を**口頭30秒**で。
  - Q&A 対策: Relayer の gas 立替/枯渇リスク（→ 将来サブスク原資で Relayer プール）を1枚バックアップに。
- 登壇版は録画版より **+1〜2分**の Q&A を想定し、Closing の CTA を「次の一手（賞/協業）」に寄せる。

---

## 次アクション（合意後）
- [ ] この **2部構成（S1–S3 / D1–D5）** へ FB → 確定
- [ ] §6 のオープン質問に回答
- [ ] 合意後、`deck/pitch.md`（Marp）で**前半スライド3枚**を作成 → PDF/PPTX 書き出し
- [ ] ライブデモ操作シナリオ（§4）に沿って**仕込み＆通し練習3回**
