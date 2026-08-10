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
  .sheet{position:relative;z-index:2;flex:1;min-width:0;max-width:1080px;margin:0 auto;padding:38px 34px 150px}

  /* ── the margin ───────────────────────────────────────────────────────
     The app/project index, drawn as the ruled margin of the page rather
     than as another box: a line, not a fifth wonky rectangle. It is the
     one UNROTATED element on the board — a page edge is straight, and
     giving the eye somewhere to rest is what makes the wonkiness
     elsewhere read as deliberate rather than uniform.

     Width AND the open/collapsed presentation both ride on custom
     properties, so one mechanism serves two masters: the CSS default
     (open until the viewport is too narrow) and the explicit choice
     (data-rail, persisted). Deliberately not a width probe read once in
     JS at load — that leaves the margin wrong for the rest of the
     session the moment you resize the window. */
  :root{--rail-w:198px;--rail-pad:20px;--rail-detail:inline;--rail-lab:inline-block;--rail-proj:flex;--rail-just:flex-start;--rail-row-pad:6px;--rail-row-end:12px;--rail-glyph:"\\2039"}
  @media (max-width:1200px){
    :root{--rail-w:58px;--rail-pad:0px;--rail-detail:none;--rail-lab:none;--rail-proj:none;--rail-just:center;--rail-row-pad:0px;--rail-row-end:0px;--rail-glyph:"\\203A"}
  }
  /* The explicit choice must outrank the breakpoint in BOTH directions, so
     it is an attribute selector — a media query adds no specificity, and a
     bare :root inside one would lose to nothing at all. */
  :root[data-rail="open"]{--rail-w:198px;--rail-pad:20px;--rail-detail:inline;--rail-lab:inline-block;--rail-proj:flex;--rail-just:flex-start;--rail-row-pad:6px;--rail-row-end:12px;--rail-glyph:"\\2039"}
  :root[data-rail="collapsed"]{--rail-w:58px;--rail-pad:0px;--rail-detail:none;--rail-lab:none;--rail-proj:none;--rail-just:center;--rail-row-pad:0px;--rail-row-end:0px;--rail-glyph:"\\203A"}
  @media (max-width:700px){:root,:root[data-rail]{--rail-w:0px} .rail,.rtab{display:none}}

  .page{display:flex;position:relative;z-index:2;min-height:100vh}
  .rail{
    position:sticky;top:0;align-self:flex-start;flex:none;
    width:var(--rail-w);height:100vh;overflow:hidden auto;
    padding:38px 0 26px var(--rail-pad);
    border-right:2.5px solid var(--ink-4);
    display:flex;flex-direction:column;
  }
  .rail .rlab{
    display:var(--rail-lab);align-self:flex-start;
    font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.22em;
    text-transform:uppercase;color:var(--hi-text);margin:0 0 15px;padding:3px 7px;
    background:linear-gradient(180deg,transparent 52%,rgba(var(--hi-rgb),var(--hi-wash)) 52%,rgba(var(--hi-rgb),var(--hi-wash)) 92%,transparent 92%);
    background-size:0% 100%;background-repeat:no-repeat;animation:swipe .6s ease-out .15s forwards;
  }
  /* Rows are full width so the current-app wash spans the margin; centring the
     collapsed sigil is therefore justify-content on the row, NOT align-items on
     the column — that could never have moved a width:100% child. */
  .ritem{
    display:flex;align-items:center;justify-content:var(--rail-just);
    gap:10px;padding:6px var(--rail-row-end) 6px var(--rail-row-pad);
    cursor:pointer;border-radius:9px;margin-bottom:2px;width:100%;
  }
  .ritem .sig{width:26px;height:26px;font-size:8.5px;border-radius:9px 11px 8px 10px/10px 8px 11px 9px}
  .ritem .nm{
    display:var(--rail-detail);font-size:16px;color:var(--ink-2);
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  }
  .ritem .n{display:var(--rail-detail);font-family:ui-monospace,Menlo,monospace;font-size:10px;color:var(--ink-4);margin-left:auto;flex:none}
  .ritem:hover .nm{color:var(--ink)}
  .ritem:hover .sig{transform:rotate(2deg) scale(1.06)}
  .ritem:focus-visible{outline:2.5px solid var(--hi);outline-offset:-2px}
  .ritem.on{
    background:linear-gradient(180deg,transparent 8%,rgba(var(--hi-rgb),var(--hi-wash)) 8%,rgba(var(--hi-rgb),var(--hi-wash)) 92%,transparent 92%);
    box-shadow:inset 3px 0 0 var(--hi);
  }
  .ritem.on .nm{color:var(--ink)}
  .ritem.ideas{margin-top:12px}
  .ritem.ideas .nm{color:var(--ink-4)}
  .rproj{
    display:var(--rail-proj);align-items:baseline;gap:8px;width:100%;
    padding:5px 12px 5px 34px;cursor:pointer;font-size:14.5px;color:var(--ink-3);border-radius:9px;
  }
  .rproj:hover{color:var(--ink-2)}
  .rproj:focus-visible{outline:2.5px solid var(--hi);outline-offset:-2px}
  .rproj .arrow{color:var(--pine-c);font-size:11px;flex:none}
  .rproj .nm{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .rproj .n{font-family:ui-monospace,Menlo,monospace;font-size:9.5px;color:var(--ink-4);margin-left:auto;flex:none}
  .rproj.loose{font-style:italic;color:var(--ink-4)}
  .rproj.on{
    color:var(--ink);
    background:linear-gradient(180deg,transparent 8%,rgba(var(--hi-rgb),var(--hi-wash)) 8%,rgba(var(--hi-rgb),var(--hi-wash)) 92%,transparent 92%);
    box-shadow:inset 3px 0 0 var(--hi);
  }
  /* Outside .rail, which would clip a tab hanging off its edge, and outside
     .page too — that carries a z-index and so traps its descendants in one
     stacking slot, which would have quietly pinned this under the key bar.
     FIXED rather than absolute: the rail is sticky, so a tab that scrolled away
     would strand the control halfway down a long board. */
  .rtab{
    position:fixed;left:calc(var(--rail-w) - 11px);top:74px;z-index:9;
    width:21px;height:21px;display:grid;place-items:center;padding:0;
    font:inherit;font-size:12px;color:var(--ink-2);background:var(--paper);
    border:2.5px solid var(--ink-3);border-radius:7px 9px 6px 8px/8px 6px 9px 7px;
    transform:rotate(-3deg);cursor:pointer;
  }
  /* The glyph is CSS, from the same token that sets the width. Deriving it in
     JS meant a resize across the breakpoint left the arrow pointing the wrong
     way until something else happened to re-render. */
  .rtab::before{content:var(--rail-glyph)}
  .rtab:hover{color:var(--ink);border-color:var(--ink-3)}

  /* ── keys that live on their control ──────────────────────────────────
     A key earns a permanent slot in the bottom bar only if nothing on screen
     can wear it. Move, open, start, capture, done, the palette — those act on
     the selection or on nothing yet, so the bar is their only home. b and h
     each have a control that is always on screen in a fixed place, so the
     control names its own key and the bar stays a list of ten.

     Written down rather than revealed on approach, unlike .goto elsewhere.
     Hover was the first instinct and it is wrong here: the board replaces its
     html wholesale about once a second while an agent runs, and a node swapped
     out under a stationary cursor does not regain :hover until the mouse moves
     again — so the hint would flicker, or never arrive at all. Marginalia is
     written down anyway. Quiet enough at rest to be annotation rather than
     chrome, and it warms when you approach the control it belongs to. */
     A key is drawn as a KEYCAP everywhere in this app, so it is drawn as one
     here too — a bare letter read as stray pencil rather than as something you
     could press. Same .k as the bar, a size down, which also inherits its press
     animation for free. */
  .k.sm{
    font-family:ui-monospace,Menlo,monospace;font-size:9px;letter-spacing:.08em;
    text-transform:uppercase;min-width:0;padding:2px 5px 3px;margin-right:0;
    border-width:2px;box-shadow:0 1.5px 0 rgba(var(--sh),.4);pointer-events:none;
  }
  /* Sits on paper so the margin rule does not run through it — the same thing
     the tab above it does where it straddles the line. */
  .rtab .kb{position:absolute;top:calc(100% + 5px);left:50%;transform:translateX(-50%)}
  .rtab:hover .kb,.rtab:focus-visible .kb{border-color:var(--orange);color:var(--orange)}
  body:has(.rail:hover) .rtab .kb{border-color:var(--ink)}

  .kh{
    margin-left:auto;padding-left:14px;display:inline-flex;align-items:center;gap:7px;
    font-family:ui-monospace,Menlo,monospace;font-size:9.5px;letter-spacing:.16em;
    text-transform:uppercase;color:var(--ink-4);pointer-events:none;
  }
  .histline:hover .kh,.histline:focus-visible .kh{color:var(--ink-2)}
  .histline:hover .k.sm,.histline:focus-visible .k.sm{border-color:var(--orange);color:var(--orange)}

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
  /* The one thing on a waiting row you can act on, so it reads as an action
     rather than as more metadata. */
  .planlink{color:var(--hi);text-decoration:none;border-bottom:1px solid transparent;font-weight:600}
  .planlink:hover,.planlink:focus-visible{border-bottom-color:currentColor}
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
  /* A ticket's mono line is its branch, and a PR is something that branch HAS
     rather than something you do to it — so the link lives here and not in the
     action stack, which is one fewer button. */
  .slab .path a{color:var(--pine-b);text-decoration:none;border-bottom:1.5px dotted var(--pine-b)}
  .tally{display:flex;gap:20px;flex-wrap:wrap;margin-top:12px}
  .tally div{font-family:ui-monospace,Menlo,monospace;font-size:10.5px;letter-spacing:.14em;
    text-transform:uppercase;color:var(--ink-3)}
  .tally b{font-family:"Chalkboard SE",cursive;font-size:21px;letter-spacing:0;color:var(--ink);
    display:block;margin-bottom:-2px}
  .tally .warm b{color:var(--orange)}
  /* Where an app page counts tickets, a ticket counts hours — in the same two
     colours the trace below uses, so the key is taught at the top of the page
     and spent at the bottom of it. */
  .tally .agent b{color:var(--pine-b)}
  .tally .yours b{color:var(--hi-text)}

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
     app page, the doc viewer on a ticket page, and the three descriptions.
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
  /* The fold. This line was already a torn edge — a dashed rule with small type
     beneath it — it just did nothing. Now it is the affordance that unfolds what
     finished, so completed work is reachable instead of merely counted. */
  .histline{
    display:flex;align-items:center;gap:8px;width:100%;text-align:left;cursor:pointer;
    margin-top:14px;font:inherit;font-family:ui-monospace,Menlo,monospace;font-size:11px;
    letter-spacing:.14em;text-transform:uppercase;color:var(--ink-4);
    background:transparent;border:0;border-top:2px dashed var(--ink-4);padding:12px 0 0;
  }
  .histline b{color:var(--ink-3);font-weight:400}
  .histline .arrow{color:var(--pine-c);font-size:12px;letter-spacing:0;flex:none}
  .histline .txt{padding:2px 6px}
  .histline:hover .txt,.histline:focus-visible .txt{color:var(--ink-3)}
  .histline:focus-visible{outline:2.5px solid var(--hi);outline-offset:3px}
  .histline.on .txt{
    color:var(--hi-text);
    background:linear-gradient(180deg,transparent 14%,rgba(var(--hi-rgb),var(--hi-wash)) 14%,rgba(var(--hi-rgb),var(--hi-wash)) 90%,transparent 90%);
  }
  .histline.on b{color:var(--hi-text)}
  .cards.folded{margin-top:12px}

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
    position:fixed;left:var(--rail-w);right:0;bottom:0;z-index:8;padding:14px 26px;
    display:flex;justify-content:center;gap:12px 20px;flex-wrap:wrap;
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
  .jump{color:var(--pine-b);cursor:pointer;border-bottom:1.5px dotted var(--pine-b)}
  .jump:hover{color:var(--ink)}
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

  /* ── the ticket page ─────────────────────────────────────────────────
     A ticket is a job card, and this is that card laid flat: a printed head,
     a hand-written body, a routing stub down the side, and the timesheet the
     runner produced underneath.

     Two columns, because the overlay's real failure was ORDER rather than
     width — actions above a long body and the trace below it means acting
     costs a scroll in both directions. The stub stays put instead. */
  .tgrid{
    display:grid;gap:30px 34px;align-items:start;
    grid-template-columns:minmax(0,1fr) 268px;
    grid-template-areas:"main stub";
  }
  /* minmax(0,…) AND min-width:0, both. A rendered body holds wide tables and
     long <pre>, and a grid item's automatic minimum is its content — either
     guard alone still lets one push the column past the sheet and scroll the
     whole page sideways. Same failure the shared .md block exists to stop. */
  .tmain{grid-area:main;min-width:0}
  .tstub{grid-area:stub;min-width:0}
  /* Stacking puts the stub FIRST: on a narrow window the disposition of the
     ticket is still what you came for, and burying it under six hundred words
     rebuilds the overlay's actual bug in one column. */
  @media (max-width:940px){
    .tgrid{grid-template-columns:minmax(0,1fr);grid-template-areas:"stub" "main"}
    .tstub .stick{position:static;max-height:none;overflow:visible}
  }
  .tstub .stick{
    position:sticky;top:26px;
    /* A safety valve, not a design. The stub is short by discipline, but a
       ticket with a gate link, a PR and every disposition on a short laptop
       screen would otherwise pin its own bottom out of reach. */
    max-height:calc(100vh - 52px);overflow:auto;
    padding:5px;margin:-5px;   /* the scroller must not clip the box shadow */
  }
  .tmain .attach{margin:0 0 24px}
  /* A page-width body deserves page-width reading; 17px was the overlay's
     compromise with a 1000px panel. */
  .tmain .desc{font-size:18px;line-height:1.62;margin-bottom:26px}
  .tmain .trail{margin-bottom:26px}
  .tmain .runs{margin-bottom:0}
  /* With a column to spend, the phase bars carry MAGNITUDE: each is drawn
     against the longest phase in its run, and the unused remainder of the
     track is the scale. In the overlay every bar filled its own track and was
     capped at 180px, so an 18-minute plan and a three-hour implement drew
     identically — a chart that looked like it meant something and did not. */
  .tmain .run{padding:15px 18px 17px}
  .tmain .bar{height:16px}
  .tmain .phz{gap:4px}
  .tmain .phz .p{gap:12px;padding:2px 0}
  .tmain .phz .p .nm{min-width:96px}
  .tmain .phz .p .sw{max-width:none;flex:1;height:9px;border-radius:5px}
  .tmain .phz .p .d{min-width:62px;text-align:right}
  .tmain .phz .p .yw{min-width:80px}

  /* The stub leans the other way from the slab, like two cards set down on a
     desk — and it is rotated on purpose, so the margin keeps its job as the
     one straight edge on the board. */
  .stub{padding:0 0 18px;transform:rotate(.55deg)}
  .stub .head{display:flex;justify-content:center;padding:24px 18px 10px}
  .stub .lab{margin:6px 18px 6px}
  .stub .filed{padding:0 18px}
  .stub .f{padding:9px 0 8px;border-bottom:1.5px dotted var(--ink-4)}
  .stub .f:last-child{border-bottom:0}
  .stub .f .k2{display:block;margin-bottom:1px;font-family:ui-monospace,Menlo,monospace;
    font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--ink-3)}
  .stub .f .v{font-size:16px;color:var(--ink);line-height:1.3;overflow-wrap:anywhere}
  .stub .f .v.empty{color:var(--ink-3);font-style:italic}
  .stub .refile{display:block;padding:14px 18px 0;margin:0}
  .stub .refile select{width:100%;margin-top:5px}
  /* Three ranks, not seven buttons in a row: do the work, then file it, then —
     below a torn edge — destroy it. */
  .stub .acts{display:grid;gap:9px;padding:18px 18px 0}
  .stub .acts .btn{width:100%;text-align:center}
  .stub .acts .go{font-size:18px;padding:10px 16px 11px}
  .stub .minor{display:flex;gap:8px;flex-wrap:wrap}
  .stub .minor .btn{width:auto;flex:1 1 auto;font-size:14px;padding:5px 12px 6px}
  .stub .tear{margin:16px 18px 0;padding-top:12px;border-top:2px dashed var(--ink-4)}
  .stub .tear .btn{width:100%;font-size:14px;padding:5px 12px 6px}

  /* The page's stamp is a real impression rather than the badge the overlay
     wore in a table cell: same geometry, three sizes up, struck across the
     head of the stub. It is the first thing the eye lands on and the one thing
     you came to check. Colours mirror the card classes exactly — a ticket must
     not read orange on the board and green on its own page. */
  .stamp.big{font-size:13px;letter-spacing:.3em;padding:9px 20px 10px;
    border-width:3px;transform:rotate(-4deg)}
  .stamp.s-in_progress{color:var(--orange);border-color:var(--orange)}
  .stamp.s-in_review{color:var(--pine-b);border-color:var(--pine-c)}
  .stamp.s-ready{color:var(--pine-a);border-color:var(--pine-b)}
  .stamp.s-idea{color:var(--ink-3);border-color:var(--ink-4);border-style:dashed}
  .stamp.s-shipped{color:var(--pine-a);border-color:var(--pine-a)}
  .stamp.s-cancelled{color:var(--ink-4);border-color:var(--ink-4);opacity:.75}
  /* A stamp lands — once, on arrival. .struck is added only when the VIEW
     changed, never on a re-render: this page is redrawn about once a second
     while an agent runs, and an entrance replayed every second is the wound
     the card stagger already carries. The rotation is repeated in every frame
     or the animation overrides it and the mark straightens out mid-flight. */
  @keyframes strike{
    from{opacity:0;transform:rotate(-4deg) scale(1.75)}
    60%{opacity:1;transform:rotate(-4deg) scale(.94)}
    to{opacity:1;transform:rotate(-4deg) scale(1)}
  }
  .stamp.big.struck{animation:strike .26s cubic-bezier(.2,.8,.3,1.2) backwards}
  @media (prefers-reduced-motion:reduce){.stamp.big.struck{animation:none}}

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
    position:fixed;left:calc(50% + var(--rail-w) / 2);bottom:74px;transform:translateX(-50%) translateY(20px);
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
<button class="rtab" id="rtab" title="the margin — b" aria-label="show or hide the margin"><span class="k sm kb" data-k="b" aria-hidden="true">b</span></button>
<div class="page">
<nav class="rail" id="rail" aria-label="apps and projects"></nav>
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

