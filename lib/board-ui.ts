// smriti board — the page, authored as one self-contained string.
//
// "The sketchbook": a planning board drawn by hand in a pine wood. Grid paper,
// pine-green marker ink, wonky hand-drawn boxes, highlighter for what needs
// you, a second marker (orange) for live work. Chalkboard SE for prose (ships
// with macOS — nothing loads over the network); mono for instrumentation.
//
// All data arrives via fetch('/api/state') and SSE — nothing is baked into the
// page, so a refresh event just refetches. No framework, no build step.

export function boardPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>smriti — factory</title>
<style>
  /* Two grounds, one hand. Light is marker on warm sketch stock; dark is chalk
     on slate. Every rule below reads tokens only, so the whole board flips
     without a second stylesheet. Follows the OS by default; the t key
     overrides and the choice sticks. */
  :root{
    --paper:#F7F4E9; --paper-2:#FDFBF3; --grid:#D9DCC8;
    --ink:#1E4032; --ink-2:#3D5F4A; --ink-3:#7A9182; --ink-4:#AFC0B2;
    --hi:#F2E85C; --hi-rgb:242,232,92; --orange:#E2703A;
    --pine-a:#2E5C43; --pine-b:#3F7355; --pine-c:#58906B;
    --tree:#2E5C43; --live-bg:#FFF4EC; --attach-bg:#F2F7EE;
    --sh:30,64,50; --veil:rgba(30,64,50,.18); --dust:.06;
    --hi-wash:.55; --hi-text:var(--ink-2);
  }
  @media (prefers-color-scheme: dark){
    :root{
      --paper:#1B2422; --paper-2:#232E2B; --grid:#26332F;
      --ink:#E7EDE8; --ink-2:#BCCBC4; --ink-3:#7E9189; --ink-4:#4E5D57;
      --hi:#EBCB8B; --hi-rgb:235,203,139; --orange:#D08770;
      --pine-a:#A3BE8C; --pine-b:#8FBCBB; --pine-c:#88C0D0;
      --tree:#7E9C86; --live-bg:#2E2A27; --attach-bg:#22302E;
      --sh:0,0,0; --veil:rgba(0,0,0,.55); --dust:.10;
      --hi-wash:.20; --hi-text:var(--hi);
    }
  }
  /* The toggle must win over the media query in BOTH directions. */
  :root[data-theme="dark"]{
    --paper:#1B2422; --paper-2:#232E2B; --grid:#26332F;
    --ink:#E7EDE8; --ink-2:#BCCBC4; --ink-3:#7E9189; --ink-4:#4E5D57;
    --hi:#EBCB8B; --hi-rgb:235,203,139; --orange:#D08770;
    --pine-a:#A3BE8C; --pine-b:#8FBCBB; --pine-c:#88C0D0;
    --tree:#7E9C86; --live-bg:#2E2A27; --attach-bg:#22302E;
    --sh:0,0,0; --veil:rgba(0,0,0,.55); --dust:.10;
    --hi-wash:.20; --hi-text:var(--hi);
  }
  :root[data-theme="light"]{
    --paper:#F7F4E9; --paper-2:#FDFBF3; --grid:#D9DCC8;
    --ink:#1E4032; --ink-2:#3D5F4A; --ink-3:#7A9182; --ink-4:#AFC0B2;
    --hi:#F2E85C; --hi-rgb:242,232,92; --orange:#E2703A;
    --pine-a:#2E5C43; --pine-b:#3F7355; --pine-c:#58906B;
    --tree:#2E5C43; --live-bg:#FFF4EC; --attach-bg:#F2F7EE;
    --sh:30,64,50; --veil:rgba(30,64,50,.18); --dust:.06;
    --hi-wash:.55; --hi-text:var(--ink-2);
  }
  *{box-sizing:border-box}
  html,body{height:100%}
  body{
    margin:0;background:var(--paper);color:var(--ink);
    font-family:"Chalkboard SE","Chalkboard","Marker Felt","Bradley Hand",cursive;
    font-size:16px;line-height:1.55;overflow-x:hidden;-webkit-font-smoothing:antialiased;
    transition:background-color .25s ease,color .25s ease;
  }
  body::before{
    content:"";position:fixed;inset:0;pointer-events:none;z-index:0;
    background-image:linear-gradient(var(--grid) 1px,transparent 1px),
      linear-gradient(90deg,var(--grid) 1px,transparent 1px);
    background-size:26px 26px;opacity:.55;
  }
  body::after{
    content:"";position:fixed;inset:0;pointer-events:none;z-index:1;opacity:var(--dust);
    background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='150' height='150'><filter id='p'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/></filter><rect width='150' height='150' filter='url(%23p)'/></svg>");
  }
  .mono{font-family:ui-monospace,"SF Mono",Menlo,monospace}
  .sheet{position:relative;z-index:2;max-width:1080px;margin:0 auto;padding:38px 34px 150px}

  .box{
    border:2.5px solid var(--ink);background:var(--paper-2);
    border-radius:16px 22px 14px 20px/20px 14px 22px 16px;
    box-shadow:2px 3px 0 rgba(var(--sh),.3);
  }
  .b2{border-radius:22px 14px 20px 16px/14px 20px 16px 22px}
  .b3{border-radius:14px 20px 22px 15px/22px 16px 14px 20px}
  .b4{border-radius:20px 16px 15px 22px/16px 22px 20px 14px}

  .top{display:flex;align-items:center;justify-content:space-between;gap:22px;margin-bottom:30px}
  .mark{
    display:inline-block;padding:9px 20px 11px;font-size:27px;color:var(--ink);
    border:2.5px solid var(--ink);background:var(--paper-2);
    border-radius:18px 24px 16px 22px/22px 16px 24px 18px;
    transform:rotate(-1.1deg);box-shadow:3px 4px 0 rgba(var(--sh),.34);
  }
  .mark span{color:var(--pine-c)}
  .eye{font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3)}
  .eye b{color:var(--ink);font-weight:400}

  .lab{
    display:inline-block;font-family:ui-monospace,Menlo,monospace;font-size:11px;
    letter-spacing:.22em;text-transform:uppercase;color:var(--ink-2);
    margin:0 0 14px;padding:3px 8px;transform:rotate(-.7deg);
    background:linear-gradient(180deg,transparent 52%,rgba(var(--hi-rgb),var(--hi-wash)) 52%,rgba(var(--hi-rgb),var(--hi-wash)) 92%,transparent 92%);color:var(--hi-text);
    background-size:0% 100%;background-repeat:no-repeat;
    animation:swipe .6s ease-out .15s forwards;
  }
  @keyframes swipe{to{background-size:100% 100%}}

  .wait{padding:20px 24px 22px;margin-bottom:34px;transform:rotate(.35deg)}
  .wait .item{display:block;color:inherit;padding:11px 6px;cursor:pointer;border-radius:10px}
  .wait .item+.item{border-top:2px dashed var(--ink-4);margin-top:4px;padding-top:15px}
  .wait .item.sel{background:rgba(var(--hi-rgb),.14);box-shadow:inset 3px 0 0 var(--hi)}
  .wait .h{
    font-size:29px;line-height:1.22;color:var(--ink);text-wrap:balance;display:inline;
    background:linear-gradient(180deg,transparent 64%,rgba(var(--hi-rgb),var(--hi-wash)) 64%,rgba(var(--hi-rgb),var(--hi-wash)) 96%,transparent 96%);
    box-decoration-break:clone;-webkit-box-decoration-break:clone;padding:0 2px;
  }
  .wait .sub2{margin-top:9px;font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-3)}
  .wait .sub2 b{color:var(--orange);font-weight:400}
  .wait .empty{font-size:19px;color:var(--ink-3);padding:6px}

  .trees{display:block;width:100%;height:auto;margin:6px 0 -2px;opacity:.95}
  .trees.off{display:none}

  .plot{margin-top:34px}
  .phead{display:flex;align-items:center;gap:12px;margin-bottom:12px;cursor:pointer}
  .phead:focus-visible{outline:2.5px solid var(--hi);outline-offset:4px;border-radius:8px}
  .sig{
    width:34px;height:34px;flex:none;display:grid;place-items:center;
    font-family:ui-monospace,Menlo,monospace;font-size:10px;font-weight:700;
    border:2.5px solid var(--ink);background:var(--paper-2);color:var(--ink);
    border-radius:11px 14px 9px 13px/13px 9px 14px 11px;transform:rotate(-2deg);
    transition:transform .15s ease;
  }
  .phead:hover .sig{transform:rotate(2deg) scale(1.06)}
  .sig.ghost{border-style:dashed;border-color:var(--ink-4);color:var(--ink-4)}
  .pname{font-size:21px}
  .pline{flex:1;border-bottom:2.5px dotted var(--ink-4);margin-top:6px}
  .pn{font-family:ui-monospace,Menlo,monospace;font-size:11px;color:var(--ink-3)}
  .goto{font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.14em;
    text-transform:uppercase;color:var(--ink-4);opacity:0;transition:opacity .12s ease}
  .phead:hover .goto,.phead:focus-visible .goto{opacity:1;color:var(--orange)}

  /* project sub-heading inside an app */
  .sub{
    display:flex;align-items:baseline;gap:10px;margin:14px 0 9px 22px;cursor:pointer;
    font-size:17px;color:var(--ink-2);
  }
  .sub:hover{color:var(--ink)}
  .sub:focus-visible{outline:2.5px solid var(--hi);outline-offset:3px;border-radius:8px}
  .sub .arrow{color:var(--pine-c);font-size:13px}
  .sub .n{font-family:ui-monospace,Menlo,monospace;font-size:10px;color:var(--ink-4);margin-left:auto}
  .sub.loose{color:var(--ink-3);font-style:italic}
  .cards.nested{margin-left:22px}

  /* ── the app / project page ─────────────────────────────────────────── */
  .back{
    display:inline-flex;align-items:center;gap:8px;margin-bottom:18px;cursor:pointer;
    font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.18em;
    text-transform:uppercase;color:var(--ink-3);background:none;border:0;padding:4px 2px;
  }
  .back:hover{color:var(--ink)}
  .back .arr{font-size:17px;letter-spacing:0}
  .slab{padding:22px 26px 24px;display:flex;gap:20px;align-items:flex-start;transform:rotate(-.3deg)}
  .bigsig{
    width:66px;height:66px;flex:none;display:grid;place-items:center;
    font-family:ui-monospace,Menlo,monospace;font-size:19px;font-weight:700;
    border:2.5px solid var(--pine-a);color:var(--pine-a);background:var(--paper-2);
    border-radius:18px 22px 15px 20px/20px 15px 22px 18px;transform:rotate(-2.5deg);
  }
  .slab .who{flex:1;min-width:0}
  .slab h1{font-size:32px;font-weight:400;margin:0 0 4px;line-height:1.15;text-wrap:balance}
  .slab .path{font-family:ui-monospace,Menlo,monospace;font-size:11px;color:var(--ink-3);word-break:break-all}
  .slab .path b{color:var(--pine-b);font-weight:400;cursor:pointer}
  .tally{display:flex;gap:20px;flex-wrap:wrap;margin-top:12px}
  .tally div{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;letter-spacing:.14em;
    text-transform:uppercase;color:var(--ink-3)}
  .tally b{font-family:"Chalkboard SE",cursive;font-size:21px;letter-spacing:0;color:var(--ink);
    display:block;margin-bottom:-2px}
  .tally .warm b{color:var(--orange)}

  .tabs{display:flex;gap:8px;align-items:flex-end;margin-bottom:-2.5px;position:relative;z-index:2}
  .tab{
    font:inherit;font-size:15px;cursor:pointer;color:var(--ink-3);padding:7px 18px 9px;
    border:2.5px solid var(--ink-4);border-bottom:none;background:transparent;
    border-radius:13px 15px 0 0/13px 15px 0 0;
  }
  .tab.on{color:var(--ink);border-color:var(--ink);background:var(--paper-2)}
  .tab .absent{color:var(--ink-4);font-size:12px}
  .reload{margin-left:auto;align-self:center;font-size:16px;color:var(--ink-3);cursor:pointer;
    background:none;border:0;padding:4px 8px}
  .reload:hover{color:var(--ink)}
  /* ── rendered markdown, once ─────────────────────────────────────────
     Every surface that shows lib/md.ts output wears .md: the doc tabs on an
     app page, the doc viewer in the overlay, and now the three descriptions.
     There used to be two near-copies of this block and they had already
     drifted — the doc pane never got the .tablewrap rule, so a wide table in
     PROJECT.md scrolled the whole page sideways. A third copy for
     descriptions is how that keeps happening. Containers keep their own
     chrome below; this owns the typography and nothing else. */
  .md h1,.md h2,.md h3,.md h4,.md h5,.md h6{font-size:18px;margin:14px 0 7px;color:var(--ink);line-height:1.3}
  .md > :first-child{margin-top:0}
  .md > :last-child{margin-bottom:0}
  .md p{margin:0 0 10px}
  .md pre{background:rgba(var(--sh),.09);padding:10px 12px;border-radius:8px;overflow-x:auto;
    font-size:12.5px;margin:0 0 10px}
  .md code{font-family:ui-monospace,Menlo,monospace;font-size:.85em}
  .md .tablewrap{overflow-x:auto;margin:10px 0}
  .md table{border-collapse:collapse;margin:0;font-size:14px}
  .md th,.md td{border:1.5px solid var(--ink-4);padding:5px 9px;text-align:left}
  .md blockquote{border-left:3px solid var(--ink-4);margin:10px 0;padding:2px 14px;color:var(--ink-3)}
  .md ul,.md ol{padding-left:22px;margin:0 0 10px}
  .md li{margin:2px 0}
  .md hr{border:0;border-top:1.5px dashed var(--ink-4);margin:14px 0}
  .md a{color:var(--pine-b)}
  .md strong{color:var(--ink)}
  .docpane{
    border:2.5px solid var(--ink);background:var(--paper-2);border-radius:0 14px 16px 14px;
    padding:18px 22px;box-shadow:2px 3px 0 rgba(var(--sh),.3);
    max-height:420px;overflow:auto;font-size:15px;line-height:1.62;color:var(--ink-2);
  }
  .nothing{padding:34px 24px;text-align:center;color:var(--ink-3);font-size:18px}
  .nothing .cmd{display:inline-block;margin-top:10px;font-family:ui-monospace,Menlo,monospace;
    font-size:12.5px;color:var(--ink);background:rgba(var(--sh),.09);padding:7px 11px;border-radius:8px}

  .plist{display:grid;gap:10px}
  .prow{display:flex;align-items:center;gap:14px;padding:13px 17px;cursor:pointer;
    transition:transform .12s ease,box-shadow .12s ease}
  .prow:hover{transform:translate(-1px,-1px);box-shadow:3px 4px 0 rgba(var(--sh),.4)}
  .prow .nm{font-size:18px}
  .prow .meta{margin-left:auto;font-family:ui-monospace,Menlo,monospace;font-size:10.5px;
    letter-spacing:.13em;text-transform:uppercase;color:var(--ink-3)}
  .prow .dot{width:9px;height:9px;border-radius:50%;background:var(--pine-c);flex:none}
  .prow .dot.hot{background:var(--orange)}
  .histline{
    margin-top:14px;font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.14em;
    text-transform:uppercase;color:var(--ink-4);border-top:2px dashed var(--ink-4);padding-top:12px;
  }
  .histline b{color:var(--ink-3);font-weight:400}

  .cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:14px}
  .card{
    padding:15px 17px 14px;position:relative;display:flex;flex-direction:column;min-height:112px;
    cursor:pointer;transition:transform .12s ease,box-shadow .12s ease;
    animation:drop .4s cubic-bezier(.2,.9,.3,1.25) backwards;
  }
  @keyframes drop{from{opacity:0;transform:translateY(10px) rotate(-.6deg)}}
  .card:hover{transform:translate(-1px,-2px) rotate(-.4deg);box-shadow:4px 6px 0 rgba(var(--sh),.4)}
  .card.sel{outline:2.5px solid var(--hi);outline-offset:3px;box-shadow:0 0 22px -6px rgba(var(--hi-rgb),.55)}
  .card .t{font-size:19px;line-height:1.34;margin-bottom:10px;text-wrap:balance}
  .card .foot{display:flex;align-items:center;gap:9px;margin-top:auto}
  .card .id{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;color:var(--ink-3)}
  .card .ago{font-family:ui-monospace,Menlo,monospace;font-size:10px;color:var(--ink-4);margin-left:auto}
  .card.live .ago{color:var(--orange)}
  .card .st{
    font-family:ui-monospace,Menlo,monospace;font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;
    padding:3px 9px 4px;border:2px solid var(--ink-3);color:var(--ink-2);
    border-radius:9px 12px 8px 11px/11px 8px 12px 9px;
  }
  .card.live{background:var(--live-bg)}
  .card.live .st{border-color:var(--orange);color:var(--orange)}
  .card.live::after{
    content:"";position:absolute;top:-7px;right:-7px;width:15px;height:15px;border-radius:50%;
    background:var(--orange);box-shadow:0 0 0 3px var(--paper);animation:blip 2.2s ease-in-out infinite;
  }
  @keyframes blip{0%,100%{opacity:1}50%{opacity:.35}}
  .card.rdy .st{border-color:var(--pine-b);color:var(--pine-a)}
  .card.idea{background:transparent;border-style:dashed;border-color:var(--ink-4);box-shadow:none}
  .card.idea .t{color:var(--ink-3)}
  .card.idea .st{border-color:var(--ink-4);color:var(--ink-3)}
  .card.done{background:transparent;border-color:var(--ink-4);box-shadow:none}
  .card.done .t{color:var(--ink-4);text-decoration:line-through;text-decoration-thickness:2px}
  .card.done .st{border-color:var(--ink-4);color:var(--ink-4)}
  .card.done .tick{position:absolute;top:8px;right:12px;font-size:26px;color:var(--pine-c);transform:rotate(8deg)}
  .card.rev .st{border-color:var(--pine-c);color:var(--pine-b)}
  .card.rev::before{content:"⚑";position:absolute;top:6px;right:12px;color:var(--pine-c);font-size:16px}

  .keys{
    position:fixed;left:0;right:0;bottom:0;z-index:8;padding:14px 26px;
    display:flex;justify-content:center;gap:20px;flex-wrap:wrap;
    background:linear-gradient(180deg,transparent,var(--paper) 44%);
    font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.12em;
    text-transform:uppercase;color:var(--ink-3)}
  .k{
    display:inline-block;min-width:22px;text-align:center;padding:3px 7px 4px;margin-right:7px;
    border:2px solid var(--ink-2);color:var(--ink);background:var(--paper-2);
    border-radius:8px 11px 7px 10px/10px 7px 11px 8px;
    transition:transform .08s ease,box-shadow .08s ease;box-shadow:0 2px 0 rgba(var(--sh),.45);
  }
  .k.hit{transform:translateY(2px);box-shadow:0 0 0 rgba(var(--sh),.45)}

  /* overlays */
  .veil{position:fixed;inset:0;z-index:20;background:var(--veil);display:none;align-items:flex-start;justify-content:center;padding:9vh 20px 20px}
  .veil.on{display:flex}
  .panel{width:min(760px,94vw);max-height:80vh;overflow:auto;padding:0;animation:pop .22s cubic-bezier(.2,.9,.3,1.3)}
  /* The ticket overlay alone is a reading-and-writing surface: a rendered body
     with headings and tables, and an editor over the top of it. It gets more
     room than the palette or the help sheet, which are lists. (A real ticket
     PAGE is the better answer and is its own ticket; this is the cheap half.) */
  #detv{padding-top:6vh}
  #detv .panel{width:min(1000px,94vw);max-height:86vh}
  @keyframes pop{from{opacity:0;transform:scale(.96) translateY(8px)}}
  .pal .q{padding:16px 20px;font-size:21px;border-bottom:2.5px dashed var(--ink-4);display:flex;gap:8px}
  .pal .q input{
    flex:1;border:0;outline:0;background:transparent;font:inherit;color:var(--ink);
  }
  .pal .o{display:flex;align-items:center;gap:12px;padding:11px 20px;font-size:17px;color:var(--ink-2);cursor:pointer}
  .pal .o.on{background:rgba(var(--hi-rgb),.18);color:var(--ink);box-shadow:inset 3px 0 0 var(--hi)}
  .pal .o .r{margin-left:auto;font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.12em;color:var(--ink-3)}

  .detail{padding:24px 26px 26px}
  .detail h2{font-size:26px;font-weight:400;margin:0 0 8px;text-wrap:balance}
  /* ── the ticket's fields, as a pre-printed form ──────────────────────
     These used to be one dot-separated sentence, which is dense at five
     fields and has nowhere to put a sixth. A hand-drawn planning board is
     full of ruled job cards, so: label, rule, value. Rows are emitted even
     when empty so the block does not reflow between tickets, and #11 and #12
     can each add one without touching anything else. */
  .detail .eyebrow{font-family:ui-monospace,Menlo,monospace;font-size:11px;
    letter-spacing:.22em;color:var(--ink-3);margin-bottom:2px}
  .fields{display:grid;grid-template-columns:max-content 1fr;gap:0 16px;margin:0 0 20px}
  .fields dt{font-family:ui-monospace,Menlo,monospace;font-size:9.5px;letter-spacing:.16em;
    text-transform:uppercase;color:var(--ink-3);align-self:center;
    padding:6px 0 5px;border-bottom:1px dotted var(--ink-4)}
  .fields dd{margin:0;font-size:15px;color:var(--ink);line-height:1.35;align-self:center;
    overflow-wrap:anywhere;padding:6px 0 5px;border-bottom:1px dotted var(--ink-4)}
  .fields dd.empty{color:var(--ink-3);font-style:italic}
  .fields dd.wire{font-family:ui-monospace,Menlo,monospace;font-size:12.5px;color:var(--ink-2)}
  .fields .jump{color:var(--pine-b);cursor:pointer;border-bottom:1.5px dotted var(--pine-b)}
  .fields .jump:hover{color:var(--ink)}
  /* Status is a rubber stamp on the card rather than a bold word mid-run. */
  .stamp{display:inline-block;font-family:ui-monospace,Menlo,monospace;font-size:9.5px;
    letter-spacing:.14em;text-transform:uppercase;color:var(--orange);
    border:2px solid var(--orange);padding:2px 9px 3px;
    border-radius:9px 13px 8px 12px/12px 8px 13px 9px;transform:rotate(-1.2deg)}
  .refile{display:flex;align-items:center;gap:10px;margin-bottom:18px;
    font-family:ui-monospace,Menlo,monospace;font-size:10.5px;letter-spacing:.15em;
    text-transform:uppercase;color:var(--ink-3)}
  .refile select{
    font:inherit;font-family:"Chalkboard SE",cursive;font-size:15px;text-transform:none;
    letter-spacing:0;color:var(--ink);background:var(--paper-2);cursor:pointer;
    border:2.5px solid var(--ink-4);border-radius:11px 14px 10px 13px/13px 10px 14px 11px;
    padding:5px 10px 6px;
  }
  .refile select:hover{border-color:var(--ink)}
  /* ── a description: one surface, three states ────────────────────────
     .raw is the source with its line breaks honoured — what you see before
     the render lands, and what you keep if it never does. .md is the
     rendered form. Editing swaps the whole box for the textarea below.
     All three descriptions (ticket, app, project) wear this. */
  .desc{font-size:17px;color:var(--ink-2);margin-bottom:18px;cursor:text;position:relative;
    border-radius:10px;padding:6px 8px;margin-left:-8px;transition:background .12s ease;outline:none}
  .desc:hover,.desc:focus-visible{background:rgba(var(--hi-rgb),.10)}
  .desc:focus-visible{box-shadow:0 0 0 2.5px var(--hi)}
  .desc.raw{white-space:pre-wrap}
  .desc .ghost{color:var(--ink-4);font-style:italic}
  /* Once the body is real markup, "click me" needs saying out loud — a wash
     alone reads as decoration next to a table. */
  .desc:hover::after,.desc:focus-visible::after{
    content:"e";position:absolute;top:4px;right:6px;
    font-family:ui-monospace,Menlo,monospace;font-size:9px;letter-spacing:.14em;
    text-transform:uppercase;color:var(--ink-3)}
  .desc a{cursor:pointer}
  .descedit{
    display:none;width:100%;min-height:160px;font:inherit;font-size:17px;color:var(--ink);
    background:var(--paper);border:2.5px dashed var(--ink-4);border-radius:12px;
    padding:12px 14px;margin-bottom:18px;resize:vertical;outline:none;
  }
  .descedit.on{display:block}
  .descedit:focus{border-color:var(--hi)}
  .btn.danger{border-color:var(--orange);color:var(--orange)}
  .detail .acts{display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap}
  .btn{
    font:inherit;font-size:16px;cursor:pointer;color:var(--ink);
    padding:7px 16px 8px;border:2.5px solid var(--ink);background:var(--paper-2);
    border-radius:12px 16px 11px 15px/15px 11px 16px 12px;
    box-shadow:2px 3px 0 rgba(var(--sh),.32);transition:transform .1s ease,box-shadow .1s ease;
  }
  .btn:hover{transform:translate(-1px,-1px);box-shadow:3px 4px 0 rgba(var(--sh),.4)}
  .btn:active{transform:translate(1px,2px);box-shadow:0 0 0 rgba(var(--sh),.32)}
  .btn.go{background:rgba(var(--hi-rgb),.2);border-color:var(--hi)}
  .trail{display:grid;gap:7px;margin-bottom:14px}
  .trail .doc{display:flex;gap:12px;align-items:baseline;font-family:ui-monospace,Menlo,monospace;font-size:11px;color:var(--ink-2);cursor:pointer}
  .trail .doc:hover{color:var(--ink)}
  .tag{color:var(--pine-a);font-size:9.5px;letter-spacing:.15em;text-transform:uppercase;min-width:50px}
  .docview{
    border:2.5px dashed var(--ink-4);border-radius:14px;padding:18px 20px;background:var(--paper);
    font-size:15px;line-height:1.6;color:var(--ink-2);display:none;
  }
  .docview.on{display:block}
  .docview h1,.docview h2,.docview h3,.docview h4{font-size:19px}

  /* Where the time went. Pine ink is the agent's time; highlighter wash is
     yours — the same two meanings the board already gives those colours. */
  .runs{display:grid;gap:12px;margin-bottom:16px}
  .run{border:2.5px dashed var(--ink-4);border-radius:14px 11px 15px 12px/12px 15px 11px 14px;padding:12px 15px 13px}
  .run .rh{display:flex;align-items:baseline;gap:9px;flex-wrap:wrap;
    font-family:ui-monospace,Menlo,monospace;font-size:10.5px;letter-spacing:.13em;
    text-transform:uppercase;color:var(--ink-3);margin-bottom:9px}
  .run .rh .tot{color:var(--ink);letter-spacing:.06em;font-size:12px}
  .run .rh .part{color:var(--ink-2);letter-spacing:.06em}
  .run .rh .you{color:var(--hi-text)}
  .run .rh .uid{color:var(--ink-4)}
  .bar{display:flex;height:13px;border:2px solid var(--ink-2);border-radius:7px;overflow:hidden;margin-bottom:10px;background:var(--paper)}
  .bar i{display:block;height:100%;border-right:1.5px solid var(--paper)}
  .bar i:last-child{border-right:0}
  .bar i.a{background:var(--pine-c)}
  .bar i.y{background:rgba(var(--hi-rgb),.9)}
  .phz{display:grid;gap:3px}
  .phz .p{display:flex;align-items:baseline;gap:10px;font-family:ui-monospace,Menlo,monospace;font-size:11.5px;color:var(--ink-2)}
  .phz .p .nm{min-width:88px;color:var(--ink-3)}
  .phz .p .d{color:var(--ink)}
  .phz .p .yw{color:var(--hi-text)}
  .phz .p .sw{flex:1;height:5px;border-radius:3px;background:rgba(var(--sh),.10);overflow:hidden;display:flex;max-width:180px}
  .phz .p .sw i{display:block;height:100%}
  .phz .p .sw i.a{background:var(--pine-c)}
  .phz .p .sw i.y{background:rgba(var(--hi-rgb),.9)}

  /* pace: medians across runs */
  .pace{padding:22px 26px 26px}
  .pace h2{font-size:26px;font-weight:400;margin:0 0 6px}
  .pace .m{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;letter-spacing:.15em;
    text-transform:uppercase;color:var(--ink-3);margin-bottom:18px}
  .pace .grp{margin-bottom:20px}
  .pace .grp > .lbl{font-family:ui-monospace,Menlo,monospace;font-size:9.5px;letter-spacing:.16em;
    text-transform:uppercase;color:var(--ink-3);margin-bottom:8px}
  .pace .row{display:flex;align-items:baseline;gap:10px;padding:4px 0;
    font-family:ui-monospace,Menlo,monospace;font-size:12.5px;color:var(--ink-2);
    border-bottom:1.5px dotted var(--ink-4)}
  .pace .row:last-child{border-bottom:0}
  .pace .row .nm{min-width:104px;color:var(--ink)}
  .pace .row .n{color:var(--ink-4);font-size:10.5px}
  .pace .row .sw{flex:1;height:7px;border-radius:4px;background:rgba(var(--sh),.10);overflow:hidden;display:flex;min-width:60px}
  .pace .row .sw i{display:block;height:100%}
  .pace .row .sw i.a{background:var(--pine-c)}
  .pace .row .sw i.y{background:rgba(var(--hi-rgb),.9)}
  .pace .row .d{min-width:64px;text-align:right;color:var(--ink)}
  .pace .legend{font-size:13px;color:var(--ink-3);display:flex;gap:16px;align-items:center}
  .pace .legend b{font-weight:400;color:var(--ink-2)}
  .pace .legend s{display:inline-block;width:13px;height:9px;border-radius:3px;margin-right:5px;text-decoration:none;vertical-align:middle}
  .pace .legend s.a{background:var(--pine-c)}
  .pace .legend s.y{background:rgba(var(--hi-rgb),.9)}

  .attach{
    border:2.5px solid var(--pine-b);border-radius:12px;background:var(--attach-bg);
    padding:12px 16px;margin-top:14px;display:none;
  }
  .attach.on{display:block}
  .attach .how{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:var(--ink);background:rgba(var(--sh),.09);padding:8px 10px;border-radius:8px;margin-top:8px;user-select:all;word-break:break-all}
  .attach .note{font-size:15px;color:var(--ink-2)}

  .toast{
    position:fixed;left:50%;bottom:74px;transform:translateX(-50%) translateY(20px);
    z-index:30;padding:10px 20px 11px;font-size:16px;opacity:0;pointer-events:none;
    transition:opacity .18s ease,transform .18s cubic-bezier(.2,.9,.3,1.3);
  }
  .toast.on{opacity:1;transform:translateX(-50%) translateY(0)}

  .helpgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px;padding:22px 26px 26px}
  .helpgrid div{font-size:16px;color:var(--ink-2)}

  .void{padding:60px 20px;text-align:center;font-size:22px;color:var(--ink-3)}
  .void .big{font-size:34px;color:var(--ink-2);margin-bottom:10px}

  @media (prefers-reduced-motion:reduce){
    .card,.panel,.lab{animation:none !important}
    .card.live::after{animation:none}
  }
