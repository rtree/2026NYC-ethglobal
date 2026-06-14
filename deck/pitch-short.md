---
marp: true
size: 16:9
paginate: false
backgroundColor: "#EAEEF7"
color: "#0F1626"
math: false
---

<!--
IntentOS — ULTRA-SHORT deck（2 slides, engineer-friendly）
狙い: エンジニアが「読んでそのまま喋れる」2枚。断定・事実先行、弁明調なし。
  Slide 1 = Problem & Solution（課題 → 解決方法＝3層アライメント）
  Slide 2 = Architecture & Implementation（技術構成図 + 実行フロー＝誰が署名/relay/照合するか）+ 背骨 + デモ予告
録画: 2枚ともデモ前に見せる → Slide 2 を言い切ったら product へ切替（唯一の切替）→ ライブデモ
      → デモ後は Slide 2 に戻り keycopy「alignment, not trust」で締める。
台本: 各スライド末尾の HTML コメント = presenter note（自然な口語の EN 原稿。断定調・記号区切りなし）。
ブランド: pitch.md と同一の明るい light 基調（bg #EAEEF7）+ mint=整合/安全, blue=技術, coral=リスク。
書き出し:
  npx @marp-team/marp-cli deck/pitch-short.md -o deck/pitch-short.pdf
  npx @marp-team/marp-cli deck/pitch-short.md --images png -o deck/pitch-short.png
-->

