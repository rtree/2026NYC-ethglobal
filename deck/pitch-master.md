# IntentOS — Pitch Master Deck（母艦 / 長尺・原デッキ忠実版）

> 目的: 原デッキ「IntentOSのハックは何か」の**背骨と網羅性**を忠実に再現した母艦。
> ここから 3:50 録画版（`pitch-demo-outline.md`）や 2次オフライン登壇版を**切り出す**。
> 各スライドに EN ナレーション + 和訳 + どの alignment 柱かを明示。

---

## 0. 背骨（このデッキが絶対にブレない一本の論理）

原デッキが「長くてもポイントを押さえていた」理由は、全スライドがこの1文に向かって積み上がっていたから。

> **Autonomous agents need alignment, not trust.**
> （自律Agentに必要なのは“信頼”ではなく“整合”だ）

そして「整合」を3段階＋経済圏で構成する **4本柱**:

| 柱 | 何の alignment か | 担うもの | 原デッキ Slide |
|---|---|---|---|
| ① **Initial alignment** | 最初に「人間の意味」を理解する | **Intent Builder** | 4 |
| ② **Mechanical alignment** | 機械的に境界を強制する | **EIP-7702 ExecutionContract** | 6 / 7 / 8 |
| ③ **Semantic alignment** | 時間が経っても意味を守る | **Watcher Agent** | 9 / 10 |
| ④ **Agent economy** | 整合した Agent を所有・流通させる | **Agent NFT** | 5 / 11 |

```text
Human "I want..."
  → Intent Builder         ① Initial alignment
  → Intent Constitution
  → Executor Agent (NFT)    ④ economy
  → EIP-7702 Account        ② Mechanical alignment
  → Watcher Agent           ③ Semantic alignment
```

**IntentOS の3つの優位性は、この柱の“証明”として配置する**（advantage を単独で羅列しない）:
- 優位性A: **既存ウォレットのまま Self-Custody**（新SCW移行不要）→ ②の証明
- 優位性B: **ゼロ資産 Runtime**（Agent は 0 ETH）→ ②の証明
- 優位性C: **一方向ガバナンス**（締めるだけ・緩めるは Owner）→ ③の証明

---

## 1. スライド構成（原デッキ 13 + Final を忠実踏襲）

| # | Slide | 柱 | 一言メッセージ |
|---|-------|----|--------------|
| 1 | Title | — | 曖昧な意図を、整合し続ける自律Agentへ |
| 2 | The Core Problem | — | リスクは悪意ではなく「間違った意図の完璧な最適化」 |
| 3 | Introducing IntentOS | 全体 | 意図を、境界づけられた自律実行へコンパイル |
| 4 | Step 1: Intent Builder | ① | 言葉にされない前提を明確化する |
| 5 | Agent Creation | ④ | 意図から自律プロセスへ |
| 6 | Mechanical Alignment (EIP-7702) | ② | autonomy を渡す、authority は渡さない |
| 7 | Zero-Asset Runtime | ② | Agent を「無一文」に保つ |
| 8 | Autonomous Execution Demo | ② | 2:14 AM、Owner オフラインでも動く |
| 9 | Semantic Alignment (Watcher) | ③ | ルールは行動を守る、Watcherは意図を守る |
| 10 | One-Way Governance | ③ | Watcherは締めるだけ、緩めるは Owner |
| 11 | Agent NFT Economy | ④ | Agentは所有可能な自律プロセス |
| 12 | Positioning | — | AI walletではない、alignment & execution layer |
| 13 | Future | — | guarded execution → agent economy |
| F | Closing | — | alignment, not trust / 4本柱 |

---

## 2. スライド別 マスター台本（EN / 和訳 / ビジュアル / 柱）

### Slide 1 — Title
- **柱**: —
- **ビジュアル**: ロゴ。サブに `Human "Grow my ETH while I sleep." → IntentOS: Understanding intent before execution.`
- **見出し**: **IntentOS** — *Turning vague human intent into autonomous agents that stay aligned.*
- **EN**: "IntentOS turns vague human intent into autonomous agents that stay aligned — even while you sleep."
- **和訳**: 「IntentOSは、人間の曖昧な意図を、時間が経っても整合し続ける自律Agentへ変換します——あなたが眠っている間も。」

