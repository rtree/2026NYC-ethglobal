<!--
IntentOS — 前半スライド（S1–S3）+ 任意 Title / Closing
録画: Zoom 画面共有（前半スライド ~1:12）→ 切替1回 → product ライブデモ
台本同期: pitch-demo-outline.md (v3) / 母艦: pitch-master.md
ブランド: 叩き台（黒基調 + mint = 整合/安全, sky = 技術, coral = リスク）
書き出し例:
  Marp: For VS Code 拡張、または CLI:
  npx @marp-team/marp-cli deck/pitch.md -o deck/pitch.pdf
  npx @marp-team/marp-cli deck/pitch.md -o deck/pitch.pptx
各スライドの <!-- ... --> は presenter note（EN ナレーション）。
-->
---
marp: true
size: 16:9
paginate: true
backgroundColor: "#0A0E16"
color: "#EAEEF7"
math: false
---

<style>
:root{
  --bg:#0A0E16; --bg2:#0E1422; --fg:#EAEEF7; --muted:#8A94A6;
  --accent:#6EE7B7;  /* mint = alignment / safe */
  --accent2:#38BDF8; /* sky  = tech */
  --danger:#F4795B;  /* coral = risk */
  --line:rgba(255,255,255,.10);
  --card:rgba(255,255,255,.04);
}
section{
  background:
    radial-gradient(1100px 560px at 82% -12%, rgba(56,189,248,.12), transparent 60%),
    radial-gradient(900px 520px at -10% 110%, rgba(110,231,183,.10), transparent 60%),
    var(--bg);
  color:var(--fg);
  font-family:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI","Helvetica Neue","Hiragino Sans","Noto Sans JP",sans-serif;
  padding:60px 76px;
  font-size:25px;
  line-height:1.5;
  letter-spacing:.2px;
}
h1{font-size:62px;line-height:1.04;margin:0 0 14px;font-weight:800;letter-spacing:-1.2px;}
h2{font-size:40px;line-height:1.12;margin:0 0 12px;font-weight:800;letter-spacing:-.6px;}
strong{color:var(--fg);font-weight:800;}
em{color:var(--accent);font-style:normal;}
a{color:var(--accent2);}
.kicker{color:var(--accent);text-transform:uppercase;letter-spacing:4px;font-size:16px;font-weight:800;margin-bottom:18px;}
.muted{color:var(--muted);}
.lead{font-size:30px;color:#C7CEDB;max-width:23ch;line-height:1.35;}
.hl{color:var(--accent);}
.hl2{color:var(--accent2);}
.bad{color:var(--danger);}
.quote{font-size:30px;color:#C7CEDB;font-style:italic;}
.keycopy{
  margin-top:8px;font-size:34px;font-weight:800;letter-spacing:-.4px;line-height:1.18;
  border-left:4px solid var(--accent);padding-left:20px;
}
.flow{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin:10px 0;}
.flow .node{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 16px;font-weight:700;font-size:22px;}
.flow .sep{color:var(--muted);font-size:24px;}
.cards{display:flex;gap:18px;margin-top:14px;}
.card{flex:1;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px 20px;}
.card .n{font-size:15px;font-weight:800;letter-spacing:2px;color:var(--accent2);}
.card .t{font-size:23px;font-weight:800;margin:6px 0 4px;}
.card .d{font-size:18px;color:var(--muted);line-height:1.4;}
.two{display:grid;grid-template-columns:1fr 1fr;gap:22px;align-items:center;}
.badrow{display:flex;gap:18px;margin-top:8px;}
.badcard{flex:1;background:rgba(244,121,91,.08);border:1px solid rgba(244,121,91,.30);border-radius:14px;padding:16px 18px;}
.badcard .t{font-weight:800;font-size:21px;color:var(--danger);}
.badcard .d{font-size:17px;color:#C7CEDB;}
.watch{margin-top:10px;}
.watch .item{display:flex;gap:14px;align-items:baseline;margin:10px 0;font-size:24px;}
.watch .num{color:var(--accent);font-weight:800;min-width:30px;}
.pill{display:inline-block;background:var(--card);border:1px solid var(--line);border-radius:999px;padding:6px 14px;font-size:16px;color:var(--muted);font-weight:700;}
.footer{position:absolute;left:76px;bottom:30px;color:var(--muted);font-size:15px;letter-spacing:1px;}
section::after{color:var(--muted);font-size:14px;}
.title-wordmark{font-size:84px;font-weight:900;letter-spacing:-2px;line-height:1;}
.title-wordmark .os{color:var(--accent);}
.vs{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:6px;}
.qbox{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px;}
.qbox.them{opacity:.7;}
.qbox .lab{font-size:14px;letter-spacing:2px;text-transform:uppercase;color:var(--muted);font-weight:800;margin-bottom:6px;}
.qbox .q{font-size:22px;font-weight:700;}
.qbox.us{border-color:rgba(110,231,183,.35);background:rgba(110,231,183,.06);}
.qbox.us .q{color:var(--accent);}
</style>

<!-- _paginate: false -->
<!-- _class: title -->

<div class="kicker">ETHGlobal NYC · 2026</div>

<div class="title-wordmark">Intent<span class="os">OS</span></div>

<p class="lead" style="margin-top:26px;">Turning vague human intent into autonomous agents that <span class="hl">stay aligned</span> — even while you sleep.</p>

<div class="footer">Autonomy without authority</div>

<!--
EN (任意・イントロ): IntentOS turns vague human intent into autonomous agents that stay aligned — even while you sleep.
-->

---

<!-- _class: problem -->

<div class="kicker">The Problem</div>

## The risk isn't an evil AI.<br/>It's a wrong intention, <span class="bad">optimized perfectly.</span>

<div class="two" style="margin-top:18px;">
<div>
<div class="pill">2:14 AM · you're asleep</div>
<p class="quote" style="margin-top:14px;">"Grow my ETH<br/>while I sleep."</p>
</div>
<div>
<div class="flow"><span class="node">MAXIMIZE_ETH</span><span class="sep">›</span><span class="node">optimized perfectly</span></div>
<div class="flow"><span class="sep">→</span><span class="node bad" style="border-color:rgba(244,121,91,.4);color:var(--danger);">missed what you meant</span></div>
</div>
</div>

<div class="keycopy" style="margin-top:18px;">AI did not fail. It followed the instruction.</div>

<div class="badrow">
<div class="badcard"><div class="t">✋ Approve everything</div><div class="d">Safe — but you miss the opportunity.</div></div>
<div class="badcard"><div class="t">🔓 Hand over authority</div><div class="d">Autonomous — but you lose control.</div></div>
</div>

<!--
EN: While you sleep, the best on-chain opportunities don't wait for you. So you might hand the job to an AI — "Grow my ETH while I sleep." It can do exactly that, perfectly. And that's the real risk: not an evil AI, but a wrong intention optimized perfectly — it missed what you actually meant. It didn't fail; it followed the instruction. Until now you had two bad choices: approve every action by hand and miss the opportunity, or hand over authority and lose control.
-->

---

<!-- _class: thesis -->

<div class="kicker">The Thesis</div>

# Autonomy without authority.

<p class="muted" style="font-size:24px;margin:0 0 8px;">We compile your intent into a bounded agent — and align it at every layer.</p>

<div class="cards">
<div class="card"><div class="n">① INITIAL</div><div class="t">Intent Builder</div><div class="d">Understands what you actually mean.</div></div>
<div class="card"><div class="n">② MECHANICAL</div><div class="t">EIP-7702</div><div class="d">Enforces it on-chain, on every action.</div></div>
<div class="card"><div class="n">③ SEMANTIC</div><div class="t">Watcher Agent</div><div class="d">Guards the meaning over time.</div></div>
<div class="card"><div class="n">④ ECONOMY</div><div class="t">Agent NFT</div><div class="d">Portable, ownable autonomous identity.</div></div>
</div>

<div class="keycopy" style="margin-top:22px;">Autonomous agents need <span class="hl">alignment</span>, not trust.</div>

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

<div style="margin-top:18px;font-size:17px;letter-spacing:2px;color:var(--muted);font-weight:800;">NOW — LIVE — WATCH FOR THREE THINGS</div>
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
<!-- 任意: デモ後に slides へ戻す場合のみ使用。戻さないなら product 画面のまま終了。 -->

<div class="kicker">Closing</div>

<div class="flow" style="margin-bottom:20px;">
<span class="node">① Intent Builder</span><span class="sep">→</span>
<span class="node">② EIP-7702</span><span class="sep">→</span>
<span class="node">③ Watcher</span><span class="sep">→</span>
<span class="node">④ Agent NFT</span>
</div>

# Separate intelligence<br/>from <span class="hl">authority.</span>

<p class="lead" style="max-width:30ch;margin-top:14px;">Autonomous agents don't need your trust. They need to stay aligned with what you meant.</p>

<div class="footer">IntentOS · intentos.arkt.me</div>

<!--
EN: Intent Builder aligns at the start, EIP-7702 enforces it, the Watcher guards the meaning over time — and the agent is a transferable NFT, the start of an agent economy. Autonomous agents don't need your trust; they need to stay aligned with what you meant. We separate intelligence from authority.
-->