<style>
:root{
  --bg:#EAEEF7; --bg2:#FFFFFF; --fg:#0F1626; --muted:#5C6678;
  --accent:#10B981;  /* mint = alignment / safe */
  --accent2:#2563EB; /* blue = tech */
  --danger:#EF5B43;  /* coral = risk */
  --line:#D5DCEA;
  --line2:#C3CDE0;
  --card:#FFFFFF;
}
section{
  background:#EAEEF7;
  color:var(--fg);
  font-family:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI","Helvetica Neue","Hiragino Sans","Noto Sans JP",sans-serif;
  padding:84px 104px;
  font-size:25px;
  line-height:1.55;
  letter-spacing:.2px;
}
h1{font-size:64px;line-height:1.05;margin:0 0 18px;font-weight:800;letter-spacing:-1.2px;}
h2{font-size:42px;line-height:1.14;margin:0 0 16px;font-weight:800;letter-spacing:-.6px;}
strong{color:var(--fg);font-weight:800;}
em{color:var(--accent);font-style:normal;}
a{color:var(--accent2);}
.kicker{color:var(--accent);text-transform:uppercase;letter-spacing:4px;font-size:16px;font-weight:800;margin-bottom:24px;}
.muted{color:var(--muted);}
.lead{font-size:30px;color:#36415A;max-width:26ch;line-height:1.4;}
.hl{color:var(--accent);}
.hl2{color:var(--accent2);}
.bad{color:var(--danger);}
.keycopy{
  margin-top:8px;font-size:34px;font-weight:800;letter-spacing:-.4px;line-height:1.2;
  border-left:5px solid var(--accent);padding-left:22px;
}
.flow{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin:10px 0;}
.flow .node{background:var(--card);border:1px solid var(--line2);border-radius:12px;padding:12px 18px;font-weight:700;font-size:22px;}
.flow .sep{color:var(--muted);font-size:24px;}
.watch{margin-top:18px;}
.watch .item{display:flex;gap:16px;align-items:baseline;margin:16px 0;font-size:26px;}
.watch .num{color:var(--accent);font-weight:800;min-width:30px;}
.footer{position:absolute;left:104px;bottom:36px;color:var(--muted);font-size:15px;letter-spacing:1px;}
.title-wordmark{font-size:84px;font-weight:900;letter-spacing:-2px;line-height:1;margin-top:2px;}
.title-wordmark .os{color:var(--accent);}
.watchlabel{margin-top:30px;font-size:17px;letter-spacing:2px;color:var(--muted);font-weight:800;}
.mono{font-family:"SFMono-Regular",ui-monospace,"JetBrains Mono","Menlo",monospace;}
/* problem -> shift split */
.split{display:grid;grid-template-columns:1fr 1fr;gap:34px;margin-top:30px;}
.col .lab{font-size:14px;letter-spacing:2px;text-transform:uppercase;font-weight:800;margin-bottom:14px;}
.col.bad-col .lab{color:var(--danger);}
.col.good-col .lab{color:var(--accent);}
.pain{margin:0;padding:0;list-style:none;}
.pain li{position:relative;padding-left:26px;margin:12px 0;font-size:23px;line-height:1.4;}
.pain li::before{content:"";position:absolute;left:0;top:11px;width:10px;height:10px;border-radius:50%;background:var(--danger);}
.layers{margin:0;padding:0;list-style:none;}
.layer{display:flex;gap:14px;align-items:baseline;margin:14px 0;font-size:23px;line-height:1.35;}
.layer .lk{font-weight:800;color:var(--accent2);min-width:108px;font-size:18px;letter-spacing:1px;text-transform:uppercase;}
.layer .lv b{font-weight:800;}
/* how-it-works spec rows */
.spec{margin-top:18px;border-top:1px solid var(--line2);}
.spec .row{display:grid;grid-template-columns:230px 1fr;gap:20px;padding:15px 2px;border-bottom:1px solid var(--line2);align-items:baseline;}
.spec .k{font-size:16px;letter-spacing:1px;text-transform:uppercase;font-weight:800;color:var(--accent2);}
.spec .v{font-size:22px;line-height:1.35;}
.spec .v code{background:var(--card);border:1px solid var(--line2);border-radius:7px;padding:2px 8px;font-size:19px;}
.note{margin-top:18px;font-size:18px;color:var(--muted);}
.mono2{font-family:"SFMono-Regular",ui-monospace,"JetBrains Mono","Menlo",monospace;}
/* architecture two-column: stack diagram + execution flow */
.arch{display:grid;grid-template-columns:1.05fr 1fr;gap:30px;margin-top:24px;}
.archlab{font-size:14px;letter-spacing:2px;text-transform:uppercase;font-weight:800;color:var(--accent2);margin-bottom:12px;}
.stack{display:flex;flex-direction:column;gap:10px;}
.box{background:var(--card);border:1px solid var(--line2);border-radius:12px;padding:12px 16px;}
.box .bt{font-weight:800;font-size:19px;}
.box .bd{font-size:15px;color:var(--muted);line-height:1.35;margin-top:2px;}
.box.eoa{border-color:#7FD8B8;background:#E6F7F0;}
.box.eoa .bt{color:#0B8C62;}
.box.nest{margin-left:20px;}
.box.off{background:#EEF1F8;}
.steps{counter-reset:s;margin:0;padding:0;list-style:none;}
.steps li{position:relative;padding-left:42px;margin:0 0 14px;font-size:18px;line-height:1.38;}
.steps li::before{counter-increment:s;content:counter(s);position:absolute;left:0;top:0;width:26px;height:26px;border-radius:50%;background:var(--accent2);color:#fff;font-weight:800;font-size:14px;display:flex;align-items:center;justify-content:center;}
.steps code{background:var(--card);border:1px solid var(--line2);border-radius:6px;padding:1px 7px;font-size:15px;}
.steps b{font-weight:800;}
.steps .ok{color:#0B8C62;font-weight:800;}
.steps .no{color:var(--danger);font-weight:800;}
.tag{display:inline-block;font-size:12px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--muted);background:var(--card);border:1px solid var(--line2);border-radius:999px;padding:2px 9px;margin-left:6px;vertical-align:middle;}
/* dense slide 2 fits in 16:9 */
section.howitworks{padding:60px 88px;}
section.howitworks h2{font-size:38px;margin-bottom:6px;}
</style>

<!-- _class: opener -->

<div class="kicker">ETHGlobal NYC · 2026 — intentOS · ① Problem &amp; Solution</div>

## You want an agent to trade <span class="mono">USDC↔WETH</span> while you sleep.<br/>The risk isn't a rogue AI — it's <span class="bad">a wrong intent, optimized perfectly.</span>

<div class="split">
<div class="col bad-col">
<div class="lab">The problem · today you pick one</div>
<ul class="pain">
<li>Approve every tx by hand → you miss the opportunity.</li>
<li>Hand the agent your keys → you lose custody &amp; control.</li>
<li>Static limits can't tell "buy the dip" from "catch a crash."</li>
</ul>
</div>
<div class="col good-col">
<div class="lab">The solution · align at every layer</div>
<ul class="layers">
<li class="layer"><span class="lk">Initial</span><span class="lv"><b>Intent Builder</b> — compile intent into a typed <b>Constitution</b>.</span></li>
<li class="layer"><span class="lk">Mechanical</span><span class="lv"><b>EIP-7702</b> — enforce hard limits on every tx, on your own EOA.</span></li>
<li class="layer"><span class="lk">Semantic</span><span class="lv"><b>Watcher Agent</b> — re-read intent over time; tighten-only.</span></li>
</ul>
</div>
</div>

<div class="footer">Autonomy without authority — align it, don't trust it</div>

<!--
EN presenter note (assertive, fact-first — explain it to another engineer, no hedging):

"The setup. You want an agent to grow your ETH — trade USDC and WETH while you sleep. The real risk isn't a rogue AI. It's subtler and worse: you give it a goal, it optimizes that goal perfectly, and it does exactly what you said instead of what you meant.

Today you only get two options, and both are bad. Approve every transaction by hand, and you miss the move. Or hand the agent your keys, and you've given up custody. Static spend limits don't fix it either — a fixed cap can't tell 'buy the dip' from 'catch a falling knife.'

IntentOS solves it by aligning the agent at three layers. Initial: an Intent Builder compiles your intent into a typed Constitution. Mechanical: EIP-7702 enforces hard limits on every transaction, on your own account. Semantic: a Watcher Agent re-reads your intent over time and can only tighten. Next slide — the architecture, then we run it live."
-->

---

<!-- _class: howitworks -->

<div class="kicker">② Architecture &amp; Implementation · the demo you're about to see</div>

## The agent executes on your behalf — <span class="hl">without ever holding your funds.</span>

<div class="arch">
<div>
<div class="archlab">Components</div>
<div class="stack">
<div class="box eoa"><div class="bt">Owner EOA <span class="tag">EIP-7702</span></div><div class="bd">Funds stay here. Contract code is delegated onto your own account.</div></div>
<div class="box eoa nest"><div class="bt">ExecutionContract + Hard Guardrails</div><div class="bd">Typed limits: token · amount · slippage · expiry · freeze.</div></div>
<div class="box eoa nest"><div class="bt">ExecutionGasVault</div><div class="bd">Owner-prefunded gas lane. Executor / Watcher lanes are separate.</div></div>
<div class="box off"><div class="bt">Cloud Run Runtime + SessionKey <span class="tag mono2">0 ETH</span></div><div class="bd">OpenClaw agent. Holds a request key (KMS), never fund custody.</div></div>
<div class="box off"><div class="bt">Relayer + Watcher Agent</div><div class="bd">Relayer fronts gas; Watcher reads on-chain evidence, tighten-only.</div></div>
</div>
</div>
<div>
<div class="archlab">Execution flow — per tick</div>
<ol class="steps">
<li><b>Executor</b> emits a signal: <code>swap 50 USDC→WETH</code> (no keys).</li>
<li>Adapter quotes + simulates → builds a <b>typed ExecutionRequest</b>.</li>
<li><b>SessionKey (KMS)</b> signs the request digest — <span class="mono2">0 ETH</span>, can't send.</li>
<li><b>Relayer</b> submits <code>(req, sig)</code> &amp; fronts gas.</li>
<li><b>Contract</b> verifies sig + Hard Guardrails → <span class="ok">inside: execute</span> / <span class="no">outside: revert</span>.</li>
<li>Settle gas from <b>GasVault</b>; emit <code>EvidenceCommitted</code> for the Watcher.</li>
</ol>
</div>
</div>

<div class="keycopy" style="margin-top:18px;">Autonomous agents need <span class="hl">alignment</span>, not trust.</div>

<div class="footer">intentOS · ETHGlobal NYC 2026 — next: live demo on Base mainnet</div>

<!--
EN presenter note (assertive, fact-first — this is the slide you cut from into the live demo):

"Here's the architecture, then we run it live. The core trick is custody. We don't move your money into a new contract wallet. With EIP-7702 we delegate contract code onto your own EOA — funds stay put, self-custody holds the whole time. Inside that account live three things: the ExecutionContract with the hard guardrails, and a gas vault you prefund. Off-chain, on Cloud Run, the agent runs with a session key worth zero ETH and a relayer that fronts gas.

Now the flow, per tick. The executor emits a signal — swap fifty USDC to WETH — it holds no keys. The adapter quotes, simulates, and builds a typed ExecutionRequest. The session key in KMS signs the request digest; it has zero ETH and can't even send the transaction. The relayer submits the request plus signature and fronts the gas. The contract verifies the signature and checks the hard guardrails — token, amount, slippage, expiry. Inside the limits, it executes; outside, it reverts. Then gas is settled from the vault, and it emits an EvidenceCommitted event for the Watcher to audit.

So authority never leaves your account. The one line: autonomous agents need alignment, not trust. Let me show you — live on Base mainnet."

🔀 ここで画面共有を product に切替（唯一の切替）。デモ後はこのスライドに戻り、keycopy で締める。
-->
