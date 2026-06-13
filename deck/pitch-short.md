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
狙い: エンジニアが「読んでそのまま喋れる」2枚。詩的コピーをやめ、技術フックを面に出す。
  Slide 1 = The Problem → The Shift（なぜ難しい→3層アライメントの構え）
  Slide 2 = How it works（EIP-7702 / session key 0 ETH / Relayer / Watcherは締めるだけ）+ 背骨 + デモ予告
録画: 2枚ともデモ前に見せる → Slide 2 を言い切ったら product へ切替（唯一の切替）→ ライブデモ
      → デモ後は Slide 2 に戻り keycopy「alignment, not trust」で締める。
台本: 各スライド末尾の HTML コメント = presenter note（自然な口語の EN 原稿。記号区切りなし）。
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
</style>

<!-- _class: opener -->

<div class="kicker">ETHGlobal NYC · 2026 — IntentOS</div>

## You want an agent to trade <span class="mono">USDC↔WETH</span> while you sleep.<br/>The risk isn't a rogue AI — it's <span class="bad">a wrong intent, optimized perfectly.</span>

<div class="split">
<div class="col bad-col">
<div class="lab">Today you pick one</div>
<ul class="pain">
<li>Approve every tx by hand → you miss the opportunity.</li>
<li>Hand the agent your keys → you lose custody &amp; control.</li>
<li>Static limits can't tell "buy the dip" from "catch a crash."</li>
</ul>
</div>
<div class="col good-col">
<div class="lab">IntentOS — align at every layer</div>
<ul class="layers">
<li class="layer"><span class="lk">Initial</span><span class="lv"><b>Intent Builder</b> compiles intent → a typed <b>Constitution</b>.</span></li>
<li class="layer"><span class="lk">Mechanical</span><span class="lv"><b>EIP-7702</b> enforces hard limits on every tx.</span></li>
<li class="layer"><span class="lk">Semantic</span><span class="lv"><b>Watcher Agent</b> re-reads intent &amp; can only tighten.</span></li>
</ul>
</div>
</div>

<div class="footer">Autonomy without authority</div>

<!--
EN presenter note (natural, conversational — read it like you'd explain to another engineer):

"Okay, the setup. You want an agent to grow your ETH — trade USDC and WETH for you while you're asleep. The scary part isn't some rogue AI going evil. It's subtler: you give it a goal, it optimizes that goal perfectly, and it does exactly what you said instead of what you meant.

And today you're stuck picking one of two bad options. Either you approve every transaction by hand — and you miss the move — or you hand the agent your keys and you've given up custody. Static spend limits don't save you either, because a fixed cap can't tell 'buy the dip' apart from 'catch a falling knife.'

So IntentOS doesn't ask you to trust the agent. We align it at three layers. First, initial alignment: an Intent Builder interviews you and compiles your intent into a typed Constitution. Second, mechanical alignment: with EIP-7702 those limits are enforced on your own account, on every transaction. Third, semantic alignment: a Watcher Agent re-reads your original intent over time — and it can only tighten, never loosen. That's the whole pitch — let me show you how it actually works."
-->

---

<!-- _class: howitworks -->

<div class="kicker">How it works · the demo you're about to see</div>

## Your intent becomes an agent that executes — <span class="hl">without ever holding your funds.</span>

<div class="spec">
<div class="row"><div class="k">Custody</div><div class="v"><b>EIP-7702</b> attaches contract code to <b>your own EOA</b>. Funds never move — you keep self-custody.</div></div>
<div class="row"><div class="k">Agent key</div><div class="v">Runtime holds a <b>session key with <code>0 ETH</code></b> — it can <i>request</i> execution, never move money.</div></div>
<div class="row"><div class="k">Gas</div><div class="v">A <b>Relayer</b> fronts gas; it's repaid from an in-account <b>GasVault</b>. The agent has zero custody.</div></div>
<div class="row"><div class="k">Hard guard</div><div class="v">Contract checks every request: <code>token</code> · <code>amount</code> · <code>slippage</code> · <code>expiry</code> → inside = execute, outside = <b>revert</b>.</div></div>
<div class="row"><div class="k">Semantic guard</div><div class="v"><b>Watcher Agent</b> reads on-chain evidence &amp; can <b>tighten / freeze</b> — <span class="hl">never loosen. Only you can.</span></div></div>
</div>

<div class="keycopy" style="margin-top:24px;">Autonomous agents need <span class="hl">alignment</span>, not trust.</div>

<div class="footer">IntentOS · ETHGlobal NYC 2026 — next: live demo on Base mainnet</div>

<!--
EN presenter note (natural, conversational — this is the slide you cut from into the live demo):

"Here's the architecture, then we go straight to the live product. The trick is custody. We do NOT move your money into some new smart-contract wallet. With EIP-7702 we attach contract code to your own EOA — your funds literally never move, you keep self-custody the whole time.

The agent's runtime only holds a session key worth zero ETH. It can request an execution, but it can't move a cent on its own. Gas? A relayer fronts it and gets paid back from a gas vault that lives inside your account — so again, the agent never holds funds.

Every request hits a hard guard in the contract: it checks the token pair, the amount, slippage, expiry — inside the limits it executes, outside it just reverts. That's mechanical. Then on top, an optional Watcher Agent reads the on-chain evidence and can tighten or freeze the limits over time — but here's the key invariant: it can only tighten, never loosen. Even a compromised watcher can only make you safer. Only you, the owner, can loosen.

So the one line to remember is: autonomous agents need alignment, not trust. Let me show you — this is running on Base mainnet."

🔀 ここで画面共有を product に切替（唯一の切替）。デモ後はこのスライドに戻り、keycopy で締める。
-->