### Slide 2 — The Core Problem
- **柱**: —（問題提起）
- **ビジュアル**: `"Grow my ETH while I sleep."` → `Goal detected: MAXIMIZE_ETH` → Paperclip problem。下に "two bad choices"。
- **見出し**: *The risk isn't evil AI. It is perfectly optimized wrong intentions.*
- **EN**: "The real risk was never an evil AI. It's a wrong intention, optimized perfectly. Say 'maximize ETH,' and an AI may achieve exactly that — while missing the human meaning behind it. It didn't fail. It followed the instruction. Today we have two bad choices: approve every action by hand and lose the opportunity, or hand an agent authority and take on real risk. IntentOS creates a third option — autonomy without giving away authority."
- **和訳**: 「本当のリスクは悪意あるAIではありません。間違った意図が、完璧に最適化されることです。『ETHを最大化して』と言えば、AIはまさにそれを達成します——その背後にある人間の意味を取りこぼしたまま。AIは失敗していません。指示に従っただけです。今ある選択肢は2つの悪手だけ。毎回手で承認してチャンスを逃すか、Agentに権限を渡して実際のリスクを負うか。IntentOSは第三の選択肢を作ります——権限を手放さない自律です。」
- **キーコピー**: *"AI did not fail. It followed the instruction."*

### Slide 3 — Introducing IntentOS
- **柱**: 全体地図
- **ビジュアル**: フロー `Human "I want..." → Intent Builder → Intent Constitution → Executor Agent → EIP-7702 Account → Watcher Agent`。各段に①②③④のタグ。
- **見出し**: *Compile human intent into bounded autonomous execution.*
- **EN**: "IntentOS compiles human intent into bounded autonomous execution. Before we give an agent any autonomy, we first understand what you actually mean. That intent becomes a constitution, an executor agent, an account that enforces the rules, and a watcher that guards the meaning over time. Four layers, one idea: alignment, not trust."
- **和訳**: 「IntentOSは、人間の意図を“境界づけられた自律実行”へコンパイルします。Agentに自律性を与える前に、まずあなたが本当に意図することを理解します。その意図は、Constitution（憲法）に、Executor Agentに、ルールを強制するアカウントに、そして時間を超えて意味を守るWatcherになります。4つの層、たった1つの思想——信頼ではなく、整合。」
- **制作メモ**: ここで4本柱の地図を提示。以降のスライドが地図のどこかを常に示す。

### Slide 4 — Step 1: Intent Builder ①Initial alignment
- **柱**: ① Initial alignment（**差別化の核**）
- **ビジュアル**: 対話。`User: "I want to accumulate ETH automatically."` / `Normal AI: "OK. Starting."` / `IntentOS: "I need to understand your intent first."` 質問3つ → Intent Constitution → Owner signs。
- **見出し**: *Clarifying the unwritten rules.*
- **EN**: "Most AI hears 'accumulate ETH' and says 'OK, starting.' IntentOS stops and says: I need to understand your intent first. It interviews you. What matters more — maximize profit, or protect capital? If ETH drops thirty percent, is that a buying opportunity, or an abnormal condition? And what should never happen? Your answers compile into an Intent Constitution — machine-readable constraints that you review and sign. The AI cannot silently decide what you meant."
- **和訳**: 「多くのAIは『ETHを貯めて』と聞けば『OK、始めます』と言います。IntentOSは立ち止まってこう言います——まずあなたの意図を理解させてください。そしてインタビューします。利益の最大化と元本の保護、どちらが大事ですか？ ETHが30%下落したら、それは買い場ですか、それとも異常事態ですか？ そして、絶対に起きてはいけないことは何ですか？ あなたの答えは Intent Constitution——あなたが確認して署名する、機械可読な制約——にコンパイルされます。AIが“あなたの意味”を勝手に決めることはできません。」
- **キーコピー**: *"Normal AI: 'OK. Starting.' / IntentOS: 'I need to understand your intent first.'*
- **💡 なぜ核心か**: 「意図を理解してから動く」のは IntentOS だけ。ここが**最初の整合（Initial alignment）**であり、最大の差別化。

