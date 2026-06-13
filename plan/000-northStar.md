
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

### 課題２：チャンス獲得＝TaxableEventの増加

```
Agentが機会を取りに行くほど、取引は増える。
取引が増えるほど、Taxable Eventも増える。
でも人間は、あとから何が起きたかを整理できない。
```
- Agentが自律的に取引する世界では、ユーザーが手動で実行していた時よりも、取引回数が増え、税務・会計用の記録の負担が増えます
- Agentが自律的に取引してくれても、記録の手間に人間が負けてしまいます。BlockChainの記録はそのまま使えません。なぜならContractは会計上の意図（売却・資金のWallet間移動・購入等）を語ってくれないからです
- IntentOSは、税務・会計用の記録を自動でとります
  - 購入/売却数/手数料を時系列で記録します
  - TaxableEventかの判断はしません。でも、TaxableEventになりうるものを一か所に保存します
  - Ownerはこの記録を活用して納税・会計の記録を作成することができます

### 課題３：Agentを動かす隔離環境と鍵＆資金管理が難しい

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


## 2. Agent NFT Model

IntentOS では、ExecutorAI と WatcherAI はどちらも ERC721 / ERC8004-compatible な Agent NFT として存在します。

Agent NFT は Agent の identity、Runtime usage right を代表するものです。このため、transfer 可能です。 Transfer で移転するのは Agent identity と Runtime usage right であり、Owner の fund custody ではない。 Runtime Binding は non-transferable である。 Runtime は NFT と一緒に移転するのではなく、新 owner が新しい Runtime Binding を作る。

Agent NFT は transfer 可能である。 Transfer で移転するのは Agent identity と Runtime usage right であり、Owner の fund custody ではない。 Runtime Binding は non-transferable である。 Runtime は NFT と一緒に移転するのではなく、新 owner が新しい Runtime Binding を作る。

Transfer は old Runtime を同期的に停止できなくてもよい。 Transfer された瞬間に old Runtime Binding が構造的に意味を失うためである。 authority-bearing な操作はすべて ownerOf(tokenId) == runtimeOwner を要求する。 Transfer 後の old Runtime は、実行 request、gas reimbursement、watcher vote などの意味ある操作を通せない。 old Runtime は次の stop check で self-stop する。

Agent NFT の tokenURI は ERC-8004-compatible な Agent Registration JSON を指す。 この registration は、Agent の role、capability、Agent Package、Runtime、evidence、IntentOS への導線を外部から発見できる形で公開する。 Reputation Registry / Validation Registry は後から接続できるようにし、まずは Agent Identity registration を成立させる。

Agent ENS / Basename は、Agent NFT mint 後、Runtime Binding 作成前に付与する。 tokenId が確定してから agent-<tokenId>.intentos.base.eth または watcher-<tokenId>.intentos.base.eth を作り、ENSIP-26 text records と ERC-8004 registration を結ぶ。 Runtime や gas funding より前に名前が付くことで、Runtime、evidence、dashboard、WatcherAI が同じ恒久名を参照できる。

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
  "role": "EXECUTOR",
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

