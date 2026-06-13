
# IntentOS North Star

IntentOSはAIAgentによる取引の課題を
統合により解決するレイヤープロトコルです

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
         WatcherAI Agent NFTs
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
         WatcherAI Agent NFTs
```

なお、Executor AgentもWatcher AgentいずれもSessionKeyとしていわゆるWalletを保有しますが、資金は一切保有しません。資金は常に Owner のアドレスに残り、OwnerのSelf Custodyは失われません。また、Gas代もOwnerのEOAのdelegated contract内部にあるExecutionGasVaultから供給されます。

## Agent はどうやって Owner の資金を「代理執行」するのか

ポイントは 「資金は一度も Agent に渡さない。Owner 自身のアカウントの中でだけ動く」 という点です。鍵になるのが EIP-7702 delegated account です。

```
Owner EOA（資金はここに残る）
  └─ EIP-7702 で delegated account code を持つ
        ├─ ExecutionContract（最終権限）
        ├─ Hard Guardrails（型付き制約）
        ├─ ExecutionGasVault (エージェントへのガス代供給用)
```

EIP-7702 によって、Owner の EOA そのものに「契約コード」を後付けします。資金は別口座に移さず、Owner の balance のまま。その Owner アカウントのコードの中に、ExecutionContract と Hard Guardrails が同居します。


