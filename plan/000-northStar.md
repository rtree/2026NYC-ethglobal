
# IntentOS North Star

IntentOSはAIAgentによる取引の課題を
EIP-7702によってOwnerのWalletでの資金保持・ガードレール設置を実現しつつ
取引の監視を別Agentが行うことで解決するレイヤープロトコルです。

また、AgentはNFT(ERC-8004 / ERC-721)としてもmintされます。OwnerのEIP-7702のdelegated contractへのアクセス権の証明と、クラウド上に構築されたAI Agentの実行環境へのアクセス権の権利の象徴として。

## 解決する課題

### 課題１：Agentによるチャンス獲得と、Agentの暴走による損失のバランス問題を解決する

```
寝ている間にチャンスが来る。
でも毎回承認だとチャンスを逃す。
かといってAgentに全権を渡すのは怖い。
```
- オンチェーンのチャンスは、人間が起きて毎回承認するのを待ってくれません。
- でもAgentにwalletの全権を渡すのは危険すぎます。
- IntentOSは、毎回承認と白紙委任の間にあります。
  - OwnerはIntentを定義し、Executor AgentはそのIntentの内側で機会を取りに行きます。
  - EIP-7702 delegated contactとしてEOAに作成したContractがHard Limitを強制し、Watcher Agentは将来の権限をtighten / freezeすることだけができます。
  - つまりOwnerがオフラインでもAgentは動ける。でもOwnerの境界の外には出られません。

### 課題２：Agentを動かす隔離環境と鍵＆資金管理が難しい

```
自分のPCでAgentを動かすのは不安。
でも隔離環境を作るのも大変。
さらに隔離したAgentに資金や鍵を渡すのはもっと怖い。
止まった際の回収不安があるなら預けられないよね
```
- Agentを本当に自律実行させようとすると、単にpromptを作るだけでは足りません。Agentには、プログラムを動かすPCが必要ですが自分のPCで動かすのは不安です。PCがsleepすれば止まりますし、local環境にAPI keyやsession keyを置くのも怖いです
- 逆に、cloud上に隔離環境を作ろうとすると、今度はRuntimeの作成、権限分離、鍵管理、セキュリティも自分で担保しなくてはなりません
- IntentOSは、隔離環境・鍵・資金の分離をまとめて用意します
  - Agentごとに、Cloud Run上のOpenClaw Runtime Capsuleを自動で生成します。常時起動でtickし続けるので、PCをsleepさせても止まりません。Agentが使う鍵はGCPのKMSで管理します。Runtimeに渡るのはfundを動かす鍵ではなく、オーナーのEOAに付随するdelegated contractへExecutionRequestを出すためのsession key（request capability）だけです。
  - 資金は常にOwnerのアドレスに残ります。EIP-7702を使い、OwnerのEOAそのものにExecutionContractのコードを委任（delegate）するからです。秘密鍵はOwnerが持ったままなので、資金は別アカウントに移りません。AIAgentはこのExecutionContractをガードレール付きで呼び出すことで取引を行い、事前にOwnerが取り決めたガードレールの範囲でOwnerの資金が運用されます。gas budgetも、このOwnerのEIP-7702 delegated account内のExecutionGasVaultに置かれ、AI Agentはfund custodyを持ちません。
  - だから「止まった際の回収不安」がありません。Ownerはいつでもstopでき、残ったfundはOwner側に残ったまま。Agentをtransferしてもold Runtimeのauthorityは構造的に失効するので、鍵や資金が取り残されることはありません。

## 0. 概要

> Executor Agentは要求する。
> ExecutionContract は事前に通すか止める。
> Watcher Agent は締めることしかできない。
> 緩められるのは Owner だけ。

IntentOS は、資金OwnerのIntent を LLM経由で解釈し、 AI Agent / AI Agentの実行環境 / ExecutionContract として準備します。OwnerのSelfCustodyを守りつつ、AI Agentに資金の部分的な利用権限を与えるために、OwnerのEOA内にEIP-7702を利用してContractをつくり、ここに設定したガードレールの範囲でAI Agentに資金利用許可を与えます。また、このガードレールは、これを見張る専用のWatcher AgentがIntentと状況のSemanticを判断し、さらにガードレールの強化を行います。

ここでAI Agentは2つ登場します。いずれも、Owner配下のEIP-7702のdelegated contractへのアクセス権の証明と、構築されたAI Agentの実行環境へのアクセス権の権利の象徴として、NFT(ERC-8004 / ERC-721)もmintされます。

- **Executor Agent** は Owner の Intent を実現するための Agentです。OpenClaw Runtime 上で動き、EIP-7702 ExecutionContract に ExecutionRequest を出します。
- **Watcher Agent** は Owner が Executor Agent とは別に準備する監視用のAgentです。Executor Agentの実行結果や外部の状況変化の情報を収集し、必要なら将来の実行範囲を締めためにExecutionContract内部のガードレール定義をよりRestrictiveな方向に修正します。