### Slide 5 — Agent Creation ④economy
- **柱**: ④ Agent economy（identity の誕生）
- **ビジュアル**: チェックリスト `✓ Executor Agent NFT minted / ✓ Agent identity created / ✓ Runtime Capsule deployed / ✓ EIP-7702 account configured / ✓ Guardrails installed / ✓ Session capability issued`。
- **見出し**: *From intent to autonomous process.*
- **EN**: "Once you sign, the agent is created. The NFT is not a picture — it represents a living autonomous process: its identity, its runtime right, its Intent Constitution, its evidence history, and the foundation for its reputation. In one step, the executor is minted, its runtime is deployed, the EIP-7702 account is configured, guardrails are installed, and a session capability is issued."
- **和訳**: 「署名すると、Agentが生成されます。このNFTは絵ではありません——生きた自律プロセスを表します。そのアイデンティティ、Runtimeの権利、Intent Constitution、証跡の履歴、そして評判の基盤。ワンステップで、Executorがmintされ、Runtimeが配備され、EIP-7702アカウントが設定され、ガードレールが組み込まれ、セッション権限が発行されます。」
- **キーコピー**: *"The NFT is not a picture. It represents a living autonomous agent."*

### Slide 6 — Mechanical Alignment with EIP-7702 ②Mechanical
- **柱**: ② Mechanical alignment（核心）
- **ビジュアル**: `Owner EOA (funds stay here) → EIP-7702 Execution Rules → Guarded Execution ↑ Executor Agent (requests only)`。Hard Guardrails の箇条書き。
- **見出し**: *Give the agent autonomy, not authority.*
- **EN**: "Here is the mechanical alignment. IntentOS does not give the agent your wallet — it gives your wallet your intent. Using EIP-7702, we attach execution rules directly to your own account. Your funds never move — you keep self-custody, with no migration to a new contract wallet. The agent can think and request, but it never owns fund-moving authority. Allowed assets, amount limits, slippage limits, approved protocols, expirations — all enforced on every action."
- **和訳**: 「これが機械的な整合です。IntentOSはAgentにあなたのウォレットを渡しません——あなたのウォレットに、あなたの意図を渡します。EIP-7702を使い、実行ルールをあなた自身のアカウントに直接付与します。資金は一切動かず——セルフカストディは保たれ、新しいコントラクトウォレットへの移行も不要です。Agentは考え、要求はできますが、資金を動かす権限は決して持ちません。許可された資産、金額上限、スリッページ上限、承認済みプロトコル、有効期限——すべてが毎回の行動で強制されます。」
- **キーコピー**: *"IntentOS does not give the agent your wallet. It gives your wallet your intent."*
- **💡 優位性A（証明）**: 既存ウォレットのまま Self-Custody。新SCW移行のUXの壁ゼロ。

### Slide 7 — Zero-Asset Runtime ②Mechanical
- **柱**: ② Mechanical alignment
- **ビジュアル**: `Runtime does NOT hold: ❌ private key ❌ fund-moving authority ❌ assets / holds ✓ limited execution request capability`。Relayer の役割。
- **見出し**: *Keeping autonomous agents broke.*
- **EN**: "And we keep the agent broke — on purpose. The runtime holds no private key, no fund-moving authority, no assets. It holds only a limited capability to request execution. A relayer submits the transactions and handles gas, then gets reimbursed from an owner-controlled gas budget. So the agent can run twenty-four-seven, while authority stays with you."
- **和訳**: 「そしてAgentを——意図的に——無一文に保ちます。Runtimeは秘密鍵も、資金を動かす権限も、資産も持ちません。持つのは、実行を要求する限定的な権限だけです。Relayerがトランザクションを送信しgasを処理し、その後Owner管理のgas予算から精算されます。だからAgentは24時間365日動けて、権限はあなたの手元に残ります。」
- **キーコピー**: *"The agent can run 24/7. But authority stays with the owner."*
- **💡 優位性B（証明）**: ゼロ資産 Runtime（0 ETH の session key のみ）。鍵が漏れても資金は無事。

