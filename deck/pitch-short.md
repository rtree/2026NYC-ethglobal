---
marp: true
size: 16:9
paginate: false
backgroundColor: "#EAEEF7"
color: "#0F1626"
math: false
---

<!--
IntentOS — ULTRA-SHORT deck（2 slides only）
主催者要望: スライドは短く、メインはライブデモ。スライドは "前説1枚 + 締め1枚" に凝縮。
録画: [S-OPEN] を表示して前説 → 言い切った瞬間に画面共有を product へ切替（唯一の切替）
       → ライブデモ（D1–D4）→ デモ後 [S-CLOSE] に戻して締める。
台本: pitch-narration.md（テレプロンプター）/ フル版スライド: pitch.md
ブランド: pitch.md と同一の明るい light 基調（bg #EAEEF7）+ mint=整合/安全, blue=技術, coral=リスク。
書き出し:
  npx @marp-team/marp-cli deck/pitch-short.md -o deck/pitch-short.pdf
  npx @marp-team/marp-cli deck/pitch-short.md --images png -o deck/pitch-short.png
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
</style>

<!-- _class: opener -->

<div class="kicker">ETHGlobal NYC · 2026</div>

<div class="title-wordmark">Intent<span class="os">OS</span></div>

<p class="lead" style="margin-top:22px;">Autonomy without authority — your intent becomes an agent that <span class="hl">stays aligned</span>, even while you sleep.</p>

<div class="keycopy" style="margin-top:34px;">Autonomous agents need <span class="hl">alignment</span>, not trust.</div>

<div class="watchlabel">NOW — LIVE — WATCH FOR THREE THINGS</div>
<div class="watch">
<div class="item"><span class="num">1</span><span>Your intent becomes an <strong>agent NFT</strong>.</span></div>
<div class="item"><span class="num">2</span><span>It <strong>executes while you sleep</strong> — you approve nothing.</span></div>
<div class="item"><span class="num">3</span><span>A <strong>Watcher</strong> can tighten it — <span class="hl">but never loosen it.</span></span></div>
</div>

<div class="footer">Autonomy without authority</div>

<!--
EN (前説 / hold this slide, then cut to the live demo):
"IntentOS — autonomy without authority. The real risk isn't an evil AI; it's a wrong intention optimized perfectly — it does exactly what you said, and misses what you meant. So we compile your intent into a bounded agent and align it at every layer: Intent Builder, EIP-7702, and a Watcher. The whole idea is one line — autonomous agents need alignment, not trust. Let me show you the live product. Watch for three things: your intent becomes an agent NFT; it executes while you sleep; and a Watcher can tighten it — but never loosen it."
🔀 言い切ったら画面共有を product へ切替（唯一の切替）→ 一拍おいて D1 へ。
-->

---

<!-- _class: closing -->

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
EN (デモ後にこのスライドへ戻して締める):
"Intent Builder aligns at the start, EIP-7702 enforces it, the Watcher guards the meaning over time — and the agent is a transferable NFT, the start of an agent economy. Autonomous agents don't need your trust; they need to stay aligned with what you meant. We separate intelligence from authority."
-->