```text
Intent
  -> AI Agent NFT
  -> OpenClaw Runtime
  -> Guarded Execution
       Hard Guardrails:
         EIP-7702 ExecutionContract
       Optional Semantic Guardrails:
         Watcher Agent Agent NFTs
```

なお、Executor AgentもWatcher AgentいずれもSessionKeyとしていわゆるWalletを保有しますが、資金は一切保有しません。資金は常に Owner のアドレスに残り、OwnerのSelf Custodyは失われません。また、Gas代もOwnerのEOAのdelegated contract内部にあるExecutionGasVaultから供給されます。

ここでAI Agentは2つ登場します。いずれも、Owner配下のEIP-7702のdelegated contractへのアクセス権の証明と、構築されたAI Agentの実行環境へのアクセス権の権利の象徴として、NFT(ERC-8004 / ERC-721)もmintされます。

- **Executor Agent** は Owner の Intent を実現するための Agentです。OpenClaw Runtime 上で動き、EIP-7702 ExecutionContract に ExecutionRequest を出します。
- **Watcher Agent** は Owner が Executor Agent とは別に準備する監視用のAgentです。Executor Agentの実行結果や外部の状況変化の情報を収集し、必要なら将来の実行範囲を締めためにExecutionContract内部のガードレール定義をよりRestrictiveな方向に修正します。

```text
Intent
  -> AI Agent NFT
  -> OpenClaw Runtime
  -> Guarded Execution
       Hard Guardrails:
         EIP-7702 ExecutionContract
       Optional Semantic Guardrails:
         Watcher Agent Agent NFTs
```

なお、Executor AgentもWatcher AgentいずれもSessionKeyとしていわゆるWalletを保有しますが、資金は一切保有しません。資金は常に Owner のアドレスに残り、OwnerのSelf Custodyは失われません。また、Gas代もOwnerのEOAのdelegated contract内部にあるExecutionGasVaultから供給されます。

### Agent はどうやって Owner の資金を「代理執行」するのか

ポイントは 「資金は一度も Agent に渡さない。Owner 自身のアカウントの中でだけ動く」 という点です。鍵になるのが EIP-7702 delegated account です。

```
Owner EOA（資金はここに残る）
  └─ EIP-7702 で delegated account code を持つ
        ├─ ExecutionContract（最終権限）
        ├─ Hard Guardrails（型付き制約）
        ├─ ExecutionGasVault (エージェントへのガス代供給用)
```

EIP-7702 によって、Owner の EOA そのものに「契約コード」を後付けします。資金は別口座に移さず、Owner の balance のまま。その Owner アカウントのコードの中に、ExecutionContract と Hard Guardrails が同居します。

実行の流れ（誰が何の鍵を持つか）
```
① Executor Agent(OpenClaw)  : 「BUY 0.05 USDC」というシグナルを出すだけ。鍵は持たない
② IntentOS adapter      : quote/simulate して typed ExecutionRequest を組む
③ SessionKey(KMS)       : その ExecutionRequest の digest を「署名するだけ」
                           └─ 資金を動かせない鍵。保有が0 ETH のまま。送信もしない
④ Replayer              : Platform(IntentOS提供者である我々)が準備する。署名とrequestをExecution Contractに代理送信（一時的にgas代を立替払い）
⑤ ExecutionContract     : 署名と request を Hard Guardrails と照合 → 内側なら execute / 外側なら revert
```

つまり代理執行の実体は3層に分離されています:
1. 頭（OpenClaw/LLM）は「やりたいこと」を考えるだけで、onchain 権限ゼロ
2. SessionKeyは ExecutionRequest に署名できるが、これは「資金を動かす鍵」ではなく「実行を要求する鍵」。Owner の資金を勝手に送金することはできず、できるのは ExecutionContract に request を出すことだけ
3. ExecutionContract（= Owner アカウント内のコード）が、その request が Hard Guardrails（token pair / amount cap / slippage / expiry / freeze など）の内側かを機械的に判定し、内側のときだけ Owner の資金を動かす

だから「Agent が custody を持つ」のではなく、Agent は Owner アカウントに対して制約付きの『実行要求』を出せるだけ。資金は常に Owner のもので、契約のガードが最終的な栓になっています。
cap を越えた要求は adapter で握りつぶさず、契約が AmountTooLarge で revert し、その却下理由を LLM に返して境界内に再要求させます。

### どうやって Gas 代を他人に払わせて Transaction を出すのか

ここではPlarform、つまり我々IntentOS構築者が作った Relayer が主役です。ポイントは 「署名する人(SessionKey)」と「tx を送って gas を払う人(Relayer)」を分離することです。