### Slide 8 — Autonomous Execution Demo ②Mechanical
- **柱**: ② Mechanical alignment（実演）
- **ビジュアル**: `2:14 AM / Owner offline` → `Proposal: Swap 50 USDC → ETH` → checks ✓(token/amount/slippage/protocol) → `EXECUTE` → success。
- **見出し**: *Autonomous execution, while you sleep.*
- **EN**: "Two-fourteen AM. You're offline. The agent spots an opportunity and proposes: swap fifty USDC to ETH. Your EIP-7702 account checks the request against your intent — token allowed, amount allowed, slippage allowed, protocol allowed. Execute. The agent acted, you approved nothing, and authority never left your account. Anything outside the guardrails is simply rejected."
- **和訳**: 「午前2時14分。あなたはオフラインです。Agentがチャンスを捉え、提案します——50 USDCをETHにスワップ。あなたのEIP-7702アカウントが、その要求をあなたの意図と照合します——トークンOK、金額OK、スリッページOK、プロトコルOK。実行。Agentは動き、あなたは何も承認せず、権限は一度もあなたのアカウントを離れていません。ガードレールの外にあるものは、ただ拒否されます。」
- **キーコピー**: *"The agent acted. The owner did not approve manually. Authority never left the owner account."*

### Slide 9 — Semantic Alignment: Watcher Agent ③Semantic
- **柱**: ③ Semantic alignment（最も独自）
- **ビジュアル**: `Original Intent: "Accumulate ETH safely."` → `Market: ETH -40%, extreme volatility` → `Executor: "ETH is cheaper, buying matches the goal."` → Hard Guardrails: Allowed ✓ → `Watcher: original priority = protect capital first → TIGHTEN`。
- **見出し**: *Rules protect actions. Watchers protect intentions.*
- **EN**: "But hard rules only enforce what we know today. Human intent depends on future context. ETH drops forty percent. The executor reasons: 'it's cheaper, and buying matches accumulation.' The hard guardrails say it's allowed — and the executor is not broken; it's optimizing the goal. So we add a Watcher Agent. It re-reads your original priority — protect capital first — sees the extreme volatility, and decides to tighten: a hundred dollars a day, down to ten. The executor follows the goal; the watcher preserves the meaning."
- **和訳**: 「しかしハードルールは、“今わかっていること”しか強制できません。人間の意図は未来の文脈に左右されます。ETHが40%下落します。Executorはこう判断します——『安くなった、買うことは“貯める”目標に合致する』。ハードガードレールは許可します——そしてExecutorは壊れていません。目標を最適化しているだけです。そこでWatcher Agentを追加します。Watcherはあなたの本来の優先順位——元本保護を最優先——を読み直し、極端なボラティリティを見て、締めると判断します。1日100ドルを、10ドルへ。Executorは目標に従い、Watcherは意味を守ります。」
- **キーコピー**: *"Rules protect actions. Watchers protect intentions."*

### Slide 10 — One-Way Governance ③Semantic
- **柱**: ③ Semantic alignment（設計の美しさ）
- **ビジュアル**: `Watcher CANNOT: ❌ trade ❌ move funds ❌ increase limits ❌ unfreeze` / `Watcher CAN ONLY: ✓ reduce permissions ✓ freeze`。
- **見出し**: *Watcher can ONLY tighten, NEVER loosen.*
- **EN**: "And the watcher is one-way by design. It cannot trade, move funds, raise limits, or unfreeze. It can only reduce permissions or freeze execution. This means you don't even have to fully trust the watcher: a watcher failure shifts the system toward safe shutdown, never toward expanded authority. Only the human owner can ever loosen permissions again."
- **和訳**: 「そしてWatcherは設計上、一方向です。取引も、資金移動も、上限引き上げも、凍結解除もできません。できるのは権限を減らすか、実行を凍結することだけ。つまりWatcherを完全に信頼する必要すらありません——Watcherが故障しても、システムは安全な停止へ傾くだけで、権限拡大には決して向かいません。権限を再び緩められるのは、人間のOwnerだけです。」
- **キーコピー**: *"A Watcher failure shifts the system toward safe shutdown, not expanded authority."*
- **💡 優位性C（証明）**: 一方向ガバナンス。Watcher を信頼しなくてよい＝逆方向のイノベーション。