</style>
</head>
<body>
<div class="sheet">
  <div class="top">
    <div class="mark">smriti <span>factory</span></div>
    <div class="eye" id="eye"></div>
  </div>
  <div id="waitwrap"></div>
  <svg class="trees" viewBox="0 0 1080 96" preserveAspectRatio="none" aria-hidden="true">
    <g stroke="var(--tree)" stroke-width="2.5" fill="none" stroke-linejoin="round" stroke-linecap="round">
      <path d="M20,92 L20,74 M8,74 L20,52 L32,74 Z M4,60 L20,32 L36,60 Z M8,44 L20,20 L32,44 Z"/>
      <path d="M150,92 L150,72 M136,72 L150,46 L164,72 Z M132,56 L150,26 L168,56 Z M136,40 L150,14 L164,40 Z"/>
      <path d="M300,92 L300,74 M287,74 L300,50 L313,74 Z M283,58 L300,28 L317,58 Z"/>
      <path d="M448,92 L448,72 M433,72 L448,44 L463,72 Z M429,56 L448,22 L467,56 Z M433,40 L448,12 L463,40 Z"/>
      <path d="M604,92 L604,74 M591,74 L604,50 L617,74 Z M587,58 L604,26 L621,58 Z"/>
      <path d="M752,92 L752,72 M737,72 L752,44 L767,72 Z M733,56 L752,20 L771,56 Z M737,40 L752,10 L767,40 Z"/>
      <path d="M906,92 L906,74 M893,74 L906,50 L919,74 Z M889,58 L906,26 L923,58 Z"/>
      <path d="M1046,92 L1046,72 M1031,72 L1046,44 L1061,72 Z M1027,56 L1046,22 L1065,56 Z M1031,40 L1046,12 L1061,40 Z"/>
      <path d="M0,93 Q160,89 300,93 T620,92 T940,93 T1080,91" stroke-width="3"/>
    </g>
  </svg>
  <div id="plots"></div>