```
[事前] Owner EOA の契約 : fundGasVault() で ETH を prefund   [Owner ETH → vault lane]
                          gasVaultBalance に gas budget を積む
        ▼
SessionKey(KMS)  : (r) を digest 署名 → sig                         [0 ETH]
        │ (r, sig) を adapter 経由で Relayer に渡す
        ▼
Relayer(Platform): writeContract(submitExecutionRequest, [r, sig]) を送信
                   tx の gas を自分の ETH で先払い                   [ETH 減る]
        ▼
Owner EOA の契約 : ① 署名検証 + Guardrails 照合
                   ② Owner の USDC を transfer                       [USDC 減る]
                   ③ gas 実費を計測: spent = usedGas * tx.gasprice
                   ④ gasCap で clamp: spent = min(spent, gasPerTxCap)
                   ⑤ vault 残高確認: spent <= gasVaultBalance か      [枯渇なら revert]
                   ⑥ ExecutionGasVault lane から精算
                      gasVaultBalance -= spent
                      address(this)(=Owner ETH) → Relayer へ送金      [vault lane 減る]
        ▼
Relayer(Platform): 立替分が戻る                                      [ETH ほぼ回収]

  ※ ⑥の vault は別口座ではなく、address(this)==Owner EOA の ETH を
    delegated account code が gasVaultBalance 勘定で管理する lane
  ※ Executor lane と Watcher lane は別 gasVaultBalance に分離
  ※ clamp 超過分(spent > gasPerTxCap)は信頼前提で Platform 持ち出し
```

## 1. Intent から Agent NFT が動き出すまで

一連の流れはこの形です。
```
Intent
  -> Agent Package
  -> Agent NFT (mint)
  -> OpenClaw Runtime
  -> Guarded Execution
       Hard Guard:     EIP-7702 ExecutionContract
       Semantic Guard: Watcher Agent (optional)
```

1. ログインと人間証明。 Owner は wallet をつなぎ、World ID で人間証明をします。World Chain を使うわけではありませんが、Agent ごとに Cloud Run 上の本物の Runtime を立てるため、wallet だけで無制限に使えると bot / sybil が Runtime を量産し、運営側の compute / model / indexing cost が破綻します。だから人間証明を Runtime 作成前の gate にしています。
2. Intent を話す。 Owner は IntentBuilder に、やりたいことを話します。ここで書いているのは contract の引数ではなく、自分の資金に何をさせたいか、その目的と許容範囲です。
   ```
   「USDC を ETH に少しずつ替えたい」
   「大きな価格変動時には止めたい」
   「不自然な route や古い quote は避けたい」
   「失敗時には stable asset 側に戻したい」
   ```
3. Agent Package が生成される。 IntentBuilder は会話を、OpenClaw Runtime に投入できる Agent Package にまとめます。画面には Agent の目標・振る舞い・絶対に越えない Hard Guardrails・実行後に Watcher Agent が読む Semantic Guardrails が表示されます。
   - Hard Guardrails（target / selector / token pair / amount cap / slippage cap / expiry / nonce など）は EIP-7702 ExecutionContract に書き込まれ、実行のたびに機械的にチェックされます。違反すれば transaction は通りません。
   - Semantic Guardrails（route の不自然さ、quote の鮮度、simulation の十分さ、recovery path の妥当さなど）は contract がその場で読み切れない期待です。実行後に Watcher Agent が evidence を読んで判断するための読み筋になります。
4. Executor Agent を mint する。 Owner が内容を確認すると、Executor Agent が Agent NFT として mint されます。これは「AI に資金を渡す」ことではありません。mint されるのは、Intent を実行する Agent identity、Runtime を動かす usage right、従うべき Agent Package manifest です。
5. Runtime が立ち上がる。 Runtime Registry が NFT を見て OpenClaw Runtime を Cloud Run 上に用意し、AgentLoop を回し始めます。Runtime に渡るのは資金を動かす鍵ではなく、ExecutionContract に ExecutionRequest を出すための SessionKey だけです。
6. Executor Agent が動く。 tick ごとに market state / portfolio / 現在の Hard Guardrails / Intent の状態を読み、BUY / SELL / HOLD / RECOVER を選びます。必要なら Uniswap から quote と route を取り、simulation を走らせ、evidence を残します。実行すべきと判断したときだけ、SessionKey で ExecutionRequest に署名して ExecutionContract に submit します。
7. Hard Guard が効く。 ExecutionContract は Agent の reasoning を信用しません。提出された request が Hard Guardrails の内側かどうかだけを見ます。内側なら実行、外側なら revert。ここまでが Hard Guard です。
8. 証跡が残る。 実行が通ると、onchain tx / event / quote / route / simulation / reasoning hash が timeline に刻まれます。Owner の画面では、Executor Agent が何を見て、何を選び、どの request を出し、どの transaction が通ったかが稼働ログとして見えます。
9. Watcher Agent を足す。 Owner は 状況の監視役としてWatcher Agent を追加できます。IntentBuilder に Executor Agent の Agent Package を読ませ、監視専用の Watcher Agent Package を生成し、Watcher Agent NFT として mint します。Watcher は対象 Executor Agent の tokenId / intentId / packageHash / guardrail hash を immutable context として参照します。ただし Fund にはアクセスしません。持つのは、観測し・質問し・report / vote するための identity と Runtime usage right だけです。
10. Semantic Guard が効く。 Watcher Agent の Runtime も OpenClaw 上で動きます。contract event と evidence を読み、Executor Agent に質問し、Semantic Guardrails と照らして実行が on-intent だったかを判断します。問題があれば runtime key で report / vote を出し、quorum が成立すると ExecutionContract の将来の実行範囲が tighten / freeze されます。これが Semantic Guard です。Watcher Agent にできるのは締める方向だけで、緩めるのは Owner だけです。