### Slide 11 — Agent NFT Economy ④economy
- **柱**: ④ Agent economy
- **ビジュアル**: `Before: AI Agent = code running somewhere` / `IntentOS: Agent NFT = portable autonomous identity`。Transfer: `Agent moves. Authority does not.`
- **見出し**: *Agents are ownable autonomous processes.*
- **EN**: "Because the agent is an NFT, it's a portable autonomous identity — carrying its intent history, evidence trail, and reputation. And transfer is safe: when an agent moves, authority does not. The old owner keeps their funds and the old runtime authority is revoked; the new owner creates a fresh runtime binding and continues the agent's identity. This is the infrastructure for an autonomous agent economy."
- **和訳**: 「Agentが NFT であるため、それは持ち運び可能な自律アイデンティティです——意図の履歴、証跡、評判を携えて。そして譲渡は安全です。Agentが移っても、権限は移りません。旧Ownerは資金を保持し、旧Runtimeの権限は失効します。新Ownerは新しいRuntime Bindingを作り、Agentのアイデンティティを継承します。これが自律Agent経済のためのインフラです。」
- **キーコピー**: *"Agent moves. Authority does not."*

### Slide 12 — Positioning
- **柱**: —（カテゴリ定義）
- **ビジュアル**: `Others: "How can we trust AI with permissions?"` vs `IntentOS: "Why should trust be required?"` / `Separate Intelligence from Authority.`
- **見出し**: *IntentOS is not an AI wallet. It is an alignment and execution layer.*
- **EN**: "So IntentOS is not an AI wallet. It's an alignment and execution layer for autonomous agents. Other approaches ask, 'how can we trust AI with permissions?' We ask a different question: why should trust be required at all? We separate intelligence from authority."
- **和訳**: 「だからIntentOSはAIウォレットではありません。自律Agentのための“整合＆実行レイヤー”です。他のアプローチはこう問います——『どうすればAIに権限を任せて信頼できるか？』。私たちは別の問いを立てます——そもそも、なぜ信頼が必要なのか？ 私たちは知性を、権限から切り離します。」
- **キーコピー**: *"Why should trust be required? Separate intelligence from authority."*

### Slide 13 — Future
- **柱**: —（ロードマップ）
- **ビジュアル**: `Phase 1: Guarded autonomous execution` / `Phase 2: Agent reputation` / `Phase 3: Agent economy`。
- **見出し**: *From guarded execution to an autonomous agent economy.*
- **EN**: "Today, Phase 1: guarded autonomous execution — Intent Builder, EIP-7702, runtime, and watcher. Next, Phase 2: agent reputation, built on evidence history, validation, and specialized watchers. Then Phase 3: an agent economy, where agents hire agents and collaborate with trust-minimized execution."
- **和訳**: 「現在はPhase 1——guarded autonomous execution。Intent Builder、EIP-7702、Runtime、Watcher。次にPhase 2——証跡の履歴、検証、専門特化したWatcherに支えられたAgentの評判。そしてPhase 3——Agentが Agent を雇い、信頼を最小化した実行で協働するAgent経済へ。」

### Slide F — Closing
- **柱**: 4本柱の回収
- **ビジュアル**: 4本柱 `Intent Builder → Initial / EIP-7702 → Mechanical / Watcher → Semantic / Agent NFT → Economy`。締めに大きく "alignment, not trust"。
- **見出し**: *Autonomous agents need alignment, not trust.*
- **EN**: "Intent Builder gives initial alignment. EIP-7702 gives mechanical alignment. The Watcher gives long-term semantic alignment. And the Agent NFT opens an autonomous agent economy. The future isn't humans approving every transaction — it's autonomous agents acting for us, and IntentOS makes sure they keep acting according to what we meant. Autonomous agents need alignment, not trust."
- **和訳**: 「Intent Builderが最初の整合を、EIP-7702が機械的な整合を、Watcherが長期の意味的な整合を与えます。そしてAgent NFTが自律Agent経済を開きます。未来は、人間が毎回トランザクションを承認することではありません——自律Agentが私たちのために動き、IntentOSが“私たちが意図した通りに動き続ける”ことを保証する未来です。自律Agentに必要なのは、信頼ではなく、整合です。」
- **キーコピー**: *"Autonomous agents need alignment, not trust."*