</div>

<div class="keys" id="keys">
  <span><span class="k" data-k="nav">↑↓</span>move</span>
  <span><span class="k" data-k="Enter">⏎</span>open</span>
  <span><span class="k" data-k="s">S</span>start</span>
  <span><span class="k" data-k="e">E</span>edit</span>
  <span><span class="k" data-k="c">C</span>capture</span>
  <span><span class="k" data-k="p">P</span>project</span>
  <span><span class="k" data-k="d">D</span>done</span>
  <span><span class="k" data-k="k">⌘K</span>anything</span>
  <span><span class="k" data-k="m">M</span>pace</span>
  <span><span class="k" data-k="t">T</span>theme</span>
  <span><span class="k" data-k="?">?</span>keys</span>
</div>

<div class="veil" id="palv"><div class="box b4 panel pal">
  <div class="q"><input id="palq" placeholder="type a ticket title, or search…" autocomplete="off"></div>
  <div id="palopts"></div>
</div></div>

<div class="veil" id="detv"><div class="box b2 panel"><div class="detail" id="detbody"></div></div></div>

<div class="veil" id="pacev"><div class="box b4 panel"><div class="pace" id="pacebody"></div></div></div>

<div class="veil" id="helpv"><div class="box b3 panel">
  <div class="detail"><h2>keys</h2></div>
  <div class="helpgrid">
    <div><b>↑↓ / jk</b> — move</div><div><b>⏎</b> — open ticket</div>
    <div><b>s</b> — start work</div><div><b>c</b> — capture (into what you're on)</div>
    <div><b>e</b> — edit the description</div><div><b>⌘⏎</b> — save it, <b>esc</b> — abandon</div>
    <div><b>d</b> — mark done</div><div><b>⌘K / /</b> — palette, apps & projects too</div>
    <div><b>p</b> — open its project / app</div><div><b>m</b> — pace (medians)</div>
    <div><b>esc</b> — close, then back up a level</div>
    <div><b>t</b> — light / dark</div><div><b>?</b> — this</div>
  </div>
</div></div>

<div class="box toast" id="toast"></div>

<script>
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  let S = { tickets: [], runs: [], documents: [], repositories: [], projects: [], sessions: [] };
  let sel = -1;            // index into flat selectable list
  let flat = [];           // [{id, kind}] in DOM order
  let detailId = null;
  // The current view, derived from location.hash by route(). Selection is
  // OWNED by the view: flat/sel are rebuilt from whatever the current view
  // drew, so s/d/⏎ can never act on a row belonging to a page you left.
  let view = { kind: 'board' };
  let lastViewKey = '';
  // Which doc tab an app page is showing, remembered across live re-renders so
  // an SSE refresh does not snap you back to PROJECT.md mid-read.
  let docTab = 'PROJECT';
  const docCache = new Map();   // slug|NAME -> html

  // Theme: follow the OS until told otherwise, then remember.
  const savedTheme = localStorage.getItem('smriti-theme');
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;
  function toggleTheme(){
    const dark = getComputedStyle(document.documentElement).getPropertyValue('--sh').trim() === '0,0,0';
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('smriti-theme', next);
    tapKey('t'); toast(next === 'dark' ? 'chalk on slate' : 'marker on paper', 1400);
  }

  const STATUS = { idea:'idea', ready:'ready', in_progress:'building', in_review:'in review', shipped:'shipped', cancelled:'cancelled' };
  const CLS = { idea:'idea b3', ready:'rdy b2', in_progress:'live', in_review:'rev b4', shipped:'done b3', cancelled:'done b2' };
  // cancelled sits with shipped at the bottom. Omitting it made indexOf return
  // -1, which sorted abandoned work ABOVE everything — the opposite of what
  // "park it out of the way" promises.
  const ORDER = ['in_review','in_progress','ready','idea','shipped','cancelled'];
  const HUES = ['#2E5C43','#3F7355','#E2703A','#58906B','#8A6FB5','#4C7FA8'];

  // ── time ─────────────────────────────────────────────────────────────
  // Durations arrive precomputed from smriti-trace (which owns the SQL); the
  // page only formats them. The one thing computed here is elapsed for a run
  // still going, because that has to keep moving between refreshes.
  function fmtDur(s){
    s = Math.max(0, Math.round(Number(s) || 0));
    if (s < 60) return s + 's';
    if (s < 600){ const m = Math.floor(s/60), r = s%60; return r ? m + 'm ' + r + 's' : m + 'm'; }
    if (s < 3600) return Math.floor(s/60) + 'm';
    const h = Math.floor(s/3600), m = Math.floor((s%3600)/60);
    return m ? h + 'h ' + m + 'm' : h + 'h';
  }
  function fmtAgo(iso){
    const ms = Date.parse(iso);
    if (!ms) return '';
    const s = Math.round((Date.now() - ms) / 1000);
    if (s < 45) return 'just now';
    if (s < 3600) return Math.round(s/60) + 'm ago';
    if (s < 86400) return Math.round(s/3600) + 'h ago';
    return Math.round(s/86400) + 'd ago';
  }
  function sinceSecs(iso){
    const ms = Date.parse(iso);
    return ms ? Math.max(0, Math.round((Date.now() - ms) / 1000)) : 0;
  }
  // A run's duration as of RIGHT NOW. Finished runs are fixed and come straight
  // from the trace; an open one is measured from its start, so the number on
  // screen keeps up with the clock instead of freezing at the last poll.
  function runSecs(r){
    return r.ended_at ? (r.duration_s || 0) : sinceSecs(r.started_at);
  }

  function runFor(t){ return S.runs.find((r) => r.ticket_id === t.id); }
  // The live agent for a ticket, if herdr has one. 'blocked' means the session
  // is sitting at a prompt waiting for you — a permission request, a question,
  // a gate. Nothing else in smriti can see that.
  // Matched on the worktree path, not the name: herdr forgets the name it was
  // given, and a name-only match made live sessions disappear from the board.
  function sessionFor(t){
    return (S.sessions || []).find((x) =>
      (t.worktree_path && x.cwd === t.worktree_path) || (x.name && x.name === 't' + t.id));
  }
  function docsFor(t){ return S.documents.filter((d) => d.ticket_id === t.id); }

  // ── the model ────────────────────────────────────────────────────────
  // A ticket belongs to an app, or to nothing. NO_APP is the bucket for the
  // second case — a label, never a slug, so it cannot collide with a real app.
  const NO_APP = '(ideas)';
  const appOf = (t) => t.repo_slug || NO_APP;
  const projectById = (id) => (S.projects || []).find((p) => Number(p.id) === Number(id));
  const repoBySlug = (s) => (S.repositories || []).find((r) => r.slug === s);
  const projectsIn = (slug) => (S.projects || []).filter((p) => (p.repo_slug || NO_APP) === slug);
  const ticketsIn = (slug) => S.tickets.filter((t) => appOf(t) === slug);
  const ticketsOf = (pid) => S.tickets.filter((t) => Number(t.project_id) === Number(pid));
  const isOpen = (t) => t.status !== 'shipped' && t.status !== 'cancelled';
  const appLabel = (slug) => (slug === NO_APP ? 'ideas' : slug.replace(/^itsroze-/, ''));

  // Stable per-app colour, by position in the sorted app list — so an app keeps
  // its colour on the board and on its own page.
  function hueFor(slug){
    const apps = [...new Set(S.tickets.map(appOf).concat((S.projects||[]).map((p) => p.repo_slug || NO_APP)))]
      .filter((a) => a !== NO_APP).sort();
    const i = apps.indexOf(slug);
    return i < 0 ? 'var(--ink-3)' : HUES[i % HUES.length];
  }
  function sigFor(slug){
    return slug === NO_APP ? '◌◌' : appLabel(slug).slice(0, 2).toUpperCase();
  }

  const byStatus = (a, b) => {
    const s = ORDER.indexOf(a.status) - ORDER.indexOf(b.status);
    if (s) return s;
    if (a.priority !== b.priority) return b.priority - a.priority;
    return a.id - b.id;
  };

  function toast(msg, ms=2600){
    const el = $('#toast'); el.innerHTML = msg; el.classList.add('on');
    clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), ms);
  }
  function tapKey(k){
    const el = document.querySelector('.k[data-k="'+k+'"]');
    if (el){ el.classList.add('hit'); setTimeout(() => el.classList.remove('hit'), 130); }
  }

  // One ticket card. Shared by the board and both pages so a card can never
  // look like two different things depending on where you found it.
  let cardIdx = 0;
  function cardHtml(t){
    const run = runFor(t);
    const stateCls = run && run.status === 'running' ? 'live' : (CLS[t.status] || '');
    const sess = sessionFor(t);
    const st = sess && sess.status === 'blocked' ? 'asking you'
      : sess && sess.status === 'working' ? 'working'
      : run && run.status === 'running' ? esc((run.last_phase || 'working') + ' · running')
      : esc(STATUS[t.status] || t.status);
    // Running work shows elapsed, ticking; everything else shows when it last
    // moved. A card that says nothing about time is the thing this whole
    // ticket is about.
    const ago = run && !run.ended_at
      ? '<span class="ago" data-live="run" data-since="' + esc(run.started_at) + '">⏱ ' +
        fmtDur(runSecs(run)) + '</span>'
      : (() => {
          const at = (run && run.ended_at) || t.updated_at;
          const rel = at ? fmtAgo(at) : '';
          return rel ? '<span class="ago" data-live="ago" data-since="' + esc(at) + '">' + rel + '</span>' : '';
        })();
    return '<div class="box card ' + stateCls + '" data-tid="' + t.id + '" style="animation-delay:' + (cardIdx++ * 45) + 'ms">' +
      (t.status === 'shipped' ? '<span class="tick">✓</span>' : '') +
      '<div class="t">' + esc(t.title) + '</div>' +
      '<div class="foot"><span class="id">#' + t.id + '</span><span class="st">' + st + '</span>' + ago + '</div></div>';
  }

  function tallyHtml(list){
    const open = list.filter(isOpen).length;
    const building = list.filter((t) => t.status === 'in_progress').length;
    return '<div><b>' + list.length + '</b> tickets</div>' +
      '<div><b>' + open + '</b> open</div>' +
      (building ? '<div class="warm"><b>' + building + '</b> building</div>' : '');
  }

  function trailHtml(docs){
    if (!docs.length) return '';
    return '<div class="lab">paper trail</div><div class="trail">' + docs.map((d) =>
      '<div class="doc" data-doc="' + d.id + '"><span class="tag">' + esc(d.type) + '</span>' +
      '<span>' + esc(d.path.split('/').pop()) + '</span></div>'
    ).join('') + '</div><div class="docview md" id="pagedoc"></div>';
  }

  function historyHtml(list){
    const shipped = list.filter((t) => t.status === 'shipped').length;
    const cancelled = list.filter((t) => t.status === 'cancelled').length;
    if (!shipped && !cancelled) return '';
    return '<div class="histline">' +
      (shipped ? 'shipped <b>' + shipped + '</b>' : '') +
      (shipped && cancelled ? ' · ' : '') +
      (cancelled ? 'cancelled <b>' + cancelled + '</b>' : '') + '</div>';
  }

  // ── the board ────────────────────────────────────────────────────────
  function renderBoard(){
    const open = S.tickets.filter(isOpen);
    const waiting = S.runs.filter((r) => r.status === 'awaiting');
    // A session stalled at a prompt belongs in "waiting on you" just as much as
    // a /begin gate does — it is the same fact, reported by herdr instead.
    const blocked = S.tickets.filter((t) => (sessionFor(t) || {}).status === 'blocked');
    const running = S.runs.filter((r) => r.status === 'running');
    const day = new Date().toLocaleDateString(undefined,{weekday:'long'});
    $('#eye').innerHTML = esc(day) + ' · <b>' + open.length + '</b> open' +
      (running.length ? ' · <b>' + running.length + '</b> running' : '') +
      ((waiting.length + blocked.length) ? ' · <b>' + (waiting.length + blocked.length) + '</b> waiting' : '');

    // waiting band
    let w = '<div class="lab">waiting on you</div><div class="box wait">';
    for (const t of blocked){
      w += '<div class="item" data-tid="' + t.id + '">' +
        '<div><span class="h">' + esc(t.title) + '</span></div>' +
        '<div class="sub2">' + esc(appLabel(appOf(t))) + ' · #' + t.id +
        ' · <b>session is asking for something</b></div></div>';
    }
    if (!waiting.length && !blocked.length){
      w += '<div class="empty">nothing needs you — the forest is quiet ✌︎</div>';
    } else if (waiting.length) {
      for (const r of waiting){
        const t = S.tickets.find((x) => x.id === r.ticket_id);
        const title = t ? t.title : (r.skill + ' on ' + (r.branch || '?'));
        // How long this gate has been sitting on you — the number the whole
        // agent-time/your-time split exists to make visible, put where you
        // already look. Ticks with the clock rather than with the poll.
        const held = r.last_event_at
          ? ' · <span data-live="wait" data-since="' + esc(r.last_event_at) + '">' +
            fmtDur(sinceSecs(r.last_event_at)) + '</span>'
          : '';
        w += '<div class="item" data-tid="' + (t ? t.id : '') + '">' +
          '<div><span class="h">' + esc(title) + '</span></div>' +
          '<div class="sub2">' + esc(appLabel(r.repo_slug || NO_APP)) + (t ? ' · #' + t.id : '') +
          ' · <b>' + esc(r.last_phase || 'gate') + ' — needs a decision</b>' + held + '</div></div>';
      }
    }
    w += '</div>';
    $('#waitwrap').innerHTML = w;

    flat = [];
    for (const t of blocked) flat.push({ id: t.id, kind: 'wait' });
    for (const r of waiting) if (r.ticket_id) flat.push({ id: r.ticket_id, kind: 'wait' });

    let html = '';
    if (!S.tickets.length && !(S.projects || []).length){
      html = '<div class="void"><div class="big">a blank page</div>' +
        'press <b>c</b> to capture your first ticket — or <span class="mono">smriti ticket add "…"</span> from anywhere</div>';
    }

    // Every app that has anything to show, ideas last: they are the least
    // actionable thing on the page.
    const apps = [...new Set(
      S.tickets.map(appOf).concat((S.projects || []).map((p) => p.repo_slug || NO_APP)),
    )].sort((a, b) => (a === NO_APP ? 1 : b === NO_APP ? -1 : a.localeCompare(b)));

    cardIdx = 0;
    for (const app of apps){
      const items = ticketsIn(app)
        .filter((t) => t.status !== 'shipped' || recentlyShipped(t))
        .filter((t) => t.status !== 'cancelled')
        .sort(byStatus);
      const projs = projectsIn(app).filter((p) => p.status === 'active');
      if (!items.length && !projs.length) continue;

      const hue = hueFor(app);
      html += '<div class="plot"><div class="phead" role="button" tabindex="0" data-app="' + esc(app) + '">' +
        '<span class="sig' + (app === NO_APP ? ' ghost' : '') + '"' +
          (app === NO_APP ? '' : ' style="color:' + hue + ';border-color:' + hue + '"') + '>' +
          esc(sigFor(app)) + '</span>' +
        '<span class="pname">' + esc(appLabel(app)) + '</span>' +
        '<span class="pline"></span>' +
        '<span class="goto">' + (app === NO_APP ? 'no app yet' : 'app page →') + '</span>' +
        '<span class="pn">' + items.length + '</span></div>';

      // Grouped by project, in the order their most urgent ticket appears.
      const groups = new Map();
      const loose = [];
      for (const t of items){
        if (t.project_id == null) loose.push(t);
        else {
          if (!groups.has(t.project_id)) groups.set(t.project_id, []);
          groups.get(t.project_id).push(t);
        }
      }
      // An active project with no open tickets still deserves a line — it is
      // where you would go to add one.
      for (const p of projs) if (!groups.has(p.id)) groups.set(p.id, []);

      for (const [pid, group] of groups){
        const p = projectById(pid);
        html += '<div class="sub" role="button" tabindex="0" data-proj="' + pid + '">' +
          '<span class="arrow">▸</span> ' + esc(p ? p.name : 'project ' + pid) +
          '<span class="n">' + group.length + '</span></div>';
        if (group.length){
          html += '<div class="cards nested">';
          for (const t of group){ html += cardHtml(t); flat.push({ id: t.id, kind: 'card' }); }
          html += '</div>';
        }
      }
      if (loose.length){
        // A "loose" heading over the only group is noise.
        if (groups.size) html += '<div class="sub loose"><span class="arrow">▸</span> loose in this app' +
          '<span class="n">' + loose.length + '</span></div>';
        html += '<div class="cards' + (groups.size ? ' nested' : '') + '">';
        for (const t of loose){ html += cardHtml(t); flat.push({ id: t.id, kind: 'card' }); }
        html += '</div>';
      }
      html += '</div>';
    }
    $('#plots').innerHTML = html;
    wire();
  }

  // ── the app page ─────────────────────────────────────────────────────
  function renderApp(slug){
    const repo = repoBySlug(slug) || { slug, name: appLabel(slug), counts: {} };
    const items = ticketsIn(slug);
    const projs = projectsIn(slug).filter((p) => p.status === 'active');
    const docs = S.documents.filter((d) => d.repo_slug === slug);
    const hue = hueFor(slug);

    $('#eye').innerHTML = 'app · <b>' + esc(slug) + '</b>';
    $('#waitwrap').innerHTML = '';

    let h = '<button class="back" data-back><span class="arr">←</span> back to the board</button>';
    h += '<div class="box slab">' +
      '<div class="bigsig" style="color:' + hue + ';border-color:' + hue + '">' + esc(sigFor(slug)) + '</div>' +
      '<div class="who"><h1>' + esc(repo.name && repo.name !== slug ? repo.name : appLabel(slug)) + '</h1>' +
      '<div class="path">' + esc(slug) + (repo.repo_path ? ' · ' + esc(repo.repo_path) : ' · <i>no repo on this machine</i>') + '</div>' +
      '<div class="tally">' + tallyHtml(items) +
        (projs.length ? '<div><b>' + projs.length + '</b> projects</div>' : '') +
        (docs.length ? '<div><b>' + docs.length + '</b> documents</div>' : '') +
      '</div></div></div>';

    h += '<div class="lab">what this app is</div>' +
      descBox('id="pagedesc" data-edit="repo"', repo.description, 'what this app is, and why…') +
      '<textarea class="descedit" id="pagedescedit" placeholder="what this app is, and why">' + esc(repo.description || '') + '</textarea>';

    // The two repo-level documents. Rendered from disk, so all three states are
    // real: present, absent, and no repo to look in at all.
    h += '<div class="lab">the documents</div><div class="tabs">' +
      ['PROJECT','DESIGN'].map((k) => {
        const has = k === 'PROJECT' ? repo.project_md : repo.design_md;
        return '<button class="tab' + (docTab === k ? ' on' : '') + '" data-tab="' + k + '">' + k + '.md' +
          (repo.repo_path && !has ? ' <span class="absent">— none</span>' : '') + '</button>';
      }).join('') +
      '<button class="reload" data-reload title="re-read from disk">↻</button></div>' +
      '<div class="docpane md" id="docpane"></div>';

    if (projs.length){
      h += '<div class="lab">projects</div><div class="plist">' + projs.map((p) => {
        const pt = ticketsOf(p.id);
        const hot = pt.some((t) => t.status === 'in_progress');
        return '<div class="box prow" data-proj="' + p.id + '">' +
          '<span class="dot' + (hot ? ' hot' : '') + '"></span>' +
          '<span class="nm">' + esc(p.name) + '</span>' +
          '<span class="meta">' + pt.length + ' tickets' + (hot ? ' · building' : '') + '</span></div>';
      }).join('') + '</div>';
    }

    const loose = items.filter((t) => t.project_id == null && isOpen(t)).sort(byStatus);
    cardIdx = 0; flat = [];
    if (loose.length){
      h += '<div class="lab">' + (projs.length ? 'loose tickets' : 'tickets') + '</div><div class="cards">';
      for (const t of loose){ h += cardHtml(t); flat.push({ id: t.id, kind: 'card' }); }
      h += '</div>';
    }
    h += historyHtml(items);
    h += trailHtml(docs);

    $('#plots').innerHTML = h;
    wire();
    loadDoc(slug);
  }

  // ── the project page ─────────────────────────────────────────────────
  // Deliberately lighter than the app page: no doc tabs, because PROJECT.md and
  // DESIGN.md describe the codebase, not one body of work inside it.
  function renderProject(pid){
    const p = projectById(pid);
    if (!p){ location.hash = ''; return; }
    const items = ticketsOf(p.id);
    const docs = S.documents.filter((d) => Number(d.project_id) === Number(p.id));
    const app = p.repo_slug || NO_APP;

    $('#eye').innerHTML = 'project · <b>' + esc(p.name) + '</b>';
    $('#waitwrap').innerHTML = '';

    let h = '<button class="back" data-back>' +
      '<span class="arr">←</span> ' + (p.repo_slug ? esc(appLabel(app)) : 'the board') + '</button>';
    h += '<div class="box slab">' +
      '<div class="bigsig" style="color:' + hueFor(app) + ';border-color:' + hueFor(app) + '">' +
        esc(p.name.slice(0,2).toUpperCase()) + '</div>' +
      '<div class="who"><h1>' + esc(p.name) + '</h1>' +
      '<div class="path">' + (p.repo_slug
        ? 'in <b data-app="' + esc(p.repo_slug) + '">' + esc(appLabel(app)) + '</b>'
        : '<i>no app yet — an idea</i>') + '</div>' +
      '<div class="tally">' + tallyHtml(items) +
        (docs.length ? '<div><b>' + docs.length + '</b> documents</div>' : '') +
      '</div></div></div>';

    h += '<div class="lab">what this project is</div>' +
      descBox('id="pagedesc" data-edit="project" data-pid="' + p.id + '"', p.description, 'what this project is, and why…') +
      '<textarea class="descedit" id="pagedescedit" placeholder="what this project is, and why">' + esc(p.description || '') + '</textarea>';

    const open = items.filter(isOpen).sort(byStatus);
    cardIdx = 0; flat = [];
    h += '<div class="lab">tickets</div>';
    if (open.length){
      h += '<div class="cards">';
      for (const t of open){ h += cardHtml(t); flat.push({ id: t.id, kind: 'card' }); }
      h += '</div>';
    } else {
      h += '<div class="box docpane"><div class="nothing">nothing open here yet' +
        '<div class="cmd">press c to capture one into this project</div></div></div>';
    }
    h += historyHtml(items);
    h += trailHtml(docs);

    $('#plots').innerHTML = h;
    wire();
  }

  // ── doc tabs ─────────────────────────────────────────────────────────
  async function loadDoc(slug, force){
    const pane = $('#docpane'); if (!pane) return;
    const repo = repoBySlug(slug) || {};
    if (!repo.repo_path){
      pane.innerHTML = '<div class="nothing">this app has no repo on this machine' +
        '<div class="cmd">smriti repo current — from inside it, once</div></div>';
      return;
    }
    const has = docTab === 'PROJECT' ? repo.project_md : repo.design_md;
    if (!has){
      pane.innerHTML = '<div class="nothing">no ' + docTab + '.md yet' +
        '<div class="cmd">' + (docTab === 'PROJECT' ? '/bootstrap' : '/design-consultation') + '</div></div>';
      return;
    }
    const key = slug + '|' + docTab;
    if (!force && docCache.has(key)){
      // Only touch the DOM when the content actually differs: re-assigning the
      // same html resets the scroll position, which on a long PROJECT.md means
      // a live update yanks you back to the top mid-read.
      const html = docCache.get(key);
      if (pane.innerHTML !== html) pane.innerHTML = html;
      return;
    }
    pane.innerHTML = '<div class="nothing">reading…</div>';
    try {
      const res = await api('/api/repos/' + encodeURIComponent(slug) + '/doc/' + docTab);
      docCache.set(key, res.html);
      pane.innerHTML = res.html;
    } catch (e) {
      pane.innerHTML = '<div class="nothing">could not read it — ' + esc(e.message) + '</div>';
    }
  }

  // ── routing ──────────────────────────────────────────────────────────
  // The hash is the single source of truth for which view is up, so a reload,
  // a back button and a live SSE re-render all land in the same place.
  function route(){
    // Split rather than match: this whole page is authored inside a TypeScript
    // template literal, where a \\/ in a regex literal collapses to a bare /
    // and silently breaks the pattern. Slugs cannot contain a separator
    // (smriti-repo validates that), so splitting is exact anyway.
    const parts = (location.hash || '').replace('#', '').split('/').filter(Boolean);
    if (parts[0] === 'r' && parts[1]) view = { kind: 'app', slug: decodeURIComponent(parts[1]) };
    else if (parts[0] === 'p' && parts[1]) view = { kind: 'project', id: Number(decodeURIComponent(parts[1])) };
    else view = { kind: 'board' };

    const key = view.kind + ':' + (view.slug ?? view.id ?? '');
    const changed = key !== lastViewKey;
    lastViewKey = key;
    // Selection is owned by the view: cleared when you move between views, kept
    // when the view you are on simply re-renders (which SSE does about once a
    // second while an agent is running).
    const keep = changed ? -1 : sel;
    flat = []; sel = -1;

    // The treeline is the board's horizon, not a page ornament.
    document.querySelector('.trees').classList.toggle('off', view.kind !== 'board');
    if (view.kind === 'app') renderApp(view.slug);
    else if (view.kind === 'project') renderProject(view.id);
    else renderBoard();

    sel = keep >= flat.length ? flat.length - 1 : keep;
    paintSel();
  }
  const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };

  // Delegated wiring, re-run after every render. One place, so a control added
  // to a page cannot quietly miss its handler.
  function wire(){
    const $$ = (s) => document.querySelectorAll('.sheet ' + s);
    $$('[data-tid]').forEach((el) => {
      el.addEventListener('click', () => { const id = Number(el.dataset.tid); if (id) openDetail(id); });
    });
    $$('[data-app]').forEach((el) => {
      const open = () => { if (el.dataset.app !== NO_APP) go('#/r/' + encodeURIComponent(el.dataset.app)); };
      el.addEventListener('click', open);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); open(); } });
    });
    $$('[data-proj]').forEach((el) => {
      const open = () => go('#/p/' + el.dataset.proj);
      el.addEventListener('click', open);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); open(); } });
    });
    const back = document.querySelector('.sheet [data-back]');
    if (back) back.addEventListener('click', () => {
      if (view.kind === 'project'){
        const p = projectById(view.id);
        if (p && p.repo_slug){ go('#/r/' + encodeURIComponent(p.repo_slug)); return; }
      }
      go('');
    });
    $$('[data-tab]').forEach((el) => el.addEventListener('click', () => {
      docTab = el.dataset.tab;
      $$('[data-tab]').forEach((x) => x.classList.toggle('on', x === el));
      if (view.kind === 'app') loadDoc(view.slug);
    }));
    const rl = document.querySelector('.sheet [data-reload]');
    if (rl) rl.addEventListener('click', () => {
      if (view.kind === 'app'){ loadDoc(view.slug, true); toast('re-read from disk'); }
    });
    $$('[data-doc]').forEach((el) => el.addEventListener('click', async () => {
      const dv = $('#pagedoc'); if (!dv) return;
      try { const res = await api('/api/doc/' + el.dataset.doc); dv.innerHTML = res.html; dv.classList.add('on'); }
      catch (e) { toast('could not read the file: ' + esc(e.message)); }
    }));
    wireDescEditor();
  }

  // The description editor, shared by both pages — same click-to-edit
  // affordance a ticket body already has. Its ids are page-specific on purpose:
  // the detail overlay owns #desc/#descedit, and sharing them made this latch
  // onto the overlay's nodes whenever the board was showing.
  function wireDescEditor(){
    const d = $('#pagedesc'), ta = $('#pagedescedit');
    if (!d || !ta) return;
    const current = () => (d.dataset.edit === 'repo'
      ? ((repoBySlug(view.slug) || {}).description || '')
      : ((projectById(Number(d.dataset.pid)) || {}).description || ''));
    const save = async () => {
      const next = ta.value.trim();
      ta.classList.remove('on'); d.style.display = '';
      if (next === current().trim()) return;
      const url = d.dataset.edit === 'repo'
        ? '/api/repos/' + encodeURIComponent(view.slug)
        : '/api/projects/' + d.dataset.pid;
      try {
        await api(url, { method: 'PATCH', body: JSON.stringify({ description: next }) });
        toast('description saved'); await refresh();
      } catch (e) { toast('could not save: ' + esc(e.message)); }
    };
    wireDescEdit(d, ta, save);
    d.addEventListener('click', (ev) => {
      if (editBlocked(ev, d)) return;
      startEdit(d, ta);
    });
    paintDesc(d, current());
  }

  function recentlyShipped(t){
    return t.status === 'shipped' && (Date.now() - Date.parse(t.updated_at)) < 36e5 * 24;
  }

  // The second hand. Rewrites the text of the time elements ONLY — no re-render
  // — so it cannot race the SSE refresh or fight the selection. Stops entirely
  // while the tab is hidden, since nobody is reading a clock they can't see.
  function tick(){
    if (document.hidden) return;
    for (const el of document.querySelectorAll('[data-live]')){
      const since = el.dataset.since;
      if (!since) continue;
      const mode = el.dataset.live;
      const next = mode === 'ago' ? fmtAgo(since)
        : mode === 'run' ? '⏱ ' + fmtDur(sinceSecs(since))
        : fmtDur(sinceSecs(since));
      if (el.textContent !== next) el.textContent = next;
    }
  }
  setInterval(tick, 1000);

  function paintSel(){
    document.querySelectorAll('.card.sel,.item.sel').forEach((e) => e.classList.remove('sel'));
    if (sel < 0 || !flat[sel]) return;
    const { id, kind } = flat[sel];
    const el = kind === 'wait'
      ? document.querySelector('.item[data-tid="' + id + '"]')
      : document.querySelector('.card[data-tid="' + id + '"]');
    if (el){ el.classList.add('sel'); el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  }
  function move(d){ if (!flat.length) return; sel = sel < 0 ? 0 : Math.min(flat.length - 1, Math.max(0, sel + d)); tapKey('nav'); paintSel(); }
  function selectedTicket(){ return sel >= 0 && flat[sel] ? S.tickets.find((t) => t.id === flat[sel].id) : null; }

  // ── api ──────────────────────────────────────────────────────────────
  async function api(path, opts){
    const r = await fetch(path, Object.assign({ headers: { 'content-type': 'application/json' } }, opts));
    if (!r.ok) throw new Error((await r.text().catch(() => '')) || ('HTTP ' + r.status));
    return r.json();
  }
  // True while a description editor is open. Re-rendering underneath one
  // destroys the textarea without firing its blur handler, so the text is lost
  // with no save — worse than showing data a second out of date.
  function isEditing(){
    const ta = document.querySelector('.descedit.on');
    return Boolean(ta) && document.activeElement === ta;
  }

  // ── descriptions ─────────────────────────────────────────────────────
  // lib/md.ts is a Bun module and this whole client is one template string
  // with no build step, so the renderer cannot be imported here. The SOURCE
  // is not the problem — ticket bodies and both description columns already
  // ride along in /api/state — so the server exposes the renderer as a plain
  // function and we post it text we are already holding.
  //
  // Painted in two beats: the raw source first, with its line breaks kept,
  // then the rendered form over the top. A render that never arrives leaves
  // readable text behind instead of a blank box, which is also what makes
  // this safe to do on a surface that is polled.
  const mdCache = new Map();
  const MD_CACHE_MAX = 200;
  // Sources whose render failed. Without this, an app or project page retries
  // on every SSE tick — about once a second while an agent runs — for as long
  // as the endpoint is down. Cleared when the tab is re-focused, the same
  // place docCache is dropped, so a transient failure recovers.
  const mdFailed = new Set();
  let descSeq = 0;

  function mdPut(src, html){
    if (mdCache.size >= MD_CACHE_MAX) mdCache.delete(mdCache.keys().next().value);
    mdCache.set(src, html);
  }
  // Never blank the box. renderMarkdown returns '' for a whitespace-only
  // source, and swapping that in would destroy both the raw text and the
  // ghost placeholder, leaving an empty strip you cannot even see to click.
  function mdApply(el, html){
    if (!html) return false;
    el.innerHTML = html;
    el.classList.remove('raw');
    el.classList.add('md');
    return true;
  }
  // The guards matter more than the cache. Pages are re-rendered on every SSE
  // tick and both reuse #pagedesc, and a render started before you clicked
  // into the editor can land after it opened. So a result is only allowed in
  // while it still belongs where it was sent: same live node, same generation,
  // nothing open over it. Anything late is dropped.
  //
  // (The detail overlay is NOT rebuilt by the SSE path — refresh() only calls
  // route(), which redraws the page behind it. #desc goes stale by being
  // replaced by a later openDetail, which the same guards cover.)
  function descLands(el, seq){
    return el.isConnected                         // the view moved on under us
      && el.dataset.seq === seq                   // a newer paint owns this node
      && el.style.display !== 'none';             // an editor is open over it
  }
  async function paintDesc(el, src){
    if (!el || !src || mdFailed.has(src)) return;
    // A generation is taken even on the cache path: an older render still in
    // flight for this same node must not overwrite what the cache just put in.
    const seq = String(++descSeq);
    el.dataset.seq = seq;
    const hit = mdCache.get(src);
    if (hit !== undefined){ if (descLands(el, seq)) mdApply(el, hit); return; }
    let html;
    try { html = (await api('/api/render', { method: 'POST', body: JSON.stringify({ md: src }) })).html; }
    catch { mdFailed.add(src); return; }          // the raw text stands; that IS the fallback
    mdPut(src, html);
    if (descLands(el, seq)) mdApply(el, html);
  }

  // One description box, however it is reached. ghost is escaped even though
  // every caller passes a literal today: this is the shared entry point for
  // all three surfaces, and the next caller to pass a stored string should not
  // have to notice that the parameter was raw.
  function descBox(attrs, src, ghost){
    return '<div class="desc raw" tabindex="0" title="click, or press e, to edit" ' + attrs + '>' +
      (src ? esc(src) : '<span class="ghost">' + esc(ghost) + '</span>') + '</div>';
  }
  // Once a body is real markup, "click anywhere to edit" is too broad. A link
  // has to open, a selection you just dragged has to survive, and a middle or
  // modified click belongs to the browser rather than to us.
  function editBlocked(ev, el){
    if (ev){
      if (ev.button > 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return true;
      if (ev.target && ev.target.closest && ev.target.closest('a')) return true;
    }
    const s = window.getSelection && window.getSelection();
    if (s && !s.isCollapsed && s.anchorNode && el.contains(s.anchorNode)) return true;
    return false;
  }
  // Fit the editor to what is in it. A ticket body runs to a few hundred words
  // here, and typing it through a six-line letterbox is the thing that makes
  // the overlay feel small. Capped so the buttons below stay reachable, and
  // resize:vertical still lets you overrule it by hand.
  function growEdit(ta){
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight + 4, Math.round(window.innerHeight * 0.6)) + 'px';
  }
  function startEdit(el, ta){
    if (!el || !ta) return false;
    el.style.display = 'none';
    ta.classList.add('on');
    growEdit(ta);                 // measured after .on makes it visible
    ta.focus();
    return true;
  }
  // Save on blur, Escape to abandon, Cmd/Ctrl+Enter to commit. Wired when the
  // surface is built rather than on first click, so the e key and the keyboard
  // can open an editor that has never been clicked.
  //
  // Escape abandons by RAISING A FLAG the blur handler checks, not by removing
  // the handler: clearing it left the next editor with nothing on blur, and an
  // edit typed into it vanished with no error.
  function wireDescEdit(el, ta, save){
    let abandoned = false;
    ta.oninput = () => growEdit(ta);
    ta.onblur = () => {
      if (abandoned){ abandoned = false; return; }
      save();
    };
    ta.onkeydown = (ev) => {
      if (ev.key === 'Escape'){
        ev.stopPropagation();
        abandoned = true;
        ta.classList.remove('on'); el.style.display = '';
        el.focus();
      }
      if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey)) ta.blur();
    };
    el.addEventListener('keydown', (ev) => {
      if (ev.target !== el) return;               // a link inside keeps its own Enter
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      // stopPropagation, not just preventDefault: the global handler treats
      // Enter with the overlay open as "start this ticket", which cuts a
      // worktree and spawns a session. Opening an editor must not also do that.
      ev.preventDefault();
      ev.stopPropagation();
      startEdit(el, ta);
    });
  }

  async function refresh(){
    try { S = await api('/api/state'); if (!isEditing()) route(); }
    catch (e) {
      // 503 is the store failing to read; anything else is the server gone.
      const msg = /could not read/.test(String(e.message))
        ? 'could not read the ticket store — is sqlite3 there?'
        : 'lost the server — rerun <b>smriti</b> in a terminal';
      toast(msg, 6000);
    }
  }

  async function startTicket(t){
    if (!t) return;
    tapKey('s');
    const live = Boolean(sessionFor(t));
    toast(live ? 'finding the session for <b>#' + t.id + '</b>…'
               : 'cutting a worktree for <b>#' + t.id + '</b>…', 8000);
    try {
      const res = await api('/api/tickets/' + t.id + '/start', { method: 'POST', body: '{}' });
      openDetail(t.id, res);
      refresh();
    } catch (e) { toast('could not start: ' + esc(e.message)); }
  }
  async function markDone(t){
    if (!t) return;
    tapKey('d');
    try { await api('/api/tickets/' + t.id + '/done', { method: 'POST', body: '{}' }); toast('#' + t.id + ' shipped ✓'); refresh(); }
    catch (e) { toast('could not update: ' + esc(e.message)); }
  }
  async function addTicket(title, where){
    const body = JSON.stringify(Object.assign({ title }, where || {}));
    const res = await api('/api/tickets', { method: 'POST', body });
    toast('added <b>#' + res.id + '</b> — press s to start it');
    refresh();
  }
  // Every other action reports its own failure; capture used to be the one
  // exception, so a rejected title closed the palette and showed nothing.
  //
  // Where a captured ticket lands is decided HERE and never by the server's
  // cwd, which is whichever directory the board happened to be started from.
  // On a page the answer is simply the page you are looking at; on the board it
  // falls back to the selected card's app. Capturing with neither is fine —
  // that is an idea, which is now a first-class place for it to be.
  async function capture(title){
    if (view.kind === 'project'){
      const p = projectById(view.id);
      try { await addTicket(title, { project: String(p ? p.id : ''), repo: p && p.repo_slug ? p.repo_slug : '' }); }
      catch (e) { toast('could not add: ' + esc(e.message)); }
      return;
    }
    if (view.kind === 'app'){
      try { await addTicket(title, { repo: view.slug }); }
      catch (e) { toast('could not add: ' + esc(e.message)); }
      return;
    }
    const row = flat[sel];
    const t = row ? S.tickets.find((x) => x.id === row.id) : null;
    const repo = t && t.repo_slug ? t.repo_slug : '';
    try { await addTicket(title, { repo }); }
    catch (e) { toast('could not add: ' + esc(e.message)); }
  }

  // ── detail overlay ───────────────────────────────────────────────────
  async function openDetail(id, startRes){
    const t = S.tickets.find((x) => x.id === id);
    if (!t) return;
    detailId = id;
    const run = runFor(t);
    const docs = docsFor(t);
    const proj = t.project_id != null ? projectById(t.project_id) : null;
    // The number is identity, so it sits above the title rather than being the
    // first clause of a sentence. Rows below are emitted whether or not they
    // are filled, so the block does not jump about between tickets. The
    // document count is gone on purpose: the paper trail is listed in full a
    // few inches down, and counting it here said the same thing twice.
    // label is escaped, value is not: value is markup the callers below build
    // (a jump span, a stamp) and have already escaped the text inside.
    const field = (label, value, cls) =>
      '<dt>' + esc(label) + '</dt><dd' + (cls ? ' class="' + cls + '"' : '') + '>' + value + '</dd>';
    let h = '<div class="eyebrow">#' + t.id + '</div>' +
      '<h2>' + esc(t.title) + '</h2>' +
      '<dl class="fields">' +
      field('app', t.repo_slug
        ? '<span class="jump" data-app="' + esc(t.repo_slug) + '">' + esc(appLabel(t.repo_slug)) + '</span>'
        : 'no app yet', t.repo_slug ? '' : 'empty') +
      field('project', proj
        ? '<span class="jump" data-proj="' + proj.id + '">' + esc(proj.name) + '</span>'
        : '— loose in ' + esc(t.repo_slug ? appLabel(t.repo_slug) : 'no app'), proj ? '' : 'empty') +
      field('status', '<span class="stamp">' + esc(STATUS[t.status] || t.status) + '</span>') +
      field('branch', t.branch ? esc(t.branch) : 'not started yet', t.branch ? 'wire' : 'empty') +
      '</dl>';
    h += descBox('id="desc" data-act="editdesc"', t.body, 'add a description…');
    h += '<textarea class="descedit" id="descedit" placeholder="what this actually is, and why">' + esc(t.body || '') + '</textarea>';
    h += '<div class="acts">';
    // "attach" is only honest if a session actually exists. Basing it on the
    // ticket being in_progress got it wrong the moment a session was killed:
    // the worktree and branch survive, so the board offered to attach to
    // nothing. herdr is the authority on whether there is something to join.
    const live = Boolean(sessionFor(t));
    if (t.status !== 'shipped' && t.status !== 'cancelled')
      h += '<button class="btn go" data-act="start">' + (live ? 'attach ⏎' : 'start ⏎') + '</button>';
    if (live) h += '<button class="btn" data-act="restart">restart session</button>';
    if (t.status !== 'shipped' && t.status !== 'cancelled') h += '<button class="btn" data-act="done">mark done</button>';
    if (t.status !== 'cancelled') h += '<button class="btn" data-act="cancel">cancel</button>';
    else h += '<button class="btn" data-act="revive">bring it back</button>';
    h += '<button class="btn danger" data-act="delete">delete</button>';
    // esc() escapes HTML; it does not validate a scheme. Without the same
    // allowlist md.ts applies to document links, a stored javascript: url runs
    // against this page's own authenticated API when clicked.
    const httpUrl = (u) => { const v = String(u || '').toLowerCase(); return v.startsWith('http://') || v.startsWith('https://'); };
    if (t.pr_url && httpUrl(t.pr_url))
      h += '<a class="btn" href="' + esc(t.pr_url) + '" target="_blank" rel="noopener">open PR ↗</a>';
    h += '</div>';
    // Re-filing, the other half of "tickets attached to projects": only
    // offered within the ticket's own app, because moving between apps means
    // moving a worktree and is a CLI decision, not a dropdown one.
    if (t.repo_slug){
      const opts = projectsIn(t.repo_slug).filter((p) => p.status === 'active');
      h += '<div class="refile"><span>project</span><select id="refile">' +
        '<option value="">— loose in ' + esc(appLabel(t.repo_slug)) + ' —</option>' +
        opts.map((p) => '<option value="' + p.id + '"' +
          (Number(t.project_id) === Number(p.id) ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('') +
        '</select></div>';
    }
    if (docs.length){
      h += '<div class="trail">' + docs.map((d) =>
        '<div class="doc" data-doc="' + d.id + '"><span class="tag">' + esc(d.type) + '</span><span>' + esc(d.path.split('/').pop()) + '</span></div>'
      ).join('') + '</div><div class="docview md" id="docview"></div>';
    }
    h += '<div class="runs" id="runs"></div>';
    h += '<div class="attach" id="attach"></div>';
    $('#detbody').innerHTML = h;
    $('#detv').classList.add('on');
    loadRuns(t.id);
    if (startRes) showAttach(startRes);
    const saveDesc = async () => {
      const ta = $('#descedit');
      const next = ta.value.trim();
      ta.classList.remove('on'); $('#desc').style.display = '';
      // Compare against the CURRENT stored body, not the one captured when the
      // overlay was drawn. The overlay is not rebuilt by the SSE path, so the
      // captured ticket goes stale the moment an agent rewrites it — and
      // this decides whether a PATCH is sent at all.
      const live = (S.tickets.find((x) => x.id === t.id) || t).body || '';
      if (next === live.trim()) return;
      try {
        await api('/api/tickets/' + t.id, { method: 'PATCH', body: JSON.stringify({ body: next }) });
        toast('description saved'); await refresh(); openDetail(t.id);
      } catch (e) { toast('could not save: ' + esc(e.message)); }
    };
    wireDescEdit($('#desc'), $('#descedit'), saveDesc);
    paintDesc($('#desc'), t.body);
    $('#detbody').querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', async (ev) => {
      const act = b.dataset.act;
      if (act === 'start') startTicket(t);
      if (act === 'done'){ markDone(t); closeAll(); }
      if (act === 'editdesc'){
        if (editBlocked(ev, b)) return;
        startEdit(b, $('#descedit'));
      }
      if (act === 'restart'){
        toast('restarting the session for <b>#' + t.id + '</b>…', 8000);
        try {
          const res = await api('/api/tickets/' + t.id + '/restart', { method: 'POST', body: '{}' });
          openDetail(t.id, res); refresh();
        } catch (e) { toast('could not restart: ' + esc(e.message)); }
      }
      if (act === 'cancel'){
        try { await api('/api/tickets/' + t.id + '/cancel', { method: 'POST', body: '{}' });
              toast('#' + t.id + ' cancelled — still there under all'); closeAll(); refresh(); }
        catch (e) { toast('could not cancel: ' + esc(e.message)); }
      }
      if (act === 'revive'){
        try { await api('/api/tickets/' + t.id + '/revive', { method: 'POST', body: '{}' });
              toast('#' + t.id + ' is back'); } catch (e) { toast('could not revive: ' + esc(e.message)); }
        closeAll(); refresh();
      }
      if (act === 'delete'){
        if (b.dataset.armed !== '1'){
          b.dataset.armed = '1'; b.textContent = 'really delete?';
          setTimeout(() => { b.dataset.armed = '0'; b.textContent = 'delete'; }, 4000);
          return;
        }
        try { await api('/api/tickets/' + t.id, { method: 'DELETE' }); toast('#' + t.id + ' deleted'); closeAll(); refresh(); }
        catch (e) { toast('could not delete: ' + esc(e.message)); }
      }
    }));
    $('#detbody').querySelectorAll('[data-doc]').forEach((el) => el.addEventListener('click', async () => {
      const dv = $('#docview');
      try {
        const res = await api('/api/doc/' + el.dataset.doc);
        dv.innerHTML = res.html; dv.classList.add('on');
      } catch (e) { toast('could not read the file: ' + esc(e.message)); }
    }));
    // The overlay binds its own navigation: wire() is scoped to .sheet, so
    // these would otherwise never get a handler.
    $('#detbody').querySelectorAll('[data-app]').forEach((el) => el.addEventListener('click', () => {
      closeAll(); go('#/r/' + encodeURIComponent(el.dataset.app));
    }));
    $('#detbody').querySelectorAll('[data-proj]').forEach((el) => el.addEventListener('click', () => {
      closeAll(); go('#/p/' + el.dataset.proj);
    }));
    const rf = $('#refile');
    if (rf) rf.addEventListener('change', async () => {
      // '' is a real choice — "take it out of its project" — so it is sent as
      // null rather than omitted, which would mean "leave it alone".
      const project = rf.value ? rf.value : null;
      try {
        await api('/api/tickets/' + t.id, { method: 'PATCH', body: JSON.stringify({ project }) });
        toast(project ? 'filed into ' + esc(rf.options[rf.selectedIndex].text) : 'now loose in the app');
        await refresh(); openDetail(t.id);
      } catch (e) { toast('could not re-file: ' + esc(e.message)); }
    });
  }
  // ── where the time went ──────────────────────────────────────────────
  // Fetched PER TICKET rather than filtered out of S.runs: /api/state carries
  // a recency-bounded window (enough to draw cards), so an older run would
  // simply be missing here — the one place that promises every run.
  async function loadRuns(ticketId){
    const box = $('#runs');
    if (!box) return;
    let runs;
    try { runs = (await api('/api/runs?ticket=' + ticketId)).runs || []; }
    catch (e) {
      // A ticket with no runs comes back as an empty list, not an error — so
      // the only things reaching here are a broken store or a dead server.
      // Swallowing them renders "never run" for "cannot read", which is the
      // same lie the 503 on /api/state exists to prevent.
      toast('could not read the trace: ' + esc(e.message), 5000);
      return;
    }
    if (!runs.length) return;
    box.innerHTML = runs.map((r) => runShell(r)).join('');
    // Concurrently, not one after another: each of these spawns sqlite behind
    // the server, and awaiting them in sequence made opening a ticket with
    // several runs take as long as all of them put together.
    await Promise.all(runs.map(async (r) => {
      try {
        const d = await api('/api/run/' + r.run_uid);
        // The overlay may have been closed or reopened while this was in
        // flight; writing into a detached node is harmless, missing one is not.
        const el = box.querySelector('[data-run="' + r.run_uid + '"] .bd');
        if (el) el.innerHTML = phaseBreakdown(d.phases || [], d.totals || {});
      } catch {}
    }));
  }

  function runShell(r){
    const secs = runSecs(r);
    const live = !r.ended_at;
    const you = r.you_s || 0;
    // Shown for a live run too. agent_s/you_s are already correct while a run
    // is open (the terminal segment measures to now), and a run still sitting
    // at a gate is exactly when you most want to see how much of it is yours.
    const split = ' · agent <span class="part">' + fmtDur(r.agent_s || 0) + '</span>' +
      (you > 0 ? ' · you <span class="you">' + fmtDur(you) + '</span>' : '');
    return '<div class="run" data-run="' + esc(r.run_uid) + '">' +
      '<div class="rh"><span class="uid">' + esc(r.run_uid) + '</span>' +
      '<span>' + esc(r.skill) + '</span><span>' + esc(r.status) + '</span>' +
      '<span class="tot"' + (live ? ' data-live="dur" data-since="' + esc(r.started_at) + '"' : '') + '>' +
      fmtDur(secs) + '</span>' + split + '</div>' +
      '<div class="bd"></div></div>';
  }

  // A stacked bar over the phases in order, then the same numbers as rows.
  // Pine ink is the agent's time, highlighter wash is yours — the two colours
  // already carry those meanings everywhere else on this page.
  function phaseBreakdown(phases, totals){
    const total = Number(totals.duration_s) || phases.reduce((a, p) => a + (p.total_s || 0), 0);
    if (!total || !phases.length) return '';
    const pct = (n) => (100 * (n || 0) / total).toFixed(2) + '%';
    const bar = '<div class="bar">' + phases.map((p) =>
      (p.agent_s > 0 ? '<i class="a" style="width:' + pct(p.agent_s) + '" title="' + esc(p.phase) + ' — agent"></i>' : '') +
      (p.you_s > 0 ? '<i class="y" style="width:' + pct(p.you_s) + '" title="' + esc(p.phase) + ' — you"></i>' : '')
    ).join('') + '</div>';
    const rows = phases.map((p) => {
      const t = p.total_s || 0;
      const aw = t ? (100 * (p.agent_s || 0) / t).toFixed(2) + '%' : '0%';
      const yw = t ? (100 * (p.you_s || 0) / t).toFixed(2) + '%' : '0%';
      return '<div class="p"><span class="nm">' + esc(p.phase) + '</span>' +
        '<span class="sw"><i class="a" style="width:' + aw + '"></i><i class="y" style="width:' + yw + '"></i></span>' +
        '<span class="d">' + fmtDur(t) + '</span>' +
        (p.you_s > 0 ? '<span class="yw">you ' + fmtDur(p.you_s) + '</span>' : '') + '</div>';
    }).join('');
    return bar + '<div class="phz">' + rows + '</div>';
  }

  // ── pace ─────────────────────────────────────────────────────────────
  // 0 means all time. A falsy-OR default turned that into a label claiming the
  // last 30 days over the entire history — the one line whose whole job is to
  // say what the medians cover.
  function windowLabel(days){
    const d = Number(days);
    return Number.isFinite(d) && d > 0 ? 'last ' + d + ' days' : 'all time';
  }
  async function openPace(){
    tapKey('m');
    $('#pacebody').innerHTML = '<h2>pace</h2><div class="m">reading the trace…</div>';
    $('#pacev').classList.add('on');
    let s;
    try { s = await api('/api/stats?days=30'); }
    catch (e) { $('#pacebody').innerHTML = '<h2>pace</h2><div class="m">could not read the trace</div>'; return; }
    const rows = (list, key) => {
      if (!list.length) return '<div class="row"><span class="nm">—</span></div>';
      const max = Math.max(...list.map((x) => x.median_s || 0)) || 1;
      return list.map((x) => {
        const m = x.median_s || 0;
        const w = (100 * m / max).toFixed(2) + '%';
        // The three medians are computed independently, and medians do not add:
        // median(total) is not median(agent) + median(you). So the split inside
        // the bar is drawn as a RATIO of the two parts rather than as a fraction
        // of the total — otherwise the bar comes up short and reads as missing
        // data. The number beside it is the true median_s.
        const a = x.median_agent_s || 0, y = x.median_you_s || 0, sum = a + y;
        const ay = sum ? (100 * a / sum).toFixed(2) + '%' : '100%';
        const yy = sum ? (100 * y / sum).toFixed(2) + '%' : '0%';
        return '<div class="row"><span class="nm">' + esc(x[key]) + '</span>' +
          '<span class="n">×' + (x.runs || x.samples || 0) + '</span>' +
          '<span class="sw" style="max-width:' + w + '"><i class="a" style="width:' + ay + '"></i>' +
          '<i class="y" style="width:' + yy + '"></i></span>' +
          '<span class="d">' + fmtDur(m) + '</span></div>';
      }).join('');
    };
    const n = s.runs || 0;
    $('#pacebody').innerHTML = '<h2>pace</h2>' +
      '<div class="m">' + n + ' completed run' + (n === 1 ? '' : 's') + ' · ' + windowLabel(s.window_days) + '</div>' +
      (n === 0
        ? '<div class="m">nothing finished yet — medians appear once runs complete</div>'
        : '<div class="grp"><div class="lbl">median by skill</div>' + rows(s.by_skill || [], 'skill') + '</div>' +
          '<div class="grp"><div class="lbl">median by phase</div>' + rows(s.by_phase || [], 'phase') + '</div>' +
          '<div class="legend"><span><s class="a"></s><b>agent time</b></span>' +
          '<span><s class="y"></s><b>your time</b> — waiting at a gate</span></div>');
  }

  function showAttach(res){
    const a = $('#attach'); if (!a) return;
    a.classList.add('on');
    // Distinguish "I just started this" from "this was already open" —
    // reporting a start that did not happen is the thing that confused the
    // board into offering start on work already in progress.
    // herdr reports what the agent is actually doing, so say that rather than
    // implying we just started something.
    const st = res.agentStatus;
    const existingNote =
      st === 'blocked' ? 'that session is waiting on you — jump to it with:'
      : st === 'working' ? 'that session is working — jump to it with:'
      : st === 'done' ? 'that session finished — attach to see it, or restart:'
      : 'session is already open — jump to it with:';
    const notes = {
      herdr: res.existing ? existingNote
        // The prompt is typed into the session once claude has finished booting,
        // so it is genuinely still in flight when this renders.
        : res.prompting ? 'session started — /begin is being typed into it now:'
        : 'session started under herdr — jump to it with:',
      manual: 'worktree is ready — run this in a terminal:',
    };
    a.innerHTML = '<div class="note">' + esc(notes[res.method] || 'ready:') + '</div>' +
      '<div class="how">' + esc(res.attach) + '</div>' +
      '<button class="btn" style="margin-top:10px" data-copy>copy</button>';
    a.querySelector('[data-copy]').addEventListener('click', () => {
      navigator.clipboard.writeText(res.attach).then(() => toast('copied ✓'));
    });
  }

  // ── palette ──────────────────────────────────────────────────────────
  let palSel = 0, palItems = [];
  function palOpen(){ tapKey('k'); $('#palv').classList.add('on'); $('#palq').value = ''; palRender(''); $('#palq').focus(); }
  function palRender(q){
    const ql = q.trim().toLowerCase();
    palItems = [];
    if (q.trim()){
      const into = view.kind === 'project' ? ' into this project'
        : view.kind === 'app' ? ' into ' + appLabel(view.slug) : '';
      palItems.push({ label: 'New ticket — “' + q.trim() + '”' + into, r: '⏎', act: () => capture(q.trim()) });
    }
    // Apps and projects are searchable too — on a board with several apps,
    // typing the name is faster than finding its heading.
    for (const r of (S.repositories || [])){
      if (ql && !r.slug.toLowerCase().includes(ql) && !(r.name || '').toLowerCase().includes(ql)) continue;
      if (!ql) continue;
      palItems.push({ label: 'App — ' + (r.name || r.slug), r: 'page', act: () => go('#/r/' + encodeURIComponent(r.slug)) });
      if (palItems.length > 9) break;
    }
    for (const p of (S.projects || [])){
      if (ql && !p.name.toLowerCase().includes(ql) && !p.slug.toLowerCase().includes(ql)) continue;
      if (!ql) continue;
      palItems.push({ label: 'Project — ' + p.name, r: 'page', act: () => go('#/p/' + p.id) });
      if (palItems.length > 9) break;
    }
    for (const t of S.tickets){
      if (!ql || t.title.toLowerCase().includes(ql) || String(t.id) === ql){
        palItems.push({ label: '#' + t.id + ' ' + t.title, r: STATUS[t.status] || t.status, act: () => openDetail(t.id) });
        if (palItems.length > 9) break;
      }
    }
    const first = S.tickets.find((t) => t.status === 'ready');
    if (!ql && first) palItems.push({ label: 'Start #' + first.id + ' — cut worktree & open a session', r: '⌥⏎', act: () => startTicket(first) });
    palSel = 0;
    $('#palopts').innerHTML = palItems.map((it, i) =>
      '<div class="o' + (i === palSel ? ' on' : '') + '" data-i="' + i + '"><span>' + esc(it.label) + '</span><span class="r">' + esc(it.r) + '</span></div>').join('');
    $('#palopts').querySelectorAll('.o').forEach((el) => el.addEventListener('click', () => { closeAll(); palItems[Number(el.dataset.i)].act(); }));
  }
  function palPaint(){
    $('#palopts').querySelectorAll('.o').forEach((el, i) => el.classList.toggle('on', i === palSel));
  }

  function closeAll(){
    ['palv','detv','helpv','pacev'].forEach((id) => $('#' + id).classList.remove('on'));
    detailId = null;
  }

  // ── keyboard ─────────────────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    const inPal = $('#palv').classList.contains('on');
    const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'){ e.preventDefault(); inPal ? closeAll() : palOpen(); return; }
    if (e.key === 'Escape'){
      // On a page with nothing open, esc is "go back up" rather than a no-op:
      // project → its app → the board.
      const anyOpen = ['palv','detv','helpv'].some((id) => $('#' + id).classList.contains('on'));
      closeAll();
      if (!anyOpen && view.kind !== 'board'){
        const b = document.querySelector('.sheet [data-back]');
        if (b) b.click();
      }
      return;
    }

    if (inPal){
      if (e.key === 'ArrowDown'){ e.preventDefault(); palSel = Math.min(palItems.length - 1, palSel + 1); palPaint(); }
      else if (e.key === 'ArrowUp'){ e.preventDefault(); palSel = Math.max(0, palSel - 1); palPaint(); }
      else if (e.key === 'Enter'){ e.preventDefault(); const it = palItems[palSel]; closeAll(); if (it) it.act(); }
      return;
    }
    if (typing) return;

    const t = selectedTicket();
    switch (e.key){
      case 'ArrowDown': case 'j': e.preventDefault(); move(1); break;
      case 'ArrowUp': case 'k': e.preventDefault(); move(-1); break;
      case 'Enter': tapKey('Enter'); if (detailId && t) startTicket(t); else if (t) openDetail(t.id); break;
      case 's': startTicket(t); break;
      case 'd': markDone(t); break;
      case 'c': case '/': e.preventDefault(); tapKey('c'); palOpen(); break;
      case '?': tapKey('?'); $('#helpv').classList.add('on'); break;
      case 'm': openPace(); break;
      case 't': toggleTheme(); break;
      case 'r': refresh(); toast('refreshed'); break;
      // e edits whichever description is in front of you. Until now the only
      // way into an editor was a mouse click, on a board that is otherwise
      // entirely keyboard-driven.
      //
      // Only the detail overlay has a description behind it. help and pace do
      // not, and focusing a textarea underneath one of those puts every
      // keystroke somewhere invisible AND stops refresh() re-rendering, since
      // isEditing() then reports true.
      case 'e': {
        if (['helpv', 'pacev'].some((id) => $('#' + id).classList.contains('on'))) break;
        const opened = $('#detv').classList.contains('on')
          ? startEdit($('#desc'), $('#descedit'))
          : startEdit($('#pagedesc'), $('#pagedescedit'));
        // Only claim the key when it did something — the footer chip flashing
        // on a view with no description reads as "that worked".
        if (opened){ e.preventDefault(); tapKey('e'); }
        break;
      }
      // p opens the app of whatever is selected — the one key that navigates
      // between the two levels without reaching for the mouse.
      case 'p': {
        tapKey('p');
        if (view.kind === 'board' && t && t.project_id != null) go('#/p/' + t.project_id);
        else if (view.kind === 'board' && t && t.repo_slug) go('#/r/' + encodeURIComponent(t.repo_slug));
        else if (view.kind === 'project'){
          const pr = projectById(view.id);
          if (pr && pr.repo_slug) go('#/r/' + encodeURIComponent(pr.repo_slug));
        }
        break;
      }
    }
  });
  $('#palq').addEventListener('input', (e) => palRender(e.target.value));
  document.querySelectorAll('.veil').forEach((v) => v.addEventListener('click', (e) => { if (e.target === v) closeAll(); }));

  // ── live updates ─────────────────────────────────────────────────────
  try {
    const es = new EventSource('/api/events');
    es.addEventListener('changed', () => refresh());
    // Without this the tab goes stale in silence: on a 403 (server restarted,
    // its in-memory cookies gone) EventSource gives up permanently per spec,
    // and nothing ever re-drives refresh().
    es.onerror = () => toast('lost the server — rerun <b>smriti</b> in a terminal', 6000);
  } catch {}
  // Back/forward and hand-edited URLs both drive the same router.
  window.addEventListener('hashchange', () => route());
  // Coming back to the tab is the moment stale data is most obvious, and the
  // cheapest moment to notice the server died while the laptop slept. Repo
  // files are not watched, so this is also when an edited PROJECT.md shows up.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden){ docCache.clear(); mdFailed.clear(); refresh(); }
  });
  // Visibility-aware heartbeat: keeps the server alive only while the tab is
  // actually being looked at, so a backgrounded tab lets it idle out.
  setInterval(() => { if (!document.hidden) fetch('/api/ping').catch(() => {}); }, 5 * 60 * 1000);

  refresh();
})();
</script>
</body>
</html>`;
}