<div class="veil" id="pacev"><div class="box b4 panel"><div class="pace" id="pacebody"></div></div></div>

<div class="veil" id="helpv"><div class="box b3 panel">
  <div class="detail"><h2>keys</h2></div>
  <div class="helpgrid">
    <div><b>↑↓ / jk</b> — move</div><div><b>⏎</b> — open ticket</div>
    <div><b>s</b> — start work</div><div><b>c</b> — capture (into what you're on)</div>
    <div><b>e</b> — edit the description</div><div><b>⌘⏎</b> — save it, <b>esc</b> — abandon</div>
    <div><b>d</b> — mark done</div><div><b>⌘K / /</b> — palette, apps & projects too</div>
    <div><b>p</b> — open its project / app</div><div><b>m</b> — pace (medians)</div>
    <div><b>b</b> — the margin, open / collapsed</div><div><b>h</b> — completed work, every group</div>
    <div><b>esc</b> — close, then back up a level</div>
    <div><b>⏎</b> on a ticket page — start / attach it</div>
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
  // The current view, derived from location.hash by route(). Selection is
  // OWNED by the view: flat/sel are rebuilt from whatever the current view
  // drew, so s/d/⏎ can never act on a row belonging to a page you left.
  // A ticket page draws one ticket and no list, so there the page IS the row.
  let view = { kind: 'board' };
  let lastViewKey = '';
  // Which doc tab an app page is showing, remembered across live re-renders so
  // an SSE refresh does not snap you back to PROJECT.md mid-read.
  let docTab = 'PROJECT';
  const docCache = new Map();   // slug|NAME -> html

  // The margin: follow the CSS breakpoint until told otherwise, then remember.
  // Nothing is read from the viewport here on purpose — the stylesheet owns the
  // default so a resize keeps working; this only replays an explicit choice.
  const savedRail = localStorage.getItem('smriti-rail');
  if (savedRail) document.documentElement.dataset.rail = savedRail;

  // Completed work: the global default for whether a fold starts open.
  let showCompleted = localStorage.getItem('smriti-completed') === 'shown';
  // Per-section OVERRIDES of that default — a section id in here means "the
  // opposite of the global". In memory, never localStorage: the reveal is for
  // the moment you are in, so it must survive an SSE re-render (which replaces
  // the board's html wholesale, about once a second while an agent runs) but
  // must NOT still be unfolded tomorrow.
  let foldFlips = new Set();
  const foldOpen = (key) => (foldFlips.has(key) ? !showCompleted : showCompleted);

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

  // The gate this ticket is actually parked at. NOT runFor(): that is a bare
  // find() over a bounded union of active and recent runs, which is no promise
  // about which run is current — a ticket with several runs could hand back the
  // wrong one's link. The predicate is the whole answer: awaiting, and with a
  // URL the server already proved is live.
  function gateFor(t){
    return S.runs.find((r) => r.ticket_id === t.id && r.status === 'awaiting' && httpUrl(r.html_url));
  }

  // esc() escapes HTML; it does not validate a scheme. The board builds this URL
  // itself from a validated port, but it renders through the same allowlist as
  // every other stored link rather than being trusted for its provenance.
  function httpUrl(u){ const v = String(u || '').toLowerCase(); return v.startsWith('http://') || v.startsWith('https://'); }

  // The click-through into a live review. data-plan marks it for the event
  // contract in wire(): a link inside a row that is itself clickable has to
  // stop that row from also firing, or you land on the ticket instead of the plan.
  function planLink(r){
    if (!r || !httpUrl(r.html_url)) return '';
    return ' · <a class="planlink" data-plan href="' + esc(r.html_url) + '" target="_blank" rel="noopener">open the plan ↗</a>';
  }

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

  // Every app that has anything to show, ideas last: they are the least
  // actionable thing on the page. Derived from the WORK, never from
  // S.repositories — that table holds a row for every repo you have ever stood
  // in, most of which have no tickets and a machine-generated slug, and an
  // index listing those is noise wearing the shape of navigation.
  // Memoised for the length of one render: the margin asks for it once, the
  // board once, and hueFor once per app. Cleared by route() before anything
  // draws, so it can never outlive a refresh.
  let appsMemo = null;
  function appsWithWork(){
    if (appsMemo) return appsMemo;
    appsMemo = [...new Set(
      S.tickets.map(appOf).concat((S.projects || []).map((p) => p.repo_slug || NO_APP)),
    )].sort((a, b) => (a === NO_APP ? 1 : b === NO_APP ? -1 : a.localeCompare(b)));
    return appsMemo;
  }

  // Stable per-app colour, by position in the sorted app list — so an app keeps
  // its colour on the board and on its own page.
  function hueFor(slug){
    // The same derivation the board and the margin use, not a second copy of
    // it — the copy sorted differently (plain sort vs localeCompare), so a
    // mixed-case slug could take its colour from a different app's position.
    const i = appsWithWork().filter((a) => a !== NO_APP).indexOf(slug);
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
  // Flashes wherever this key is drawn — a keycap in the bar, or the hint on
  // the control that owns it. Not .k-scoped any more, because keys now live in
  // two places and each decides for itself what .hit looks like: the keycap
  // presses down, the hint surfaces. Pressing b makes the margin's own label
  // appear, which is how the mapping gets taught.
  // ms because the two kinds of mark want different holds: a keycap press is a
  // 130ms tap, while surfacing a hint the user has never seen needs long enough
  // to read.
  function tapKey(k, ms){
    const el = document.querySelector('[data-k="'+k+'"]');
    if (el){ el.classList.add('hit'); setTimeout(() => el.classList.remove('hit'), ms || 130); }
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

  // The fold at the bottom of a group. Renders nothing at all when there is
  // nothing finished, so this is never a control that does nothing.
  // Pushes the revealed cards onto the selection list when open: they are
  // tickets like any other, and a card you can see should be a card the arrow
  // keys can reach.
  function historyHtml(list, key){
    const done = list.filter((t) => !isOpen(t)).sort(byStatus);
    if (!done.length) return '';
    const shipped = done.filter((t) => t.status === 'shipped').length;
    const cancelled = done.length - shipped;
    const on = foldOpen(key);
    let h = '<button class="histline' + (on ? ' on' : '') + '" data-fold="' + esc(key) + '"' +
      ' aria-expanded="' + (on ? 'true' : 'false') + '">' +
      '<span class="arrow">' + (on ? '▾' : '▸') + '</span><span class="txt">' +
      (shipped ? 'shipped <b>' + shipped + '</b>' : '') +
      (shipped && cancelled ? ' · ' : '') +
      (cancelled ? 'cancelled <b>' + cancelled + '</b>' : '') + '</span>' +
      // "all", because the key is honest about doing more than the button: this
      // line folds THIS group, h folds every one of them.
      '<span class="kh" aria-hidden="true"><span class="k sm" data-k="h">h</span>all</span></button>';
    if (on){
      // Its own stagger, from zero. cardHtml stamps animation-delay from a
      // board-wide counter, and .card holds the from-state (opacity:0) for the
      // whole delay — so cards unfolded low on a busy board stayed blank for
      // over a second after the click, which reads as a control that did not
      // work. These appear on demand, so they start their own sequence.
      cardIdx = 0;
      h += '<div class="cards folded">';
      for (const t of done){ h += cardHtml(t); flat.push({ id: t.id, kind: 'card' }); }
      h += '</div>';
    }
    return h;
  }

  // ── the margin ───────────────────────────────────────────────────────
  // The app -> project index, redrawn on every render like everything else
  // here. State it needs to remember lives in JS above, never in these nodes,
  // because they are replaced wholesale on each SSE refresh.
  function renderRail(){
    let h = '<div class="rlab">apps</div>';
    // Standing on a ticket marks the app and project it belongs to. The margin
    // used to know only about the two pages that ARE an app or a project, so
    // it went blank on the one view you are deepest inside — which is the
    // opposite of what an index is for.
    const here = view.kind === 'ticket' ? S.tickets.find((t) => t.id === view.id) : null;
    for (const app of appsWithWork()){
      // One pass over the app's tickets, not three: this redraws with the rest
      // of the page about once a second while an agent is running.
      const mine = ticketsIn(app).filter(isOpen);
      const openN = mine.length;
      const projs = projectsIn(app).filter((p) => p.status === 'active');
      const loose = mine.filter((t) => t.project_id == null).length;
      const ideas = app === NO_APP;
      const hue = hueFor(app);
      const cur = !ideas && ((view.kind === 'app' && view.slug === app) || (here && appOf(here) === app));

      // Ideas have no app page to open — the board's own heading guards the
      // same case. Scrolling to the band is the honest destination.
      h += '<div class="ritem' + (cur ? ' on' : '') + (ideas ? ' ideas' : '') + '"' +
        ' role="button" tabindex="0" ' + (ideas ? 'data-ideas="1"' : 'data-app="' + esc(app) + '"') + '>' +
        '<span class="sig' + (ideas ? ' ghost' : '') + '"' +
          (ideas ? '' : ' style="color:' + hue + ';border-color:' + hue + '"') + '>' +
          esc(sigFor(app)) + '</span>' +
        '<span class="nm">' + esc(appLabel(app)) + '</span>' +
        '<span class="n">' + openN + '</span></div>';

      for (const p of projs){
        const on = (view.kind === 'project' && Number(view.id) === Number(p.id))
          || Boolean(here && here.project_id != null && Number(here.project_id) === Number(p.id));
        const n = mine.filter((t) => Number(t.project_id) === Number(p.id)).length;
        h += '<div class="rproj' + (on ? ' on' : '') + '" role="button" tabindex="0" data-proj="' + p.id + '">' +
          '<span class="arrow">▸</span><span class="nm">' + esc(p.name) + '</span>' +
          '<span class="n">' + n + '</span></div>';
      }
      // A "loose" line under the only group would be noise — same rule the
      // board's own grouping follows.
      if (loose && projs.length){
        h += '<div class="rproj loose" role="button" tabindex="0" data-loose="' + esc(app) + '">' +
          '<span class="arrow">▸</span><span class="nm">loose</span>' +
          '<span class="n">' + loose + '</span></div>';
      }
    }
    $('#rail').innerHTML = h;
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
          ' · <b>' + esc(r.last_phase || 'gate') + ' — needs a decision</b>' + held +
          planLink(r) + '</div></div>';
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

    cardIdx = 0;
    for (const app of appsWithWork()){
      const all = ticketsIn(app);
      // Completed work is completed work: the h toggle decides whether it shows,
      // and nothing else does.
      //
      // The board used to keep a day's residue of what you finished, so a card
      // marked done would not evaporate under the cursor. But that residue sat
      // OUTSIDE the fold, which meant a shipped ticket stayed on the board with
      // completed work switched off and no way to dismiss it — the toggle
      // appeared broken because for those cards it was. Cancelled tickets on the
      // next line were never given the same exemption, so shipped was the odd
      // one out. Predictable beats gentle here: press h to see what finished.
      const items = all
        .filter((t) => t.status !== 'shipped')
        .filter((t) => t.status !== 'cancelled')
        .sort(byStatus);
      const projs = projectsIn(app).filter((p) => p.status === 'active');
      const done = all.filter((t) => !isOpen(t) && !items.includes(t));
      // An app with nothing live stays OFF the board even though it has a
      // history — the board answers "what needs attention now". Its record is
      // still one click away, in the margin and on its own page.
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
      // Counted against everything the app has ever held, minus what is still
      // on the board above — so the number never double-counts today's residue.
      html += historyHtml(done, 'board:' + app);
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
    h += historyHtml(items, 'app:' + slug);
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
    h += historyHtml(items, 'project:' + p.id);
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
        // /begin, not /bootstrap: bootstrapping folded into the flow when the
        // opinion layer was retired, and an empty state naming a command that
        // no longer exists is worse than no hint at all.
        '<div class="cmd">' + (docTab === 'PROJECT' ? '/begin' : '/design-consultation') + '</div></div>';
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
    appsMemo = null;
    const parts = (location.hash || '').replace('#', '').split('/').filter(Boolean);
    if (parts[0] === 'r' && parts[1]) view = { kind: 'app', slug: decodeURIComponent(parts[1]) };
    else if (parts[0] === 'p' && parts[1]) view = { kind: 'project', id: Number(decodeURIComponent(parts[1])) };
    else if (parts[0] === 't' && parts[1]) view = { kind: 'ticket', id: Number(decodeURIComponent(parts[1])) };
    else view = { kind: 'board' };

    const key = view.kind + ':' + (view.slug ?? view.id ?? '');
    const changed = key !== lastViewKey;
    lastViewKey = key;
    // The attach command from a start is carried across the navigation it
    // triggers, and dropped the moment you are looking at anything else — an
    // unscoped stash surfaces one ticket's command on the next ticket's page.
    if (!(view.kind === 'ticket' && pendingAttach && pendingAttach.id === view.id)) pendingAttach = null;
    // Selection is owned by the view: cleared when you move between views, kept
    // when the view you are on simply re-renders (which SSE does about once a
    // second while an agent is running).
    //
    // Kept by WHAT is selected, not by where it sat. Unfolding completed work
    // inserts cards into the middle of the list, so restoring a bare index
    // moved the highlight onto a different ticket — and the next d would have
    // marked that one done instead. Matched on kind too, because a ticket can
    // appear both in "waiting on you" and as a card.
    const keepRef = changed ? null : (sel >= 0 ? flat[sel] : null);
    flat = []; sel = -1;

    // The treeline is the board's horizon, not a page ornament.
    document.querySelector('.trees').classList.toggle('off', view.kind !== 'board');
    // The margin first: it marks the current app or project, and every view's
    // wire() call below binds it along with the sheet.
    renderRail();
    if (view.kind === 'app') renderApp(view.slug);
    else if (view.kind === 'project') renderProject(view.id);
    else if (view.kind === 'ticket') renderTicket(view.id, changed);
    else renderBoard();

    sel = keepRef
      ? flat.findIndex((f) => f.id === keepRef.id && f.kind === keepRef.kind)
      : -1;
    // A ticket page has exactly one ticket and no list to move within, so the
    // page is its own selection — which is what keeps s/d/⏎ working there
    // without teaching them a fourth rule.
    if (view.kind === 'ticket' && sel < 0 && flat.length) sel = 0;
    paintSel();
  }
  const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };

  // Scroll the board to an app's band. Assigning location.hash updates it
  // synchronously but fires hashchange as a LATER task, so navigating and then
  // looking for the heading finds the page you were still on — the lookup
  // missed every time, and the ideas row reported "no ideas captured yet" while
  // ideas sat on the board behind it. Render first, then look.
  function jumpToBand(slug){
    if (view.kind !== 'board'){ location.hash = ''; route(); }
    const band = document.querySelector('.sheet .phead[data-app="' + slug + '"]');
    if (band) band.scrollIntoView({ block: 'start', behavior: 'smooth' });
    else if (slug === NO_APP) toast('no ideas captured yet — press <b>c</b>');
  }

  // Delegated wiring, re-run after every render. One place, so a control added
  // to a page cannot quietly miss its handler.
  function wire(){
    const $$ = (s) => document.querySelectorAll('.sheet ' + s);
    // A link inside a clickable row needs the row to stay out of its way.
    // Stopping the click covers the keyboard too: Enter on a focused anchor
    // dispatches a click that bubbles exactly like a pointer one, so one
    // handler answers both. Order does not matter here — the stop happens at
    // the anchor, and the row's listener is an ancestor.
    $$('[data-plan]').forEach((el) => {
      el.addEventListener('click', (e) => { e.stopPropagation(); });
    });
    $$('[data-tid]').forEach((el) => {
      el.addEventListener('click', () => { const id = Number(el.dataset.tid); if (id) go('#/t/' + id); });
    });
    // The ticket page's dispositions and its re-file select. Here rather than
    // beside the render, because wire() reaches the whole sheet — the by-hand
    // binding the overlay ended with existed only because a veil was outside
    // this function's reach.
    $$('[data-act]').forEach((b) => b.addEventListener('click', () => ticketAct(b)));
    const rf = document.querySelector('.sheet #refile');
    if (rf) rf.addEventListener('change', () => refileTicket(rf));
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
    $$('[data-fold]').forEach((el) => el.addEventListener('click', () => {
      const key = el.dataset.fold;
      if (foldFlips.has(key)) foldFlips.delete(key); else foldFlips.add(key);
      route();
      // route() replaced the button that fired this, so focus fell to <body>.
      // Put it back on the control the user is standing on, or activating the
      // fold by keyboard costs them their place on the page.
      const again = document.querySelector('.sheet [data-fold="' + key + '"]');
      if (again && document.activeElement === document.body) again.focus();
    }));
    // Back is a LADDER, one rung at a time — ticket → project → app → board —
    // which is also what Escape means, since it walks back up by clicking this.
    // It used to know a single step (a project going up to its app), so a
    // ticket would have skipped its project and landed on the board.
    const back = document.querySelector('.sheet [data-back]');
    if (back) back.addEventListener('click', () => {
      if (view.kind === 'project'){
        const p = projectById(view.id);
        if (p && p.repo_slug){ go('#/r/' + encodeURIComponent(p.repo_slug)); return; }
      }
      if (view.kind === 'ticket'){
        const t = S.tickets.find((x) => x.id === view.id);
        if (t && t.project_id != null){ go('#/p/' + t.project_id); return; }
        if (t && t.repo_slug){ go('#/r/' + encodeURIComponent(t.repo_slug)); return; }
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

  // The description editor, shared by all three pages — the app's, the
  // project's, and now the ticket's body. There used to be a second id pair
  // (#desc/#descedit) because the ticket lived in an overlay; the two collided
  // once and saved an app's text into a ticket body. One surface, one pair.
  function wireDescEditor(){
    const d = $('#pagedesc'), ta = $('#pagedescedit');
    if (!d || !ta) return;
    const kind = d.dataset.edit;
    // Always the CURRENTLY stored text, never the copy captured when the page
    // was drawn: an agent may have rewritten it since, and this is what decides
    // whether a PATCH is sent at all.
    const current = () => (kind === 'repo'
      ? ((repoBySlug(view.slug) || {}).description || '')
      : kind === 'ticket'
        ? ((S.tickets.find((x) => x.id === Number(d.dataset.ticket)) || {}).body || '')
        : ((projectById(Number(d.dataset.pid)) || {}).description || ''));
    const save = async () => {
      const next = ta.value.trim();
      ta.classList.remove('on'); d.style.display = '';
      if (next === current().trim()) return;
      const url = kind === 'repo' ? '/api/repos/' + encodeURIComponent(view.slug)
        : kind === 'ticket' ? '/api/tickets/' + d.dataset.ticket
        : '/api/projects/' + d.dataset.pid;
      // A ticket's prose is its body; an app's and a project's is a column
      // called description. Same box, two field names underneath.
      const payload = kind === 'ticket' ? { body: next } : { description: next };
      try {
        await api(url, { method: 'PATCH', body: JSON.stringify(payload) });
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

  // The margin's open/collapsed state. The CSS breakpoint owns the default, so
  // the first press has to ask the stylesheet what is on screen right now
  // rather than guess — otherwise toggling on a narrow window appears to do
  // nothing the first time.
  function toggleRail(){
    // On a phone the margin is display:none and its width is pinned to 0, so
    // there is nothing to toggle — and writing the choice anyway would let a
    // phone session decide how the next desktop session opens.
    if (!$('#rail').offsetParent) return;
    const collapsed = getComputedStyle(document.documentElement)
      .getPropertyValue('--rail-detail').trim() === 'none';
    const next = collapsed ? 'open' : 'collapsed';
    document.documentElement.dataset.rail = next;
    localStorage.setItem('smriti-rail', next);
    // The margin alone: the width is pure CSS, and the sheet has no reason to
    // be torn down and re-animated because a nav column changed shape.
    renderRail(); tapKey('b', 900);
  }

  // Completed work, globally. Clearing the per-section overrides makes this
  // read as "expand/collapse all", which is what pressing it twice implies.
  function toggleCompleted(){
    showCompleted = !showCompleted;
    foldFlips = new Set();
    localStorage.setItem('smriti-completed', showCompleted ? 'shown' : 'hidden');
    // After the render, not before: route() replaces the fold lines, and the
    // mark would be put on a node that no longer exists by the time it shows.
    route(); tapKey('h', 900);
    toast(showCompleted ? 'showing what finished' : 'completed work folded away', 1400);
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
  // tick and all three reuse #pagedesc, and a render started before you clicked
  // into the editor can land after it opened. So a result is only allowed in
  // while it still belongs where it was sent: same live node, same generation,
  // nothing open over it. Anything late is dropped.
  //
  // The ticket body used to be exempt, because an overlay was not rebuilt by
  // the SSE path. As a page it is redrawn like everything else, which is what
  // makes these guards load-bearing for it rather than merely prudent.
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
      // stopPropagation, not just preventDefault: on a ticket page the global
      // handler treats Enter as "start this ticket", which cuts a worktree and
      // spawns a session. Opening an editor must not also do that.
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

  // The attach command produced by a start, carried across the navigation that
  // start now triggers. Keyed by ticket and dropped by route() the moment you
  // are looking at anything else — an unscoped stash puts one ticket's command
  // on the next ticket's page after a later restart.
  let pendingAttach = null;

  async function startTicket(t){
    if (!t) return;
    tapKey('s');
    const live = Boolean(sessionFor(t));
    toast(live ? 'finding the session for <b>#' + t.id + '</b>…'
               : 'cutting a worktree for <b>#' + t.id + '</b>…', 8000);
    try {
      runCache.delete(t.id);          // a start is exactly when the trace moves
      const res = await api('/api/tickets/' + t.id + '/start', { method: 'POST', body: '{}' });
      // Land on the ticket wherever start was pressed from — the board, the
      // palette, or the page itself. The command has to be somewhere you can
      // read it long enough to copy, which a toast is not.
      pendingAttach = { id: t.id, res };
      go('#/t/' + t.id);
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
    if (view.kind === 'ticket'){
      // Beside the ticket you are reading — its project and its app.
      const cur = S.tickets.find((x) => x.id === view.id);
      try { await addTicket(title, {
        project: cur && cur.project_id != null ? String(cur.project_id) : '',
        repo: cur && cur.repo_slug ? cur.repo_slug : '',
      }); }
      catch (e) { toast('could not add: ' + esc(e.message)); }
      return;
    }
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

  // ── the ticket page ──────────────────────────────────────────────────
  // A ticket is a job card and this is that card laid flat. It used to be an
  // overlay, which cost it a URL, the back button, and any room to grow: the
  // run trace was already the tallest thing on it, and #11 and #12 each want a
  // block of their own.
  //
  // Almost nothing here is new behaviour — it is the overlay's behaviour on a
  // surface that has an address. What DID go away is the by-hand binding that
  // used to close this function: wire() is scoped to .sheet and could not
  // reach a veil, so the overlay had to bind its own jumps and doc links. On a
  // page wire() reaches all of it.
  function renderTicket(id, changed){
    const t = S.tickets.find((x) => x.id === id);
    // Same answer a missing project already gives: back to the board rather
    // than a blank page. A deleted ticket is a link that outlived its subject.
    if (!t){ location.hash = ''; return; }
    const docs = docsFor(t);
    const proj = t.project_id != null ? projectById(t.project_id) : null;
    const app = appOf(t);
    const live = Boolean(sessionFor(t));
    const gate = gateFor(t);   // already scheme-checked
    const open = t.status !== 'shipped' && t.status !== 'cancelled';

    $('#eye').innerHTML = 'ticket · <b>#' + t.id + '</b>';
    $('#waitwrap').innerHTML = '';

    // Up one level, not out to the board: a filed ticket belongs among its
    // siblings, and that is where you were going next anyway.
    let h = '<button class="back" data-back><span class="arr">←</span> ' +
      esc(proj ? proj.name : (t.repo_slug ? appLabel(app) : 'the board')) + '</button>';

    // The head of the card. The number IS the monogram — the tile the app and
    // project pages give their initials — so the page says which band it came
    // from before you read a word, and the separate #id eyebrow goes away.
    // The mono line is the branch, which is the same register as an app's path.
    const hue = hueFor(app);
    const runs = (runCache.get(t.id) || {}).runs || ticketRuns(t.id);
    h += '<div class="box slab">' +
      '<div class="bigsig" style="color:' + hue + ';border-color:' + hue + '">#' + t.id + '</div>' +
      '<div class="who"><h1>' + esc(t.title) + '</h1>' +
      '<div class="path">' + (t.branch ? esc(t.branch) : '<i>not started yet</i>') +
        (t.pr_url && httpUrl(t.pr_url)
          ? ' · <a href="' + esc(t.pr_url) + '" target="_blank" rel="noopener">open PR ↗</a>' : '') +
      '</div><div class="tally" id="ttally">' + tallyTime(runs) + '</div>' +
      '</div></div>';

    h += '<div class="tgrid"><div class="tmain">';
    // The attach command goes at the TOP of the wide column, not in the stub:
    // it is a long mono line that would break into five ragged pieces at 268px,
    // and the button that produced it is still on screen anyway.
    h += '<div class="attach" id="attach"></div>';
    h += '<div class="lab">what this is</div>';
    // data-ticket, NOT data-tid: that attribute is the card contract, and
    // wire() makes anything wearing it navigate to its ticket. On the
    // description that fired on the same click as the editor, re-rendered the
    // page out from under it, and left the textarea open on a detached node.
    h += descBox('id="pagedesc" data-edit="ticket" data-ticket="' + t.id + '"', t.body, 'add a description…');
    h += '<textarea class="descedit" id="pagedescedit" placeholder="what this actually is, and why">' +
      esc(t.body || '') + '</textarea>';
    h += trailHtml(docs);
    h += '<div class="lab">where the time went</div><div class="runs" id="runs"></div>';
    h += '</div>';

    // The stub: where this is filed, and everything you can do to it, in one
    // column that does not scroll away behind a six-hundred-word body.
    h += '<div class="tstub"><div class="stick"><div class="box b4 stub">';
    h += '<div class="head"><span class="stamp big s-' + esc(t.status) + (changed ? ' struck' : '') + '">' +
      esc(STATUS[t.status] || t.status) + '</span></div>';
    h += '<div class="lab">filed under</div><div class="filed">' +
      '<div class="f"><span class="k2">app</span><span class="v' + (t.repo_slug ? '' : ' empty') + '">' +
        (t.repo_slug
          ? '<span class="jump" data-app="' + esc(t.repo_slug) + '">' + esc(appLabel(t.repo_slug)) + '</span>'
          : 'no app yet') + '</span></div>' +
      '<div class="f"><span class="k2">project</span><span class="v' + (proj ? '' : ' empty') + '">' +
        (proj
          ? '<span class="jump" data-proj="' + proj.id + '">' + esc(proj.name) + '</span>'
          : 'loose in the app') + '</span></div>' +
      '</div>';
    // Re-filing, the other half of "tickets attached to projects": only offered
    // within the ticket's own app, because moving between apps means moving a
    // worktree and is a CLI decision, not a dropdown one.
    if (t.repo_slug){
      const opts = projectsIn(t.repo_slug).filter((p) => p.status === 'active');
      h += '<div class="refile"><span>project</span><select id="refile">' +
        '<option value="">— loose in ' + esc(appLabel(t.repo_slug)) + ' —</option>' +
        opts.map((p) => '<option value="' + p.id + '"' +
          (Number(t.project_id) === Number(p.id) ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('') +
        '</select></div>';
    }
    h += '<div class="acts">';
    if (open) h += '<button class="btn go" data-act="start">' + (live ? 'attach ⏎' : 'start ⏎') + '</button>';
    // A gate IS the primary action while it is open, so it ranks with start
    // rather than with the dispositions. httpUrl is shared with planLink:
    // esc() escapes HTML but does not validate a scheme, and without the
    // allowlist md.ts applies to document links a stored javascript: url would
    // run against this page's own authenticated API when clicked.
    if (gate) h += '<a class="btn go" href="' + esc(gate.html_url) + '" target="_blank" rel="noopener">open the plan ↗</a>';
    h += '<div class="minor">';
    if (live) h += '<button class="btn" data-act="restart">restart</button>';
    if (open) h += '<button class="btn" data-act="done">mark done</button>';
    if (t.status !== 'cancelled') h += '<button class="btn" data-act="cancel">cancel</button>';
    else h += '<button class="btn" data-act="revive">bring it back</button>';
    h += '</div></div>';
    h += '<div class="tear"><button class="btn danger" data-act="delete">delete</button></div>';
    h += '</div></div></div></div>';

    $('#plots').innerHTML = h;
    flat.push({ id: t.id, kind: 'card' });
    wire();
    loadRuns(t.id);
    if (pendingAttach && pendingAttach.id === t.id) showAttach(pendingAttach.res);
  }

  const ticketRuns = (id) => S.runs.filter((r) => r.ticket_id === id);
  // Where an app page counts tickets, a ticket counts hours. Painted first from
  // the runs already on hand — /api/state carries a recency-bounded window, so
  // that is right in almost every case — and corrected by loadRuns, which is
  // the one read that promises every run.
  function tallyTime(runs){
    if (!runs.length) return '<div><b>—</b> not started yet</div>';
    let total = 0, agent = 0, you = 0;
    for (const r of runs){ total += runSecs(r); agent += r.agent_s || 0; you += r.you_s || 0; }
    return '<div><b>' + fmtDur(total) + '</b> total</div>' +
      '<div class="agent"><b>' + fmtDur(agent) + '</b> agent time</div>' +
      (you > 0 ? '<div class="yours"><b>' + fmtDur(you) + '</b> your time</div>' : '');
  }

  // The dispositions. Every one of these was in the overlay and every one of
  // them comes along — including the two-press delete confirm, which is the
  // only thing standing between a misclick and a ticket that is gone.
  async function ticketAct(b){
    const t = view.kind === 'ticket' ? S.tickets.find((x) => x.id === view.id) : null;
    if (!t) return;
    const act = b.dataset.act;
    if (act === 'start') startTicket(t);
    if (act === 'done'){ markDone(t); go(''); }
    if (act === 'restart'){
      toast('restarting the session for <b>#' + t.id + '</b>…', 8000);
      try {
        runCache.delete(t.id);
        const res = await api('/api/tickets/' + t.id + '/restart', { method: 'POST', body: '{}' });
        pendingAttach = { id: t.id, res };
        refresh();
      } catch (e) { toast('could not restart: ' + esc(e.message)); }
    }
    if (act === 'cancel'){
      try { await api('/api/tickets/' + t.id + '/cancel', { method: 'POST', body: '{}' });
            toast('#' + t.id + ' cancelled — still there under all'); refresh(); }
      catch (e) { toast('could not cancel: ' + esc(e.message)); }
    }
    if (act === 'revive'){
      try { await api('/api/tickets/' + t.id + '/revive', { method: 'POST', body: '{}' });
            toast('#' + t.id + ' is back'); } catch (e) { toast('could not revive: ' + esc(e.message)); }
      refresh();
    }
    if (act === 'delete'){
      if (b.dataset.armed !== '1'){
        b.dataset.armed = '1'; b.textContent = 'really delete?';
        setTimeout(() => { b.dataset.armed = '0'; b.textContent = 'delete'; }, 4000);
        return;
      }
      // Out to the board first: the page you are standing on is about to stop
      // having a subject, and route() would bounce you anyway.
      try { await api('/api/tickets/' + t.id, { method: 'DELETE' }); toast('#' + t.id + ' deleted'); go(''); refresh(); }
      catch (e) { toast('could not delete: ' + esc(e.message)); }
    }
  }
  async function refileTicket(sel2){
    const t = view.kind === 'ticket' ? S.tickets.find((x) => x.id === view.id) : null;
    if (!t) return;
    // '' is a real choice — "take it out of its project" — so it is sent as
    // null rather than omitted, which would mean "leave it alone".
    const project = sel2.value ? sel2.value : null;
    try {
      await api('/api/tickets/' + t.id, { method: 'PATCH', body: JSON.stringify({ project }) });
      toast(project ? 'filed into ' + esc(sel2.options[sel2.selectedIndex].text) : 'now loose in the app');
      await refresh();
    } catch (e) { toast('could not re-file: ' + esc(e.message)); }
  }
  // ── where the time went ──────────────────────────────────────────────
  // Fetched PER TICKET rather than filtered out of S.runs: /api/state carries
  // a recency-bounded window (enough to draw cards), so an older run would
  // simply be missing here — the one place that promises every run.
  //
  // And REMEMBERED, because the surface changed under it. The overlay was
  // built once and never rebuilt; a page is redrawn on every SSE tick, about
  // once a second while an agent runs. This is two rounds of fetching — the
  // run list, then a call per run — and each spawns sqlite behind the server.
  // Both rounds are cached together, as the assembled html: caching the list
  // alone still costs a call per run on the next redraw, and caching only the
  // breakdowns flashes an empty trace while the list comes back. The "no runs"
  // answer is cached too, or a ticket that has never run re-asks forever.
  const runCache = new Map();     // ticket id -> { at, live, runs, html }
  const RUN_TTL_MS = 10000;

  async function loadRuns(ticketId){
    const box = $('#runs');
    if (!box) return;
    const hit = runCache.get(ticketId);
    if (hit){
      if (box.innerHTML !== hit.html) box.innerHTML = hit.html;
      // A trace only moves while a run is open, and /api/state already reports
      // that for free on every tick — so a run started from a terminal is
      // noticed without polling this endpoint for tickets that are simply
      // finished. The elapsed clock keeps up in between on its own: tick()
      // rewrites [data-live] text without a re-render.
      const moving = hit.live || S.runs.some((r) => r.ticket_id === ticketId && !r.ended_at);
      if (!moving || Date.now() - hit.at < RUN_TTL_MS) return;
    }
    let runs;
    try { runs = (await api('/api/runs?ticket=' + ticketId)).runs || []; }
    catch (e) {
      // A ticket with no runs comes back as an empty list, not an error — so
      // the only things reaching here are a broken store or a dead server.
      // Swallowing them renders "never run" for "cannot read", which is the
      // same lie the 503 on /api/state exists to prevent. Only worth saying
      // once, though: a stale trace is already on screen from the cache.
      if (!hit) toast('could not read the trace: ' + esc(e.message), 5000);
      return;
    }
    const stale = () => !(view.kind === 'ticket' && view.id === ticketId) || !$('#runs');
    if (!runs.length){
      const empty = '<div class="box b3"><div class="nothing">no runs yet' +
        '<div class="cmd">press s to cut a worktree and start</div></div></div>';
      runCache.set(ticketId, { at: Date.now(), live: false, runs, html: empty });
      if (!stale() && $('#runs').innerHTML !== empty) $('#runs').innerHTML = empty;
      paintTally(ticketId, runs);
      return;
    }
    if (stale()) return;
    $('#runs').innerHTML = runs.map((r) => runShell(r)).join('');
    // Concurrently, not one after another: each of these spawns sqlite behind
    // the server, and awaiting them in sequence made opening a ticket with
    // several runs take as long as all of them put together.
    const bodies = await Promise.all(runs.map(async (r) => {
      try { const d = await api('/api/run/' + r.run_uid); return phaseBreakdown(d.phases || [], d.totals || {}); }
      catch { return ''; }
    }));
    // The view may have moved on while those were in flight; writing into a
    // detached node is harmless, caching a half-built one is not.
    if (stale()) return;
    const box2 = $('#runs');
    runs.forEach((r, i) => {
      const el = box2.querySelector('[data-run="' + r.run_uid + '"] .bd');
      if (el) el.innerHTML = bodies[i];
    });
    runCache.set(ticketId, {
      at: Date.now(), live: runs.some((r) => !r.ended_at), runs, html: box2.innerHTML,
    });
    paintTally(ticketId, runs);
  }
  // The header tally, corrected once every run is known. /api/state's window is
  // bounded, so the first paint can undercount a ticket with a long history.
  function paintTally(ticketId, runs){
    if (!(view.kind === 'ticket' && view.id === ticketId)) return;
    const el = $('#ttally');
    if (el) el.innerHTML = tallyTime(runs);
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
    // Each phase's lane is drawn against the LONGEST phase in the run, not
    // filled to its own width and split by ratio. Filled bars carried a ratio
    // and no magnitude, which is why they had to be capped at 180px — an
    // 18-minute plan and a three-hour implement drew identically, and the
    // unused remainder of the track now IS the scale.
    const maxP = Math.max(...phases.map((p) => p.total_s || 0)) || 1;
    const rows = phases.map((p) => {
      const t = p.total_s || 0;
      const aw = (100 * (p.agent_s || 0) / maxP).toFixed(2) + '%';
      const yw = (100 * (p.you_s || 0) / maxP).toFixed(2) + '%';
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
        : view.kind === 'app' ? ' into ' + appLabel(view.slug)
        : view.kind === 'ticket' ? ' beside this one' : '';
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
        palItems.push({ label: '#' + t.id + ' ' + t.title, r: STATUS[t.status] || t.status, act: () => go('#/t/' + t.id) });
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
    ['palv','helpv','pacev'].forEach((id) => $('#' + id).classList.remove('on'));
  }

  // ── keyboard ─────────────────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    const inPal = $('#palv').classList.contains('on');
    const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
    // A focused link owns its own Enter. Without this the board's Enter would
    // also fire — starting or attaching the ticket behind the link you were
    // actually trying to follow.
    const onLink = e.target && typeof e.target.closest === 'function' && e.target.closest('a[href]');

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'){ e.preventDefault(); inPal ? closeAll() : palOpen(); return; }
    if (e.key === 'Escape'){
      // On a page with nothing open, esc is "go back up" rather than a no-op,
      // one rung at a time: ticket → its project → its app → the board.
      const anyOpen = ['palv','helpv','pacev'].some((id) => $('#' + id).classList.contains('on'));
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
    if (onLink && (e.key === 'Enter' || e.key === ' ')) return;

    const t = selectedTicket();
    switch (e.key){
      case 'ArrowDown': case 'j': e.preventDefault(); move(1); break;
      case 'ArrowUp': case 'k': e.preventDefault(); move(-1); break;
      // On a ticket page ⏎ starts or attaches it — what it meant with the
      // overlay open, now carried by the page rather than by a module flag.
      // Everywhere else it opens what is selected.
      case 'Enter': tapKey('Enter');
        if (view.kind === 'ticket' && t) startTicket(t);
        else if (t) go('#/t/' + t.id);
        break;
      case 's': startTicket(t); break;
      case 'd': markDone(t); break;
      case 'c': case '/': e.preventDefault(); tapKey('c'); palOpen(); break;
      case '?': tapKey('?'); $('#helpv').classList.add('on'); break;
      case 'm': openPace(); break;
      case 't': toggleTheme(); break;
      case 'b': toggleRail(); break;
      case 'h': toggleCompleted(); break;
      case 'r': refresh(); toast('refreshed'); break;
      // e edits whichever description is in front of you. Until now the only
      // way into an editor was a mouse click, on a board that is otherwise
      // entirely keyboard-driven. One id pair since the ticket became a page,
      // so there is nothing left to branch on.
      //
      // help and pace have no description behind them, and focusing a textarea
      // underneath one of those puts every keystroke somewhere invisible AND
      // stops refresh() re-rendering, since isEditing() then reports true.
      case 'e': {
        if (['helpv', 'pacev'].some((id) => $('#' + id).classList.contains('on'))) break;
        const opened = startEdit($('#pagedesc'), $('#pagedescedit'));
        // Only claim the key when it did something — the footer chip flashing
        // on a view with no description reads as "that worked".
        if (opened){ e.preventDefault(); tapKey('e'); }
        break;
      }
      // p goes up one level from whatever you are on — the one key that
      // navigates between the levels without reaching for the mouse.
      case 'p': {
        tapKey('p');
        if (view.kind === 'ticket' && t){
          if (t.project_id != null) go('#/p/' + t.project_id);
          else if (t.repo_slug) go('#/r/' + encodeURIComponent(t.repo_slug));
        }
        else if (view.kind === 'board' && t && t.project_id != null) go('#/p/' + t.project_id);
        else if (view.kind === 'board' && t && t.repo_slug) go('#/r/' + encodeURIComponent(t.repo_slug));
        else if (view.kind === 'project'){
          const pr = projectById(view.id);
          if (pr && pr.repo_slug) go('#/r/' + encodeURIComponent(pr.repo_slug));
        }
        break;
      }
    }
  });
  // The margin is bound ONCE, by delegation on a container that renderRail
  // never replaces. That is what lets b redraw the margin alone instead of
  // re-rendering the whole board — which was replaying every card's entrance
  // animation on each press.
  function railActivate(e){
    const el = e.target.closest('[data-app],[data-proj],[data-ideas],[data-loose]');
    if (!el) return;
    if (el.dataset.proj) go('#/p/' + el.dataset.proj);
    else if (el.dataset.loose) jumpToBand(el.dataset.loose);
    else if (el.dataset.ideas) jumpToBand(NO_APP);
    else if (el.dataset.app) go('#/r/' + encodeURIComponent(el.dataset.app));
  }
  $('#rail').addEventListener('click', railActivate);
  $('#rail').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); railActivate(e); }
  });
  $('#rtab').addEventListener('click', toggleRail);
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
    if (!document.hidden){ docCache.clear(); mdFailed.clear(); runCache.clear(); refresh(); }
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