最終的に Owner が見るのは、単発の transaction ではなく、Agent NFT・Runtime・Hard Guard・Semantic Guard が同時に動く一つの execution timeline です。Executor Agent と Watcher Agent は同じ timeline を見ながら、Agent がどこまで Intent の内側にいたかを確認します。

## 2. Product Journey / 画面定義

画面は、Agent NFT が mint され、Runtime が動き、Guarded Execution が見えることを中心に組む。

- Owner onboarding
  - Owner がサイトにアクセスする
  - wallet を接続する
  - World ID で人間証明する
  - World Chain は使わないが、Cloud Run OpenClaw Runtime 量産による abuse / cost blow-up を防ぐため、この proof が IntentOS 利用開始の gate になる
  - ログイン後は Intent List に入る

- Intent List
  - 1 Owner につき active Intent は1つだけにする
  - 実行中 Intent があれば Runtime Dashboard に戻れる
  - active Intent がない場合だけ `新規 Intent の実行` が有効になる
  - 過去の Intent は Result / Performance 画面で見返せる

- Intent Launch Dashboard
  - 新規 Intent の実行を選ぶと最初に入る card grid dashboard
  - 最終チェック画面ではなく、各設定画面への navigation hub である
  - cards:
    - Intent 作成
    - Executor Agent 作成 / 修正
    - Agent Identity
    - Human Proof
    - Gas Funding / Revoking
    - Runtime Preview
    - Watcher Agent Guard
    - Start Conditions
  - 必須 card が complete になると `取引を開始する` が有効になる
  - Watcher Agent Guard は optional card として skip できる

- Intent creation
  - IntentBuilder を使って Natural Intent を作成する
  - IntentBuilder が Agent Package を生成する
  - Owner は Intent Summary / Hard Guardrails / Semantic Guardrails を確認する
  - 新規の場合は Executor Agent NFT を mint する
  - Owner が確認した Agent Package の manifest hash を Agent NFT に bind する
  - `CONSTRAINTS.json` の Hard Guardrails を ExecutionContract / ExecutionGasVault に登録する

- Agent identity setup
  - Executor Agent NFT の tokenId が確定する
  - `agent-<tokenId>.intentos.base.eth` を作る
  - ENSIP-26 `agent-context` / `agent-endpoint[web]` を設定する
  - ENSIP-25 `agent-registration[registry][agentId]` を設定する
  - ERC-8004 registration / tokenURI に ENS name を入れる

- Runtime / fund preparation
  - Runtime Registry が Executor Agent NFT の owner を確認する
  - ExecutorRuntime Capsule を新規作成または再利用する
  - Runtime budget / gas budget / estimated cost / refund policy / stop condition を確認する
  - Owner の delegated account 内 ExecutionGasVault に fund を入れる

- Watcher Agent creation
  - Owner は必要なら Executor Agent Agent Package を IntentBuilder に渡す
  - IntentBuilder が監視専用の Watcher Agent Agent Package を生成する
  - Owner は Watcher Agent package が参照する Executor Agent tokenId / intentId / package hash / guardrail hash を確認する
  - Watcher Agent NFT を mint する
  - `watcher-<tokenId>.intentos.base.eth` を作る
  - Watcher Agent registration / tokenURI に ENS name を入れる
  - Watcher Agent quorum 条件を設定する
  - WatcherRuntime Capsule を新規作成または再利用する
  - Owner-funded Watcher ExecutionGasVault に gas budget を入れる

- Start
  - Launch Dashboard の必須条件が揃った場合だけ開始できる
  - Watcher Agent なしで始める場合は、Executor Agent + Hard Guardrails だけで開始する
  - Watcher Agent を付ける場合は、quorum set と gas budget が ready になってから開始できる
  - Executor Agent と、存在する場合は Watcher Agent が AgentLoop 内で稼働し始める

