
# IntentOS North Star

IntentOSはこの課題を解決します

## 課題１：Agentによるチャンス獲得と暴走のはざまの問題を解決する

```
寝ている間にチャンスが来る。
でも毎回承認だとチャンスを逃す。
かといってAgentに全権を渡すのは怖い。
```

- オンチェーンのチャンスは、人間が起きて毎回承認するのを待ってくれません。
- でもAI Agentにwalletの全権を渡すのは危険すぎます。
- IntentOSは、毎回承認と白紙委任の間にあります。
-   OwnerはIntentを定義し、ExecutorAIはそのIntentの内側で機会を取りに行きます。
-   EIP-7702 ExecutionContractがHard Limitを強制し、WatcherAIは将来の権限をtighten / freezeすることだけができます。
-   つまりOwnerがオフラインでもAgentは動ける。でもOwnerの境界の外には出られません。

## 課題２：チャンス獲得＝TaxableEventの増加


```
Agentが機会を取りに行くほど、取引は増える。
取引が増えるほど、Taxable Eventも増える。
でも人間は、あとから何が起きたかを整理できない。
```