---

## 3. スポンサー賞フィット（母艦での位置づけ）

> 柱の“実現手段”として自然に埋まっている。各スライドで一言添えるだけで賞アピールになる。

| スポンサー | 埋め込み先 | 一言 | 必然性 |
|---|---|---|---|
| 🏆 **EIP-7702** | Slide 6/7/8 | 「あなたのウォレットに意図を付与」 | ②Mechanical の中核そのもの |
| 🏆 **World** | Slide 5（Agent Creation 前） | 「Runtime量産を防ぐ human proof gate」 | Cloud Runtime のコスト破綻を防ぐ経済的必然 |
| 🏆 **ENS** | Slide 5/11 | 「`agent-<id>.intentos.eth` が恒久ID」 | identity と economy の参照点（ENSIP-25/26 + ERC-8004） |
| （Base / Uniswap / KMS） | Slide 8 | evidence は Base、quote は Uniswap、鍵は KMS | 実行と証跡の実体 |

> 注: 録画では尺の都合で World/ENS を D1/D2 に圧縮する（§4 参照）。母艦では Slide 5 に identity 系をまとめて置く。

---

## 4. ここから 3:50 録画版を切り出す（cut マップ）

母艦13枚 → 録画 8 beat（前半スライド3 + デモ5）への**写像**。録画版の詳細台本は `pitch-demo-outline.md` で管理。

| 録画 beat | 母艦からの素材 | 圧縮方針 |
|---|---|---|
| S1 Problem | Slide 2 | two bad choices まで |
| S2 Thesis | Slide 3 + Final | **「alignment, not trust」と4本柱の地図**を前半で立てる（←今の録画版に欠けている背骨を復活） |
| S3 Positioning + 予告 | Slide 12 + 見どころ3点 | 「AI walletではない」を明言してデモへ橋渡し |
| D1 Initial | **Slide 4** + 5 + World | Intent Builder の**面談**を主役に戻す（不文律→Constitution署名）＋mint |
| D2 Mechanical | Slide 6 + 7 + ENS | 自分のwalletに付与 / 0 ETH key / ENS名 |
| D3 Mechanical | Slide 8 | 2:14AM 自律実行 |
| D4 Semantic | Slide 9 + 10 | Watcher tighten / 一方向 |
| D5 Closing | Slide 11 + 12 + Final | NFT economy 一言 → "separate intelligence from authority" |

**録画版で必ず復活させる2点（前回欠落）:**
1. **S2 で「alignment, not trust」の背骨**を立てる（Slide 3 + Final 由来）。
2. **D1 で Intent Builder の面談**（Slide 4 由来）を主役に戻す＝差別化の核。

---

## 5. 2次オフライン登壇版（母艦をほぼフル活用）

- 母艦13枚をベースに、Slide 8 を**ライブ/録画デモ**に置換、それ以外はスライド進行。
- Future（Slide 13）と Positioning（Slide 12）を口頭で厚めに。
- Q&A バックアップ: Relayer の gas 立替/枯渇リスク（→ 将来サブスク原資で Relayer プール、規模で平準化）を1枚。
- 想定尺 5〜7分 + Q&A。

---

## 6. オープン質問
1. この**母艦（背骨=alignment, not trust / 4本柱）**で方向性は合っているか。
2. 録画版の cut（§4）で、S2に背骨・D1に面談を復活、で良いか。
3. 命名表記: `agent-123.intentos.eth`（ENS）に統一？ それとも `*.intentos.base.eth`（Basename）？
4. 数値: "50 USDC→ETH" / "$100→$10" 確定で良いか。
5. ビジュアル: ブランド素材（色/ロゴ/フォント）の有無。なければ Marp テーマ新規作成。

---

## 7. 次アクション
- [ ] この母艦へ FB → 背骨と13枚の流れを確定
- [ ] 確定後、`pitch-demo-outline.md` を**母艦準拠で再カット**（S2に背骨 / D1に面談を復活）
- [ ] その後、`deck/pitch.md`（Marp）で前半スライドを作成 → PDF/PPTX 書き出し
- [ ] 母艦フル版を 2次登壇用スライドへ展開