- Owner Runtime Dashboard
  - Executor Agent の稼働ログを見る
  - 現在の Agent Package / Hard Guardrails / ExecutionGasVault 残高を見る
  - quote / simulation / ExecutionRequest / tx result / evidence timeline を見る
  - Owner stop / fund top-up / Watcher Agent configuration review を行う

- Watcher Agent Runtime Dashboard
  - Watcher Agent の稼働ログを見る
  - Base の EvidenceCommitted events / 200-char reason / hashes を読む
  - Semantic Guardrails と Watcher Agent package に照らして execution を判断する
  - 必要なら Executor Agent との会話を見る
  - report / vote / freeze / tighten の候補を確認する
  - Watcher Agent runtime key で onchain report / vote tx を submit する

- Shared execution timeline
  - Executor Agent decision
  - quote / route / simulation
  - ExecutionRequest
  - EvidenceCommitted event
  - 200-char reason
  - onchain tx / event
  - evidence hash
  - Watcher Agent review
  - report / vote
  - contract state update

- Result / Performance screen
  - running
  - tightened
  - frozen
  - self-stopped
  - owner-stopped
  - fund-exhausted
  - transferred / revoked
  - 最終状態では、終了理由、tx hash、最終 Hard Guardrails、ExecutionGasVault 残 fund、refund を表示する
  - 成績として、開始前の対象通貨 value in USDC、終了後の対象通貨 value in USDC、net delta、token balance delta、gas / runtime cost を表示する

## 3. Intent を Runtime で実行するまで（ガードレールの動作方法付き）

この節は、Owner の Natural Intent が Agent Package になり、Runtime Capsule に注入され、Hard / Semantic 両ガードレールの下で onchain 実行されるまでを一続きで述べる。

### 3.1 OpenClaw Runtime の役割と権限境界

OpenClaw は Agent の頭と作業面であり、Agent Package を読んで AgentLoop を回す常時起動の orchestration layer である。その役割は bounded onchain interaction の orchestration に限られ、Executor Agent も Watcher Agent もこの OpenClaw Runtime 上で動く。

OpenClaw にできることと、できないことははっきり分かれている。
- できる: Agent Package に従って観測し、考え、許可された IntentOS typed tools を呼ぶ。
- できない: onchain authority を持つこと、資金を動かすこと。OpenClaw が「やりたい」と判断しても、それだけでは資金は動かない。
- 資金移動の final authority は OpenClaw ではなく、IntentOS adapter と EIP-7702 ExecutionContract / Hard Guardrails に残る。

したがって全体は、IntentBuilder が Natural Intent から Agent Package を生成し、Runtime Registry が OpenClaw Runtime に注入し、OpenClaw が AgentLoop を回して IntentOS typed tools を呼び、ExecutionContract が Hard Guardrails と照合して実行する、という一方向の pipeline になる。

```text
Natural Intent
  -> IntentBuilder
  -> Agent Package
  -> OpenClaw Runtime
  -> IntentOS typed tools
  -> EIP-7702 ExecutionContract
  -> Bounded Onchain Execution
```

### 3.2 Agent Package の生成

IntentBuilder は、Owner の Natural Intent から OpenClaw Runtime に投入する Agent Package を生成する。

このAgent Package は、AI Agent の行動・価値観・道具・記憶・証跡・停止条件・オンチェーン制約をまとめた設定ファイル群である。
- Agent NFT は、この Agent Package の manifest hash を持つ。
- Runtime Registry は tokenId から Agent Package を引き、OpenClaw Runtime Capsule に注入する。
- Owner-created Watcher Agent package は、Executor Agent package を再利用するのではなく、監視専用の role / tools / stop policy を持つ別 package である。
- ただし、対象 Executor Agent の tokenId、intentId、executorPackageHash、Hard Guardrails、Semantic Guardrails を immutable context として含める。

```text
agent-package/
  manifest.json
  SUMMARY.md
  AGENTS.md
  SOUL.md
  TOOLS.md
  MEMORY.md
  EVIDENCE.md
  STOP.md
  CONSTRAINTS.json
```

`manifest.json` は package 全体の親 hash を持つ。
Agent NFT、Runtime Registry、evidence timeline はこの hash を参照する。

```json
{
  "packageVersion": "0.1",
  "agentRole": "EXECUTOR",
  "agentTokenId": "123",
  "intentId": "intent-abc",
  "packageHash": "0x...",
  "files": {
    "SUMMARY.md": "0x...",
    "AGENTS.md": "0x...",
    "SOUL.md": "0x...",
    "TOOLS.md": "0x...",
    "MEMORY.md": "0x...",
    "EVIDENCE.md": "0x...",
    "STOP.md": "0x...",
    "CONSTRAINTS.json": "0x..."
  }
}
```

