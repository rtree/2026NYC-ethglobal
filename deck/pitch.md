---
marp: true
size: 16:9
paginate: true
backgroundColor: "#EAEEF7"
color: "#0F1626"
math: false
---

<!--
IntentOS — 前半スライド（S1–S3）+ Title（イントロ）/ Closing（デモ後に戻す）
録画: Zoom 画面共有（Title→S1–S3 ~1:12）→ 切替1回 → product ライブデモ → Closing に戻す
台本同期: pitch-demo-outline.md (v3) / 母艦: pitch-master.md
ブランド: 明るめ light 基調（bg #EAEEF7）+ mint = 整合/安全, blue = 技術, coral = リスク
書き出し例:
  Marp: For VS Code 拡張、または CLI:
  npx @marp-team/marp-cli deck/pitch.md -o deck/pitch.pdf
  npx @marp-team/marp-cli deck/pitch.md -o deck/pitch.pptx
各スライド末尾の HTML コメントは presenter note（EN ナレーション）。
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
.lead{font-size:30px;color:#36415A;max-width:23ch;line-height:1.4;}
.hl{color:var(--accent);}
.hl2{color:var(--accent2);}
.bad{color:var(--danger);}
.quote{font-size:32px;color:#27324A;font-style:italic;font-weight:600;}
.keycopy{
  margin-top:8px;font-size:34px;font-weight:800;letter-spacing:-.4px;line-height:1.2;
  border-left:5px solid var(--accent);padding-left:22px;
}
.flow{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin:10px 0;}
.flow .node{background:var(--card);border:1px solid var(--line2);border-radius:12px;padding:12px 18px;font-weight:700;font-size:22px;}
.flow .sep{color:var(--muted);font-size:24px;}
.cards{display:flex;gap:20px;margin-top:20px;}
.card{flex:1;background:var(--card);border:1px solid var(--line2);border-radius:18px;padding:26px 24px;}
.card .n{font-size:15px;font-weight:800;letter-spacing:2px;color:var(--accent2);}
.card .t{font-size:24px;font-weight:800;margin:8px 0 6px;}
.card .d{font-size:18px;color:var(--muted);line-height:1.45;}
.two{display:grid;grid-template-columns:1fr 1fr;gap:30px;align-items:center;}
.watch{margin-top:16px;}
.watch .item{display:flex;gap:16px;align-items:baseline;margin:14px 0;font-size:25px;}
.watch .num{color:var(--accent);font-weight:800;min-width:30px;}
.pill{display:inline-block;background:var(--card);border:1px solid var(--line2);border-radius:999px;padding:8px 16px;font-size:16px;color:var(--muted);font-weight:700;}
.footer{position:absolute;left:104px;bottom:36px;color:var(--muted);font-size:15px;letter-spacing:1px;}
section::after{color:var(--muted);font-size:14px;}
.title-wordmark{font-size:90px;font-weight:900;letter-spacing:-2px;line-height:1;}
.title-wordmark .os{color:var(--accent);}
.vs{display:grid;grid-template-columns:1fr 1fr;gap:22px;margin-top:8px;}
.qbox{background:var(--card);border:1px solid var(--line2);border-radius:16px;padding:20px 22px;}
.qbox.them{background:#EEF1F8;}
.qbox.them .q{color:#3A445C;}
.qbox .lab{font-size:14px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);font-weight:800;margin-bottom:8px;}
.qbox .q{font-size:23px;font-weight:700;}
.qbox.us{border-color:#7FD8B8;background:#E6F7F0;}
.qbox.us .q{color:#0B8C62;}
section.title{justify-content:center;}
section.title .lead{margin-bottom:64px;}
</style>

<!-- _paginate: false -->
<!-- _class: title -->

<div class="kicker">ETHGlobal NYC · 2026</div>

<div class="title-wordmark">Intent<span class="os">OS</span></div>

<p class="lead" style="margin-top:26px;">Turning vague human intent into autonomous agents that <span class="hl">stay aligned</span> — even while you sleep.</p>

<div class="footer">Autonomy without authority</div>

<!--
EN (イントロ): IntentOS turns vague human intent into autonomous agents that stay aligned — even while you sleep.
note: Title はイントロとして録画に含める。一言だけ言って S1（Problem）へ。
-->

---

<!-- _class: problem -->

<div class="kicker">The Problem</div>

## The risk isn't an evil AI.<br/>It's a wrong intention, <span class="bad">optimized perfectly.</span>

<div class="two" style="margin-top:44px;">
<div>
<div class="pill">2:14 AM · you're asleep</div>
<p class="quote" style="margin-top:20px;">"Grow my ETH<br/>while I sleep."</p>
</div>
<div>
<div class="flow"><span class="node">MAXIMIZE_ETH</span><span class="sep">›</span><span class="node">optimized perfectly</span></div>
<div class="flow"><span class="sep">→</span><span class="node bad" style="border-color:rgba(239,91,67,.4);color:var(--danger);">missed what you meant</span></div>
</div>
</div>

<div class="keycopy" style="margin-top:56px;">AI did not fail. It followed the instruction.</div>

<!--
EN: While you sleep, the best on-chain opportunities don't wait for you. So you might hand the job to an AI — "Grow my ETH while I sleep." It can do exactly that, perfectly. And that's the real risk: not an evil AI, but a wrong intention optimized perfectly — it missed what you actually meant. It didn't fail; it followed the instruction. Until now you had two bad choices: approve every action by hand and miss the opportunity, or hand over authority and lose control.
note: "two bad choices" はスライドから外し、ナレーションで言及（口頭で補う）。
-->

---

<!-- _class: thesis -->

<div class="kicker">The Thesis</div>

# Autonomy without authority.

<p class="muted" style="font-size:24px;margin:0 0 12px;">We compile your intent into a bounded agent — and align it at every layer.</p>

<div class="cards">
<div class="card"><div class="n">① INITIAL</div><div class="t">Intent Builder</div><div class="d">Understands what you actually mean.</div></div>
<div class="card"><div class="n">② MECHANICAL</div><div class="t">EIP-7702</div><div class="d">Enforces it on-chain, on every action.</div></div>
<div class="card"><div class="n">③ SEMANTIC</div><div class="t">Watcher Agent</div><div class="d">Guards the meaning over time.</div></div>
<div class="card"><div class="n">④ ECONOMY</div><div class="t">Agent NFT</div><div class="d">Portable, ownable autonomous identity.</div></div>
</div>

<div class="keycopy" style="margin-top:32px;">Autonomous agents need <span class="hl">alignment</span>, not trust.</div>

<!--
EN: IntentOS is a third option: autonomy without authority. We compile your intent into a bounded agent — and align it at every layer. Intent Builder gives initial alignment, understanding what you mean. EIP-7702 gives mechanical alignment, enforcing it on-chain. A Watcher gives semantic alignment over time. The whole idea is one line: autonomous agents need alignment, not trust.
-->

---

<!-- _class: positioning -->

<div class="kicker">Positioning</div>

## Not an AI wallet.<br/>An <span class="hl">alignment &amp; execution layer.</span>

<div class="vs">
<div class="qbox them"><div class="lab">Others</div><div class="q">"How can we trust AI with permissions?"</div></div>
<div class="qbox us"><div class="lab">IntentOS</div><div class="q">"Why should trust be required?"</div></div>
</div>

<div style="margin-top:28px;font-size:17px;letter-spacing:2px;color:var(--muted);font-weight:800;">NOW — LIVE — WATCH FOR THREE THINGS</div>
<div class="watch">
<div class="item"><span class="num">1</span><span>Your intent becomes an <strong>agent NFT</strong>.</span></div>
<div class="item"><span class="num">2</span><span>It <strong>executes while you sleep</strong> — you approve nothing.</span></div>
<div class="item"><span class="num">3</span><span>A <strong>Watcher</strong> can tighten it — <span class="hl">but never loosen it.</span></span></div>
</div>

<!--
EN: So IntentOS is not an AI wallet — it's an alignment and execution layer. Others ask how to trust AI with permissions; we ask why trust should be required at all. Let me show you the live product. Watch for three things: your intent becomes an agent NFT; it executes while you sleep; and a Watcher can tighten it — but never loosen it.
切替: 言い終えたら画面共有を product に切替（唯一の切替）。
-->

---

<!-- _paginate: false -->
<!-- _class: closing -->
<!-- 録画ではデモ後に slides へ戻してこの Closing を表示する。 -->

<div class="kicker">Closing</div>

<div class="flow" style="margin-bottom:28px;">
<span class="node">① Intent Builder</span><span class="sep">→</span>
<span class="node">② EIP-7702</span><span class="sep">→</span>
<span class="node">③ Watcher</span><span class="sep">→</span>
<span class="node">④ Agent NFT</span>
</div>

# Separate intelligence<br/>from <span class="hl">authority.</span>

<p class="lead" style="max-width:30ch;margin-top:18px;">Autonomous agents don't need your trust. They need to stay aligned with what you meant.</p>

<div class="footer">IntentOS · ETHGlobal NYC 2026</div>

<!--
EN: Intent Builder aligns at the start, EIP-7702 enforces it, the Watcher guards the meaning over time — and the agent is a transferable NFT, the start of an agent economy. Autonomous agents don't need your trust; they need to stay aligned with what you meant. We separate intelligence from authority.
-->