### 3.3 Agent Package のファイル構成

| File | Purpose |
| --- | --- |
| `SUMMARY.md` | Owner 向けの短い intent summary |
| `AGENTS.md` | OpenClaw の system prompt / role / goal / allowed actions / never rules / default behavior |
| `SOUL.md` | risk posture / priority / default instinct / recovery preference |
| `TOOLS.md` | OpenClaw が見える tool の説明と使い方 |
| `MEMORY.md` | working memory に保存するもの・保存しないもの |
| `EVIDENCE.md` | tick ごとの evidence と hash commitment。Watcher Agent が読む evidence contract|
| `STOP.md` | OpenClaw の stop / hold / self-stop 条件 |
| `CONSTRAINTS.json` | EIP-7702 ExecutionContract に登録する Hard Guardrails の情報 |
| `OpenClaw config / IntentOS plugin` | 実際の tool allowlist enforcement |

`TOOLS.md` は Agent への説明であり、enforcement そのものではない。
実際の tool allowlist は OpenClaw config、IntentOS plugin、Runtime adapter、ExecutionContract が enforce する。

### 3.4 ガードレールの動作方法

Hard Guardrails は、EIP-7702 ExecutionContract が同期的に enforce する制約である。
target、selector、token pair、amount cap、spender cap、slippage cap、expiry、freeze state、nonce などを含む。
contract state としては typed hard guard state に落ちる。

Semantic Guardrails は、contract がその場で読み切れない期待である。
route freshness、risk posture、simulation adequacy、recovery preference、unnatural route avoidance などを含む。
Watcher Agent は実行後に evidence を読み、この Semantic Guardrails に照らして report / vote する。

```text
Agent Package
  -> OpenClaw Runtime Instructions
  -> Tool Policy
  -> Memory Policy
  -> Evidence Policy
  -> Stop Policy
  -> Hard Guardrails
  -> Semantic Guardrails

Hard Guardrails
  -> EIP-7702 ExecutionContract

Semantic Guardrails
  -> Optional Watcher Agent Semantic Guard
```

### 3.5 Runtime Registry と Runtime Capsule

Runtime は AgentLoop を動かす常時起動の実行環境である。
- IntentOS の MVP では、Agent NFT ごとに OpenClaw Runtime Capsule を Cloud Run Service 上に生成する。
- Runtime Registry は、Agent NFT と Runtime Capsule の対応を管理する Backend の source of truth である。

```text
RuntimeRecord:
  tokenId
  runtimeId
  runtimeOwner
  bindingNonce
  runtimeStatus
  cloudRunService
  runtimeManifestHash
  kmsKeyRef
  executionGasVaultRef
  lastHeartbeatAt
```

Runtime 起動要求が来ると、Runtime Registry は `ownerOf(tokenId)` と `runtimeOwner` を比較する。

```text
runtime が存在しない:
  -> 新規 Runtime Capsule を作成

runtimeOwner == ownerOf(tokenId):
  -> 既存 Runtime Capsule を再利用

runtimeOwner != ownerOf(tokenId):
  -> old Runtime Binding は invalid
  -> old Runtime の authority-bearing operation は reject
  -> new owner は新しい Runtime Binding を作成
```

Runtime Capsule には Runtime 専用の SessionKey が渡される。
- SessionKey は Owner の資金を自由に動かす鍵ではない。
- ExecutionContract に ExecutionRequest を出すための request capability である。
- SessionKey / IntentOS tool adapter / ExecutionGasVault / ExecutionContract / Watcher vote contract は、Runtime Binding が current owner に紐づいていることを確認する。
- したがって old Runtime が自律的に動き続けても、Transfer 後に意味のある onchain interaction はできない。

### 3.6 ExecutionGasVault と gas の後精算

ExecutionGasVault は standalone gas sponsor ではない。
- Owner の EIP-7702 delegated account code 内に置かれる gas reimbursement lane である。
- Runtime / relayer が transaction gas を先に払い、delegated account 内の ExecutionGasVault から後で精算する。

```text
Owner EOA delegated account:
  ExecutionContract
  Hard Guardrails
  Executor ExecutionGasVault
  Watcher ExecutionGasVault
```

Executor Agent 向けの gas budget は Owner が fund する。
したがって Owner の delegated account 内に置き、Owner の制御下にあることを明確にする。

Watcher Agent 向けの gas budget も Owner が fund する。
ただし Executor Agent の execution budget とは別 lane に置き、Watcher Agent が実行資金や execution capability に触れないことを明確にする。

```text
Runtime substrate:
  Cloud Run Service

Runtime unit:
  1 Executor Agent NFT / 1 ExecutorRuntime Capsule
  1 Watcher Agent NFT / 1 WatcherRuntime Capsule

Runtime access:
  Web3 wallet login + World ID proof が必須
  user ごとの active Agent NFT 数は policy で制限できる
```

World ID は human proof gate であり、World Chain を使うという意味ではない。
Cloud Run 上の本物 OpenClaw Runtime Capsule を bot / sybil が量産すると、運営側の compute / model / indexer cost が破綻するため、World ID proof が Runtime 作成前の abuse gate になる。

---

## 4. Execution Flow

Executor Agent は、Agent Package を読み、OpenClaw Runtime 上で tick し続ける。
Executor Agent は自由な trader ではなく、事前定義された action だけを選べる signal executor である。

```text
Predefined Executor actions:
  HOLD
  ASK_WATCHER
  GET_UNISWAP_QUOTE
  PROPOSE_SWAP
  REQUEST_SIMULATION
  SUBMIT_EXECUTION_REQUEST
  SELF_STOP
```

Executor Agent の loop は次の線で進む。

```text
Perceive
  market state / portfolio / current Hard Guardrails / Intent state を読む
   ↓
Decide
  BUY / SELL / HOLD / RECOVER を選ぶ
   ↓
Quote
  Uniswap ToolAdapter から route / quote を取得する
   ↓
Simulate
  route / calldata / expected result を検証する
   ↓
Request
  IntentOS typed execution tool を呼ぶ
   ↓
Submit
  IntentOS adapter が ExecutionRequest を build / sign / submit する
   ↓
Hard Guard
  EIP-7702 ExecutionContract が Hard Guardrails と照合する
   ↓
Execute / Revert
  内側なら実行し、外側なら revert する
   ↓
Record
  EvidenceCommitted event を Base に刻む
  reasoningHash / quoteHash / routeHash / simulationHash / tx hash / 200-char reason を保存する
```

この loop の間も OpenClaw に onchain authority は渡らない（3.1）。OpenClaw は IntentOS typed tools を呼ぶだけで、final authority は IntentOS adapter と ExecutionContract が持つ。

Execution ごとに、Executor Agent は Base 上に EvidenceCommitment を刻む。
Watcher Agent の監査起点は offchain log ではなく、この onchain commitment である。

```solidity
event EvidenceCommitted(
    uint256 indexed executorAgentTokenId,
    bytes32 indexed intentId,
    bytes32 indexed executionId,
    uint8 action,
    bytes32 packageHash,
    bytes32 hardGuardHash,
    bytes32 semanticGuardHash,
    bytes32 evidenceRoot,
    bytes32 quoteHash,
    bytes32 simulationHash,
    bytes32 executionRequestHash,
    bytes32 resultHash,
    string reason
);
```

`reason` は non-compressed English ASCII text で、最大 200 chars とする。
secrets、raw API response、personal data、markdown は入れない。
offchain evidence/log body は将来拡張の枠だけ用意し、この protocol path では必須にしない。

ExecutorRuntime の tool allowlist は小さく保つ。

```text
ExecutorRuntime tools:
  intentos.observe_state
  intentos.get_quote
  intentos.propose_swap
  intentos.simulate
  intentos.submit_execution_request
  intentos.record_evidence
  intentos.ask_watcher
  intentos.self_stop
```

`intentos.*` は OpenClaw に見せる論理 tool 名であり、実体は IntentOS Runtime adapter が持つ具体 surface に bind される。

```text
Concrete tool surfaces:
  Uniswap Quote API
  Uniswap Swap API
  onchain read
  simulation provider
  EIP-7702 transaction submitter
  Executor Agent <-> Watcher Agent chat
```

任意 shell、任意 URL fetch、任意 contract call は有効にしない。


---

## 5. Semantic Guard Flow

Watcher Agent は、Owner がより強い guard を必要としたときに追加する Semantic Guard である。
IntentOS は Executor Agent 単体でも開始できる。
Owner は Hard Guardrails だけで始めてもよい。
高額・長期・複雑な intent では Watcher Agent quorum を重ねられる。

Watcher Agent は、Owner が IntentBuilder で生成する Watcher Agent NFT として mint される。
IntentBuilder は、先に固定された Executor Agent Agent Package を参照し、監視専用の Watcher Agent Agent Package を作る。
Watcher Agent package は `watchedExecutorTokenId`、`watchedIntentId`、`executorPackageHash`、`hardGuardrailsHash`、`semanticGuardrailsHash` を immutable context として持つ。

Watcher Agent は third-party auditor marketplace ではない。
Owner-created semantic circuit breaker である。
Executor co-pilot でもない。
Watcher Agent は実行を起こさず、Fund access も持たない。

```text
Predefined Watcher actions:
  OBSERVE_EXECUTION
  READ_EVIDENCE
  ASK_EXECUTOR
  JUDGE_ON_INTENT
  REPORT_OK
  REPORT_SUSPICIOUS
  VOTE_TIGHTEN
  VOTE_FREEZE
  SELF_STOP
```

Watcher Agent の loop は次の線で進む。

```text
Observe
  Base の EvidenceCommitted / tx / contract event を読む
   ↓
Question
  必要なら Executor Agent に explanation を要求する
   ↓
Judge
  action / hashes / 200-char reason を Semantic Guardrails と Watcher Agent package に照らして判断する
   ↓
Report / Vote
  Watcher Agent runtime key で onchain report / vote tx を submit する
   ↓
Quorum
  quorum が成立すると ExecutionContract state が更新される
   ↓
Tighten / Freeze
  future capability を狭めるか、freeze する
```

Watcher Agent が更新できるのは締める方向だけである。
cap を増やさない。
expiry を延ばさない。
unfreeze しない。
loosen / expand は Owner だけができる。

```text
WatcherRuntime tools:
  onchain read
  evidence read
  Executor Agent <-> Watcher Agent chat
  report / vote submit
```

第三者 Watcher marketplace、attention fee、correctness bond、slashing は protocol core に含めない。
将来接続する場合も、core の不変条件は「Watcher Agent は締める方向にしか作用しない」「fund access を持たない」「loosen は Owner だけ」のままである。

---


### X. Agent NFT Model

IntentOS では、Executor Agent と Watcher Agent はどちらも ERC721 / ERC-8004-compatible な Agent NFT として存在します。

- Agent NFT が表すのは、Agent の identity と Runtime usage right です。これは transfer 可能です。ただし transfer で移るのは identity と usage right だけで、Owner の fund custody は移りません。
- Runtime Binding は non-transferable です。Runtime は NFT と一緒には移らず、新しい owner が自分で新しい Runtime Binding を作ります。このとき old Runtime を同期的に止める必要はありません。transfer された瞬間に old Runtime Binding が構造的に意味を失うからです。authority-bearing な操作はすべて ownerOf(tokenId) == runtimeOwner を要求するので、transfer 後の old Runtime は実行 request・gas reimbursement・watcher vote のどれも通せず、次の stop check で self-stop します。
- Agent NFT の tokenURI は、ERC-8004-compatible な Agent Registration JSON を指します。この registration は Agent の role・capability・Agent Package・Runtime・evidence・IntentOS への導線を、外部から発見できる形で公開します。Reputation Registry / Validation Registry は後から接続できるようにしておき、まずは Agent identity の registration を成立させます。
- Agent の ENS / Basename は、NFT を mint した後、Runtime Binding を作る前に付与します。tokenId が確定してから agent-<tokenId>.intentos.base.eth または watcher-<tokenId>.intentos.base.eth を作り、ENSIP-26 text records と ERC-8004 registration を結びます。Runtime や gas funding より先に名前が付くことで、Runtime・evidence・dashboard・Watcher Agent が同じ恒久名を参照できます。

```
Agent identity setup:
  Agent NFT mint
  tokenId 確定
  ERC-8004 registration JSON 生成
  ENS / Basename subname 付与
  agent-context / agent-endpoint[web] を設定
  agent-registration[registry][agentId] を設定
  tokenURI / registration に ENS name を入れる
  Runtime Binding 作成
```
```
{
  "schema": "erc8004-agent-registration",
  "schemaVersion": "0.1",
  "name": "IntentOS ExecutorAI #123",
  "role": "EXECUTOR_AGENT",
  "description": "Executes an Owner Intent through EIP-7702 Hard Guardrails.",
  "agentPackageHash": "0x...",
  "runtimeManifestHash": "0x...",
  "services": [
    {
      "name": "guarded-execution",
      "capabilities": [
        "observe_state",
        "get_quote",
        "simulate",
        "submit_execution_request"
      ],
      "endpoint": {
        "status": "private",
        "description": "Runtime access requires current Agent NFT ownership through IntentOS Runtime Registry."
      }
    }
  ],
  "publicEndpoints": {
    "app": "https://intentos.arkt.me/",
    "profile": "https://intentos.arkt.me/",
    "onboarding": "https://intentos.arkt.me/",
    "capabilities": {
      "status": "planned"
    },
    "evidence": {
      "status": "planned"
    }
  },
  "ownership": {
    "transferable": true,
    "ownerCan": [
      "connect_wallet",
      "spawn_or_resume_runtime",
      "bind_new_intent",
      "fund_execution_gas_vault",
      "view_agent_logs"
    ],
    "transferDoesNotTransfer": [
      "previous_owner_funds",
      "previous_runtime_capsule",
      "previous_session_keys",
      "previous_execution_gas_vault_balance"
    ]
  },
  "supportedTrust": [
    "hard-guarded-execution",
    "optional-semantic-guard",
    "evidence-logging"
  ],
  "registries": {
    "reputation": { "status": "planned" },
    "validation": { "status": "planned" }
  }
}
```


---

