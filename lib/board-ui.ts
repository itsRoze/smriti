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
    --pine-a:#2E5C43; --pine-b:#3F7355; --pine-c:#58906B; --pine-rgb:88,144,107;
    --tree:#2E5C43; --live-bg:#FFF4EC; --attach-bg:#F2F7EE;
    --sh:30,64,50; --veil:rgba(30,64,50,.18); --dust:.06;
    --hi-wash:.55; --hi-text:var(--ink-2);
    /* The one curve this board moves on. Was written inline in the card
       entrance; promoted to a token when reordering needed the same spring so
       there would be exactly one place to change how the whole thing feels.
       Deliberately outside the theme blocks — motion does not change with the
       light. */
    --spring:cubic-bezier(.2,.9,.3,1.25);
  }
  @media (prefers-color-scheme: dark){
    :root{
      --paper:#1B2422; --paper-2:#232E2B; --grid:#26332F;
      --ink:#E7EDE8; --ink-2:#BCCBC4; --ink-3:#7E9189; --ink-4:#4E5D57;
      --hi:#EBCB8B; --hi-rgb:235,203,139; --orange:#D08770;
      --pine-a:#A3BE8C; --pine-b:#8FBCBB; --pine-c:#88C0D0; --pine-rgb:136,192,208;
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
    --pine-a:#A3BE8C; --pine-b:#8FBCBB; --pine-c:#88C0D0; --pine-rgb:136,192,208;
    --tree:#7E9C86; --live-bg:#2E2A27; --attach-bg:#22302E;
    --sh:0,0,0; --veil:rgba(0,0,0,.55); --dust:.10;
    --hi-wash:.20; --hi-text:var(--hi);
  }
  :root[data-theme="light"]{
    --paper:#F7F4E9; --paper-2:#FDFBF3; --grid:#D9DCC8;
    --ink:#1E4032; --ink-2:#3D5F4A; --ink-3:#7A9182; --ink-4:#AFC0B2;
    --hi:#F2E85C; --hi-rgb:242,232,92; --orange:#E2703A;
    --pine-a:#2E5C43; --pine-b:#3F7355; --pine-c:#58906B; --pine-rgb:88,144,107;
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
  /* :root .rail, not .rail — a media query adds no specificity, and .rail and
     .rtab both set display in their own rules further down the sheet, so a
     bare selector here loses on source order and the margin was never actually
     hidden on a phone: it collapsed to a 0-width sliver with its border still
     drawn and its tab hanging half off the left edge. */
  @media (max-width:700px){:root,:root[data-rail]{--rail-w:0px} :root .rail,:root .rtab{display:none}}

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
  /* Subordinate to the gates above it, and visibly so: a pine rule down the
     side instead of the highlighter wash, smaller type, no per-row selection
     highlight competing with a real decision. */
  .wait .freedgrp{margin-top:18px;padding:10px 0 2px 14px;border-left:3px solid var(--pine-c)}
  .wait .freedgrp .gh{
    font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.16em;
    text-transform:uppercase;color:var(--pine-b);margin-bottom:7px}
  .wait .freedrow{
    display:flex;align-items:baseline;gap:10px;padding:5px 6px;cursor:pointer;
    border-radius:8px;font-size:16px;color:var(--ink-2)}
  .wait .freedrow.sel{background:rgba(var(--pine-rgb),.14);box-shadow:inset 3px 0 0 var(--pine-c)}
  .wait .freedrow .fid{font-family:ui-monospace,Menlo,monospace;font-size:11px;color:var(--ink-3)}
  .wait .freedrow .fnm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .wait .freedrow .why{
    margin-left:auto;font-family:ui-monospace,Menlo,monospace;font-size:10px;
    letter-spacing:.12em;text-transform:uppercase;color:var(--pine-b);white-space:nowrap}

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
  /* A row that exists on screen before the server has been told. Dimmed rather
     than skeletonised: the title is real and worth reading, only its identity
     is pending. */
  .card.pend{opacity:.62}
  .card.pend .st{font-style:italic}
  .slab h1{font-size:32px;font-weight:400;margin:0 0 4px;line-height:1.15;text-wrap:balance}
  /* The project name IS the rename control, so it has to look touchable without
     turning a heading into a button. Same highlighter wash the stub's editable
     fields use, and the same pencil the description box shows on hover — this
     is one more editable value, not a new kind of thing. */
  .slab h1.rename{position:relative;cursor:pointer;outline:none;display:inline-block;
    border-radius:10px;padding:0 34px 2px 8px;margin-left:-8px;
    transition:background .12s ease}
  .slab h1.rename:hover,.slab h1.rename:focus-visible{background:rgba(var(--hi-rgb),.34)}
  .slab h1.rename:focus-visible{box-shadow:0 0 0 2.5px var(--hi)}
  .slab h1.rename::after{
    content:'✎';position:absolute;top:50%;right:9px;transform:translateY(-50%);
    font-size:15px;color:var(--ink-3);opacity:0;transition:opacity .12s ease}
  .slab h1.rename:hover::after,.slab h1.rename:focus-visible::after{opacity:1}
  /* The tear-off strip a danger zone sits below. Defined once here and
     narrowed for the stub further down, rather than written twice: the pair had
     already drifted while the two copies were only kept apart by specificity. */
  .tear{margin:34px 0 0;padding-top:14px;border-top:2px dashed var(--ink-4)}
  .tear .btn{font-size:14px;padding:5px 12px 6px}
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

  /* position:relative so a card's offsetLeft/offsetTop are measured against
     the grid — the drag hit-tests on those rather than on bounding rects,
     which report mid-FLIP positions instead of the actual cells. */
  .cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:14px;position:relative}
  .card{
    padding:15px 17px 14px;position:relative;display:flex;flex-direction:column;min-height:112px;
    cursor:pointer;transition:transform .12s ease,box-shadow .12s ease;
    animation:drop .4s var(--spring) backwards;
    /* Without this, flinging a card paints a text selection across every card
       it passes over, and the selection outlives the drop. */
    user-select:none;-webkit-user-select:none;
  }
  @keyframes drop{from{opacity:0;transform:translateY(10px) rotate(-.6deg)}}
  .card:hover{transform:translate(-1px,-2px) rotate(-.4deg);box-shadow:4px 6px 0 rgba(var(--sh),.4)}

  /* ── reordering ──────────────────────────────────────────────────────
     "Lift it, and leave a slot." A generic drag fades what you are dragging
     and draws a line where it lands; on a paper board that is backwards. The
     card in your hand stays the most SOLID thing on the page and the absence
     it left is the ghost.

     There is no grip handle and no drag dots — nothing permanent is added to a
     card. The affordance is the cursor plus the lift hover already does, and
     the ? sheet teaches the keys like it does for everything else. */
  /* Only where a drag can actually start. The completed fold renders the same
     cards, and advertising a grab there promises a gesture that is refused. */
  .cards:not(.folded) > .card{cursor:grab}
  /* On the root, because .card.drag is pointer-events:none and the cursor is
     therefore hit-tested against whatever sits underneath it. */
  :root.dragging,:root.dragging *{cursor:grabbing !important}
  .card.drag{
    z-index:40;pointer-events:none;
    box-shadow:10px 14px 0 rgba(var(--sh),.30);
    transition:box-shadow .14s ease;   /* transform is written per frame by JS */
  }
  /* Keyboard carry: the same card in the same hand, just sitting still while
     the others shuffle past it. One look for both inputs, deliberately. */
  .card.carry{
    z-index:40;transform:rotate(-2.2deg) scale(1.035);
    box-shadow:10px 14px 0 rgba(var(--sh),.30);
    transition:transform .18s var(--spring),box-shadow .18s var(--spring);
  }
  /* An idea card is transparent and a done card has no background at all.
     Held, they are off the board and in your hand, so they get paper under
     them — otherwise you drag a see-through rectangle over other cards. The
     dashed border stays: that is the card's identity, not its backing. */
  .card.drag,.card.carry{background:var(--paper-2)}
  /* No entrance animation on a card you are holding. Moving a node — which is
     what picking one up does, out of the grid and onto the body — RESTARTS its
     CSS animation, so the card faded in from opacity:0 under the cursor and you
     could read the card beneath through it. The exact opposite of the thing
     this design is built on: what you are holding is the most solid object on
     the page, and the hole it left is the ghost. */
  .card.drag,.card.carry{animation:none}
  /* The hover rule would otherwise re-tilt a card being carried by keyboard,
     which reads as the card twitching when the pointer happens to rest on it. */
  .card.carry:hover{transform:rotate(-2.2deg) scale(1.035)}

  /* Where it lands. NOT an insertion line: these cards sit in a responsive
     grid where the drop point can fall mid-row, and a horizontal rule cannot
     say "here" in a grid. A card-shaped placeholder can, because it takes a
     real cell and lets the browser's own auto-placement do the reflow.
     Highlighter rather than --ink-4 for two reasons: --hi already means "the
     active place" on this board, and an idea card is ALSO dashed in --ink-4,
     so an ink slot would vanish in a group of them. */
  .slot{
    border:2.5px dashed var(--hi);background:rgba(var(--hi-rgb),.10);
    box-shadow:none;animation:slotin .18s var(--spring);
  }
  @keyframes slotin{from{opacity:0;transform:scale(.96)}}
  /* FLIP: siblings are measured before the slot moves and again after, then
     glide from the difference. Without it they jump between grid cells, which
     on a board this springy reads as cheap. Same curve as the entrance
     animation — the motion vocabulary here is one curve, and stays one. */
  .card.flip{transition:transform .18s var(--spring)}
  /* Announced, never drawn. clip-path over display:none because a hidden
     element is not announced at all. */
  .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
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

  /* Blocked is NOT urgent — it is "not yet" — so it gets the quietest
     treatment on the board: faded, dashed, and no colour of its own. Orange
     means live and highlighter means you are the hold-up; borrowing either
     would make waiting work compete with work that actually needs you. */
  .card.blocked{opacity:.66;border-style:dashed;border-color:var(--ink-4);box-shadow:1px 2px 0 rgba(var(--sh),.06)}
  .card.blocked .t{color:var(--ink-2)}
  .card.blocked::before{content:"⛓";position:absolute;top:6px;right:12px;color:var(--ink-4);font-size:13px}
  .chip{
    font-family:ui-monospace,Menlo,monospace;font-size:9.5px;letter-spacing:.08em;
    padding:3px 8px 4px;border:2px solid var(--ink-4);color:var(--ink-3);white-space:nowrap;
    border-radius:9px 12px 8px 11px/11px 8px 12px 9px;
  }
  /* Freed is the one dependency state that IS news, so it reads in pine —
     the agent's-own-work colour — rather than highlighter. */
  .card.freed{border-color:var(--pine-c)}
  .chip.freed{border-color:var(--pine-c);color:var(--pine-b);background:rgba(var(--pine-rgb),.10)}

  .keys{
    position:fixed;left:var(--rail-w);right:0;bottom:0;z-index:8;padding:14px 26px;
    display:flex;justify-content:center;gap:12px 20px;flex-wrap:wrap;
    background:linear-gradient(180deg,transparent,var(--paper) 44%);
    font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.12em;
    text-transform:uppercase;color:var(--ink-3)}
  /* display:flex above beats the UA's [hidden]{display:none}, which is a bare
     attribute selector. Without this the move-mode bar is never hidden — and
     because it is position:fixed across the bottom, it also swallows pointer
     events over whatever it covers. */
  .keys[hidden]{display:none}
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
  /* A picker group header, in the same type as a field label, so the picker
     and the thing it edits speak one language. */
  .pal .grp{font-family:ui-monospace,Menlo,monospace;font-size:9px;letter-spacing:.18em;
    text-transform:uppercase;color:var(--ink-3);padding:11px 20px 4px;
    border-bottom:1px dotted var(--ink-4);margin:0 14px 4px}
  .pal .q .cue{font-family:ui-monospace,Menlo,monospace;font-size:9.5px;letter-spacing:.16em;
    text-transform:uppercase;color:var(--ink-3);flex:none;align-self:center}
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
  .phz .p .sw{flex:1;height:5px;border-radius:3px;background:rgba(var(--sh),.10);overflow:hidden;display:flex}
  .phz .p .sw i{display:block;height:100%}
  .phz .p .sw i.a{background:var(--pine-c)}
  .phz .p .sw i.y{background:rgba(var(--hi-rgb),.9)}

  /* What the run concluded, above where its time went — the what before the
     how-long. Drawn as a margin rule rather than another dashed rectangle: the
     run is already a box, and the app index next door sets the precedent that
     a second frame inside a frame is one frame too many. Pine, because pine has
     meant the agent's own work everywhere else on this board. */
  /* Two columns across the WHOLE block, not per row. The labels are whatever
     the run chose to call its fields, so a fixed guess at their width left the
     longest one — "next (you)", the canonical last line — pushing its value out
     of line with every row above it. display:contents hands each row's cells to
     this grid, so one column width is negotiated across all of them at once. */
  .rep{border-left:3px solid var(--pine-c);padding:1px 0 2px 13px;margin:0 0 13px;
    display:grid;grid-template-columns:auto 1fr;gap:4px 12px;align-items:baseline}
  .rep .r{display:contents}
  /* .lb, not .k — .k is the keycap class on this page, and inheriting its
     border, paper fill and drop shadow turned every field label into a fake
     button. (No backticks anywhere in this file: it is one template literal.) */
  .rep .r .lb{color:var(--ink-3);font-family:ui-monospace,Menlo,monospace;
    font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;
    line-height:1.6;white-space:nowrap}
  .rep .r .v{color:var(--ink);min-width:0;overflow-wrap:anywhere;
    font-family:ui-monospace,Menlo,monospace;font-size:12px;line-height:1.5}
  /* A line the run wrote without a label spans both columns rather than sitting
     in the label one — a report is still its own words when it is not a table. */
  .rep .r .v:only-child{grid-column:1 / -1}
  .rep > .prov,.rep > .raw{grid-column:1 / -1}
  /* A scraped report is one viewport of terminal, not the run's own words, and
     says so in a sentence rather than wearing a badge. The rule goes dotted for
     the same reason a dashed border reads as provisional. */
  .rep.scraped{border-left-style:dotted;border-left-color:var(--ink-4)}
  .rep .prov{font-size:14px;color:var(--ink-3);margin:0}
  /* Bounded and scrollable rather than folded behind a button. The ticket page
     rebuilds this html from a cached string on every redraw, so any open/closed
     state living in the DOM would snap shut under the reader — and a box that
     scrolls in place already answers what the fold was for: a scrape must not
     become a wall of terminal. */
  .rep .raw{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;line-height:1.5;
    color:var(--ink-2);background:rgba(var(--sh),.05);border-radius:6px;
    padding:9px 11px;margin:2px 0 0;white-space:pre;overflow:auto;max-height:260px}

  /* ── the ticket page ─────────────────────────────────────────────────
     A ticket is a job card, and this is that card laid flat: a printed head,
     a hand-written body, a routing stub down the side, and the timesheet the
     runner produced underneath.

     Two columns, because the overlay's real failure was ORDER rather than
     width — actions above a long body and the trace below it means acting
     costs a scroll in both directions. The stub stays put instead. */
  .tgrid{
    display:grid;gap:30px 34px;
    grid-template-columns:minmax(0,1fr) 268px;
    grid-template-areas:"main stub";
  }
  /* NO align-items:start here, however much it looks like it belongs. A grid
     item defaults to stretching to the row, and that height is the only room a
     sticky child has to travel in — shrink-wrapping .tstub to its content made
     the stub scroll away with the body, which is the one thing it exists not
     to do. .tmain opts out for itself instead. */
  /* minmax(0,…) AND min-width:0, both. A rendered body holds wide tables and
     long <pre>, and a grid item's automatic minimum is its content — either
     guard alone still lets one push the column past the sheet and scroll the
     whole page sideways. Same failure the shared .md block exists to stop. */
  .tmain{grid-area:main;min-width:0;align-self:start}
  .tstub{grid-area:stub;min-width:0}
  /* Stacking puts the stub FIRST: on a narrow window the disposition of the
     ticket is still what you came for, and burying it under six hundred words
     rebuilds the overlay's actual bug in one column. */
  @media (max-width:940px){
    .tgrid{grid-template-columns:minmax(0,1fr);grid-template-areas:"stub" "main"}
    .tstub .stick{position:static;max-height:none;overflow:visible}
    /* Stacked it stays a CARD at the head of the page rather than a panel
       stretched across it — 268px of controls spread over 900px reads as a
       form whose labels have been abandoned at the far end. */
    .tstub .stub{max-width:440px}
    .stub .head{justify-content:flex-start;padding-left:22px}
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
  .tmain .phz .p .sw{height:9px;border-radius:5px}
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
  /* ── a field you can write in ─────────────────────────────────────────
     The value itself is the target: on a filing card you rewrite what is in
     the blank. Wash plus a hint at the row's right edge — the affordance
     .desc already wears — except the hint is the KEY, so a board that is
     otherwise keyboard-driven teaches the shortcut as you reach for it. */
  .stub .f.edit{position:relative;cursor:pointer;border-radius:9px;
    padding-left:8px;margin-left:-8px;padding-right:24px;
    transition:background .12s ease;outline:none}
  .stub .f.edit:hover,.stub .f.edit:focus-visible{background:rgba(var(--hi-rgb),.34)}
  .stub .f.edit:focus-visible{box-shadow:0 0 0 2.5px var(--hi)}
  .stub .f.edit::after{
    content:attr(data-k);position:absolute;top:50%;right:7px;transform:translateY(-50%);
    font-family:ui-monospace,Menlo,monospace;font-size:9px;letter-spacing:.14em;
    text-transform:uppercase;color:var(--ink-3);opacity:0;transition:opacity .12s ease}
  .stub .f.edit:hover::after,.stub .f.edit:focus-visible::after{opacity:1}
  /* Navigation keeps the glyph it already has elsewhere on this page
     ("open the plan ↗", "open PR ↗"), so it stops competing with the value
     for the same click and is recognised rather than learned. */
  .stub .f .go{font-family:ui-monospace,Menlo,monospace;font-size:11px;color:var(--ink-3);
    margin-left:6px;cursor:pointer;text-decoration:none}
  .stub .f .go:hover,.stub .f .go:focus-visible{color:var(--pine-b);outline:none}
  /* A started ticket's app is not greyed out — it is still true, and keeps
     full ink. The branch holding it is set in the same mono as the slab's
     path line above, which is where the same string already lives. */
  .stub .f .held{display:block;margin-top:3px;font-family:ui-monospace,Menlo,monospace;
    font-size:10.5px;color:var(--ink-3);text-transform:none;letter-spacing:0}
  .stub .f .held b{color:var(--ink-2);font-weight:400}
  /* ── dependency rows ──────────────────────────────────────────────────
     One line per edge, because several is the normal case (#4 in this repo's
     own backlog names two). The id leads in mono so the column scans as a
     list of tickets; the app name only appears when the far end is in a
     DIFFERENT app, since an edge may cross them and a bare #41 is not
     something you can place. */
  .stub .f .dep{display:block;margin-top:4px;font-size:15px;line-height:1.25}
  .stub .f .dep:first-child{margin-top:0}
  .stub .f .dep .dnum{font-family:ui-monospace,Menlo,monospace;font-size:11px;
    color:var(--ink-3);margin-right:6px}
  .stub .f .dep .far{font-family:ui-monospace,Menlo,monospace;font-size:10px;
    letter-spacing:.1em;text-transform:uppercase;color:var(--pine-b);margin-left:6px}
  .stub .f .dep .empty{color:var(--ink-4);font-style:italic}
  /* A blocker that landed is history, not an obstacle — struck through so the
     row answers "is anything still in my way" without reading the statuses. */
  .stub .f .dep.met{color:var(--ink-4)}
  .stub .f .dep.met .dnum{text-decoration:line-through}
  /* The status stamp is a control too. It straightens as you go to re-stamp
     it — the one flourish, and the same lift .btn:hover already does. */
  .stub .head.edit{position:relative;cursor:pointer;outline:none}
  .stub .head.edit .stamp.big{transition:transform .13s ease}
  .stub .head.edit:hover .stamp.big,.stub .head.edit:focus-visible .stamp.big{
    transform:rotate(0deg) translateY(-2px)}
  .stub .head.edit::after{
    content:attr(data-k);position:absolute;top:26px;right:14px;
    font-family:ui-monospace,Menlo,monospace;font-size:9px;letter-spacing:.14em;
    text-transform:uppercase;color:var(--ink-3);opacity:0;transition:opacity .12s ease}
  .stub .head.edit:hover::after,.stub .head.edit:focus-visible::after{opacity:1}
  /* Three ranks, not seven buttons in a row: do the work, then file it, then —
     below a torn edge — destroy it. */
  .stub .acts{display:grid;gap:9px;padding:18px 18px 0}
  .stub .acts .btn{width:100%;text-align:center}
  .stub .acts .go{font-size:18px;padding:10px 16px 11px}
  .stub .minor{display:flex;gap:8px;flex-wrap:wrap}
  .stub .minor .btn{width:auto;flex:1 1 auto;font-size:14px;padding:5px 12px 6px}
  /* Only what a sidebar needs differently from the base above: it is inset in a
     narrow column, and its buttons fill it. */
  .stub .tear{margin:16px 18px 0;padding-top:12px}
  .stub .tear .btn{width:100%}

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
  .stamp.s-shipped{color:var(--ink-4);border-color:var(--ink-4)}
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
  .helpgrid .hnote{font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.1em;
    text-transform:uppercase;color:var(--ink-3);align-self:center}

  .void{padding:60px 20px;text-align:center;font-size:22px;color:var(--ink-3)}
  .void .big{font-size:34px;color:var(--ink-2);margin-bottom:10px}

  @media (prefers-reduced-motion:reduce){
    .card,.panel,.lab{animation:none !important}
    .card.live::after{animation:none}
    /* A reorder still has to be readable with the motion taken out: the lift
       and the slot are STATE, so they stay — it is only the travel between
       states that goes. JS reads the same query and skips FLIP and the
       velocity tilt rather than animating them to zero. */
    .card.carry,.card.flip{transition:none}
    .slot{animation:none}
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

<!-- Swapped in while a card is being carried. The keycap bar is where this
     board has always explained itself, so move mode explains itself there too
     rather than inventing a new place to put a hint. -->
<div class="keys" id="movekeys" hidden>
  <span><span class="k" data-k="J">⇧J ⇧K</span>move it</span>
  <span><span class="k" data-k="Enter">⏎</span>drop it</span>
  <span><span class="k" data-k="Escape">esc</span>put it back</span>
</div>

<div class="veil" id="palv"><div class="box b4 panel pal">
  <div class="q"><span class="cue" id="palcue" style="display:none"></span><input id="palq" placeholder="type a ticket title, or search…" autocomplete="off"></div>
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
    <div><b>a</b> — move it to another app</div><div><b>f</b> — file it into a project</div>
    <div><b>x</b> — set the status</div><div><b>w</b> — what it waits on (blockers)</div>
    <div class="hnote">a, f, x and w work on a ticket page</div>
    <div><b>p</b> — open its project / app</div><div><b>m</b> — pace (medians)</div>
    <div><b>b</b> — the margin, open / collapsed</div><div><b>h</b> — completed work, every group</div>
    <div><b>esc</b> — close, then back up a level</div>
    <div><b>⏎</b> on a ticket page — start / attach it</div>
    <div><b>⇧J / ⇧K</b> — carry it up or down</div><div><b>⏎</b> — drop it, <b>esc</b> — put it back</div>
    <div class="hnote">or drag a card — the order sticks</div>
    <div><b>t</b> — light / dark</div><div><b>?</b> — this</div>
  </div>
</div></div>

<div class="box toast" id="toast"></div>

<!-- Reordering by keyboard is silent otherwise, and this board is keyboard
     first. Announces where the card landed, not merely that it moved. -->
<div id="live" class="sr" aria-live="polite" role="status"></div>

<script>
(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // sessions starts null — "not asked yet" — for the same reason the server
  // sends null when it could not ask: an empty array is a claim that nothing is
  // running, and nothing has been claimed before the first read lands.
  let S = { tickets: [], runs: [], documents: [], deps: [], repositories: [], projects: [], sessions: null };
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

  // The run whose state this ticket should be showing. NOT a bare find(): a
  // ticket can have several runs — the board's own restart makes a second one on
  // the same worktree — and the first row that happened to come back is no
  // promise about which is current. An open run wins outright; failing that the
  // newest, since /api/state hands them back newest-first.
  //
  // The bare version was already flagged as unsafe by gateFor's comment below;
  // it just had not been fixed where the card reads it.
  function runFor(t){
    const mine = S.runs.filter((r) => r.ticket_id === t.id);
    return mine.find((r) => r.status === 'running' || r.status === 'awaiting') || mine[0];
  }
  // The live agent for a ticket, if herdr has one. 'blocked' means the session
  // is sitting at a prompt waiting for you — a permission request, a question,
  // a gate. Nothing else in smriti can see that.
  //
  // Matched on the worktree path and ONLY on it, the same rule the server's own
  // lookup settled on: herdr's agent names are machine-global, so a 't7' in some
  // other checkout answered for this ticket's — and it is not even a fallback,
  // since a name match by definition names a session in a different directory.
  // The name arm survived here after being deleted there, which mattered more
  // once liveness started deciding whether a ticket reads as running.
  function sessionFor(t){
    if (!t.worktree_path) return undefined;
    return (S.sessions || []).find((x) => x.cwd === t.worktree_path);
  }
  function docsFor(t){ return S.documents.filter((d) => d.ticket_id === t.id); }

  // Is this run actually running, or does its row merely still say so?
  //
  // 'runs.status' is a claim written by a process that can die, and until the
  // board started checking it, a session killed by any route other than a clean
  // finish left the ticket reading "· running" with a clock ticking against it
  // forever. #4 sat like that for days.
  //
  // The server reconciles the rows themselves every sweep, but that is a timer
  // and this is a paint: a card must not claim a session between the pane dying
  // and the next tick noticing.
  //
  // A ticket with no worktree has no session to look for, so the row stands
  // alone — that is a run started before the work was ever cut a directory, and
  // there is nothing to contradict it with.
  //
  // And the row also stands alone when herdr could not be asked at all, which
  // the server sends as a null sessions list rather than an empty one. On a
  // machine with no herdr that is the permanent answer, and reading it as
  // "nothing is running" would mean no run ever showed as running again —
  // taking the live clock away from every /begin on the way. Absence of proof
  // is not proof; the same rule the reconcile pass follows on the server.
  function isLiveRun(t, run){
    if (!run || run.status !== 'running') return false;
    if (!t.worktree_path) return true;
    if (!S.sessions) return true;
    return Boolean(sessionFor(t));
  }

  // Is this gate genuinely waiting on you?
  //
  // Deliberately NOT "the agent looks idle". Gate 2 waits by BLOCKING on
  // 'smriti html await', so herdr reports its agent as 'working' throughout a
  // perfectly real plan review — suppressing on that would hide the one thing
  // this band exists to show. The plan-page URL is no safer a signal: it is set
  // by a best-effort probe the server may simply fail.
  //
  // So the test is the ticket's own disposition, which cannot be faked by a
  // process that stopped running: work that shipped or was cancelled is not
  // waiting on anybody, whatever its run row still says. That alone clears the
  // stale rows; a gate whose ticket is still open goes on showing, which is
  // right — the run is either at a real gate or about to be reconciled.
  function gateIsReal(r){
    if (r.ticket_id == null) return true;
    const t = S.tickets.find((x) => x.id === r.ticket_id);
    if (!t) return true;
    return t.status !== 'shipped' && t.status !== 'cancelled';
  }

  // ── dependencies ─────────────────────────────────────────────────────
  // Joined client-side off the one /api/state graph, exactly like documents.
  // Nothing here is stored on the ticket: blocked / freed are worked out fresh
  // on every render, so a status change anywhere is reflected everywhere and
  // there is no derived field to go stale.
  //
  // Edges may cross apps AND projects, so the far end of one is often a ticket
  // the current view is not drawing. ticketById returns undefined in that case
  // and every caller has to cope — an edge to a ticket you cannot see is normal,
  // not an error.
  function ticketById(id){ return S.tickets.find((t) => t.id === id); }
  const DEP_SATISFIED = { shipped: 1, cancelled: 1 };
  function isSatisfied(t){ return !!(t && DEP_SATISFIED[t.status]); }
  // An edge whose blocker is not on screen: trust the status the server sent
  // with the edge rather than guessing, so a cross-app blocker still blocks.
  function edgeSatisfied(e){
    const t = ticketById(e.blocker_id);
    return t ? isSatisfied(t) : !!DEP_SATISFIED[e.blocker_status];
  }
  function blockersOf(t){ return (S.deps || []).filter((e) => e.blocked_id === t.id); }
  function blockingOf(t){ return (S.deps || []).filter((e) => e.blocker_id === t.id); }
  function openBlockers(t){ return blockersOf(t).filter((e) => !edgeSatisfied(e)); }
  // Only work that has not been picked up can BE blocked, which is the same
  // line bin/smriti-ticket draws: it checks blockers on the path that cuts a
  // worktree and not on the path that re-attaches one. Without this guard a
  // shipped ticket drew as blocked behind the fold, and a started one hid its
  // live session state ("asking you") behind an edge nothing would act on.
  function isStartable(t){ return !isSatisfied(t) && !t.branch && !t.worktree_path; }
  function isBlocked(t){ return isStartable(t) && openBlockers(t).length > 0; }
  // Had blockers, has none left, and nobody has picked it up yet. The board's
  // only reason to distinguish this from plain "unblocked" is that it is news.
  function isFreed(t){
    if (!isStartable(t)) return false;
    const b = blockersOf(t);
    return b.length > 0 && b.every(edgeSatisfied);
  }

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
  // Its worktree lives in the app's tree, so the app cannot move. One
  // definition, because the render, the click path and the key path all ask.
  const isStarted = (t) => Boolean(t && (t.branch || t.worktree_path));
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

  // Open work sorts by the order you dragged it into, and by nothing else.
  // This is what ticket #11 settled: status still says what a card IS, but it
  // no longer decides where the card SITS, and neither does priority. The
  // server hands positions back already sorted; this keeps the client honest
  // when it re-sorts a filtered subset.
  //
  // A position is only comparable inside one (app, project) group — which is
  // exactly the set each caller below has already narrowed to before sorting.
  const byPos = (a, b) => (a.position !== b.position ? a.position - b.position : a.id - b.id);

  // Completed work keeps the old status-band sort. Positions are for deciding
  // what to do next, and there is no next about a shipped ticket — the fold is
  // a record, so it stays grouped by how each item ended.
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
    const sess = sessionFor(t);
    const live = isLiveRun(t, run);
    const stateCls = live ? 'live' : (CLS[t.status] || '');
    const st = sess && sess.status === 'blocked' ? 'asking you'
      : sess && sess.status === 'working' ? 'working'
      : live ? esc((run.last_phase || 'working') + ' · running')
      : esc(STATUS[t.status] || t.status);
    // Running work shows elapsed, ticking; everything else shows when it last
    // moved. A card that says nothing about time is the thing this whole
    // ticket is about — but a clock that ticks for a session which no longer
    // exists is worse than none, so 'live' gates it rather than '!ended_at'.
    const ago = live
      ? '<span class="ago" data-live="run" data-since="' + esc(run.started_at) + '">⏱ ' +
        fmtDur(runSecs(run)) + '</span>'
      : (() => {
          const at = (run && run.ended_at) || t.updated_at;
          const rel = at ? fmtAgo(at) : '';
          return rel ? '<span class="ago" data-live="ago" data-since="' + esc(at) + '">' + rel + '</span>' : '';
        })();
    // Blocked reads as "not yet", never as urgent: muted and dashed, and
    // deliberately not orange (live) or highlighter (you are the hold-up).
    // A live run wins the class — work already underway is the more important
    // fact about a card than an edge someone drew while it was running.
    const blocked = !run && isBlocked(t);
    const freedT = !run && !blocked && isFreed(t);
    const depCls = blocked ? ' blocked' : (freedT ? ' freed' : '');
    // ADDED to the status chip, never in place of it. Replacing it meant a card
    // stopped saying whether it was an idea or ready for as long as it had an
    // edge — and "freed" is not a status, it is a note about one.
    const chip = blocked
      ? '<span class="chip" title="waiting on work that has not landed">blocked by ' +
        openBlockers(t).map((e) => '#' + e.blocker_id).join(' · ') + '</span>'
      : (freedT ? '<span class="chip freed" title="every blocker has landed">freed</span>' : '');
    // A card the server has not acknowledged yet gets no data-tid, so it cannot
    // be opened: its page would offer start and delete against a placeholder id
    // the server knows nothing about. It shows its title and says what it is
    // doing, which is the whole reason it is on screen this early — and none of
    // the dependency furniture, every piece of which is keyed on an id that does
    // not exist yet.
    const waitingCard = Boolean(t._pending);
    return '<div class="box card ' + stateCls + depCls + (waitingCard ? ' pend' : '') + '"' +
      (waitingCard ? '' : ' data-tid="' + t.id + '"') +
      ' style="animation-delay:' + (cardIdx++ * 45) + 'ms">' +
      (t.status === 'shipped' ? '<span class="tick">✓</span>' : '') +
      '<div class="t">' + esc(t.title) + '</div>' +
      '<div class="foot"><span class="id">' + (waitingCard ? '' : '#' + t.id) + '</span>' +
      '<span class="st">' + (waitingCard ? 'saving…' : st) + '</span>' +
      (waitingCard ? '' : chip + ago) + '</div></div>';
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
    const waiting = S.runs.filter((r) => r.status === 'awaiting' && gateIsReal(r));
    // A session stalled at a prompt belongs in "waiting on you" just as much as
    // a /begin gate does — it is the same fact, reported by herdr instead.
    const blocked = S.tickets.filter((t) => (sessionFor(t) || {}).status === 'blocked');
    // Work whose last blocker just landed. This is WEAKER than the two above —
    // they mean "something is stopped, right now, pending you"; this only means
    // "you could pick this up". It is drawn as a subordinate group below them,
    // in pine rather than highlighter, so a real gate can never be lost in a
    // list of suggestions. It clears by ACTION, not by clock: starting,
    // cancelling or re-filing a freed ticket takes it out of the band, so
    // nothing accumulates here on a timer nobody set.
    const freed = open.filter(isFreed);
    // Counted off live sessions rather than off the run rows: a row still saying
    // 'running' for a session that no longer exists is the whole reason the
    // liveness pass exists.
    const running = S.tickets.filter((t) => isLiveRun(t, runFor(t)));
    const day = new Date().toLocaleDateString(undefined,{weekday:'long'});
    $('#eye').innerHTML = esc(day) + ' · <b>' + open.length + '</b> open' +
      (running.length ? ' · <b>' + running.length + '</b> running' : '') +
      ((waiting.length + blocked.length) ? ' · <b>' + (waiting.length + blocked.length) + '</b> waiting' : '') +
      // Counted separately rather than folded into "waiting": freed work is not
      // waiting ON you, it is available TO you, and adding it to that number
      // would let the header read 5 waiting when nothing is actually stopped.
      (freed.length ? ' · <b>' + freed.length + '</b> freed' : '');

    // waiting band
    let w = '<div class="lab">waiting on you</div><div class="box wait">';
    for (const t of blocked){
      w += '<div class="item" data-tid="' + t.id + '">' +
        '<div><span class="h">' + esc(t.title) + '</span></div>' +
        '<div class="sub2">' + esc(appLabel(appOf(t))) + ' · #' + t.id +
        ' · <b>session is asking for something</b></div></div>';
    }
    if (!waiting.length && !blocked.length && !freed.length){
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
    if (freed.length){
      w += '<div class="freedgrp"><div class="gh">freed by what just shipped</div>';
      for (const t of freed){
        // Name what freed it. A blocker that is not on screen still gets its
        // id shown — an edge may cross apps, and "#41 landed" is at least
        // something you can go and look up.
        const why = blockersOf(t).map((e) => '#' + e.blocker_id).join(' · ');
        w += '<div class="freedrow" data-tid="' + t.id + '">' +
          '<span class="fid">#' + t.id + '</span>' +
          '<span class="fnm">' + esc(t.title) + '</span>' +
          '<span class="why">' + why + ' landed</span></div>';
      }
      w += '</div>';
    }
    w += '</div>';
    $('#waitwrap').innerHTML = w;

    flat = [];
    for (const t of blocked) flat.push({ id: t.id, kind: 'wait' });
    for (const r of waiting) if (r.ticket_id) flat.push({ id: r.ticket_id, kind: 'wait' });
    // After the gates, deliberately: arrow keys should reach a real decision
    // before they reach a suggestion. 'wait' also keeps these rows out of
    // carryStep, which refuses to reorder from the band.
    for (const t of freed) flat.push({ id: t.id, kind: 'wait' });

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
      // NOT sorted here. Positions restart at 1 in every group, so sorting an
      // app's whole backlog on position before bucketing compares numbers from
      // different scopes: every group's head ticket ties at 1 and the id
      // tiebreak silently decides which project is drawn first. Bucket first,
      // sort inside each bucket — see below.
      const items = all
        .filter((t) => t.status !== 'shipped')
        .filter((t) => t.status !== 'cancelled');
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

      // Grouped by project, then ordered WITHIN each group. Group order is by
      // project id — the order you created them — rather than by whose work is
      // most urgent, which is a question the board stopped answering when your
      // dragged order replaced the status bands. Deterministic beats a ranking
      // derived from numbers that are not comparable across groups.
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
      for (const g of groups.values()) g.sort(byPos);
      loose.sort(byPos);
      const ordered = [...groups.entries()].sort((a, b) => a[0] - b[0]);

      for (const [pid, group] of ordered){
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

    const loose = items.filter((t) => t.project_id == null && isOpen(t)).sort(byPos);
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
      // The name is the control, the same way the ticket's stamp is its status
      // control — a project had no rename at all, and a separate button beside
      // the heading would compete with the one thing the page is about.
      '<div class="who"><h1 class="rename" data-act="rename" role="button" tabindex="0" ' +
        'title="click to rename">' + esc(p.name) + '</h1>' +
      '<div class="path">' + (p.repo_slug
        ? 'in <b data-app="' + esc(p.repo_slug) + '">' + esc(appLabel(app)) + '</b>'
        : '<i>no app yet — an idea</i>') + '</div>' +
      '<div class="tally">' + tallyHtml(items) +
        (docs.length ? '<div><b>' + docs.length + '</b> documents</div>' : '') +
      '</div></div></div>';

    h += '<div class="lab">what this project is</div>' +
      descBox('id="pagedesc" data-edit="project" data-pid="' + p.id + '"', p.description, 'what this project is, and why…') +
      '<textarea class="descedit" id="pagedescedit" placeholder="what this project is, and why">' + esc(p.description || '') + '</textarea>';

    const open = items.filter(isOpen).sort(byPos);
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
    // Deleting a project does NOT delete its tickets — they go loose in the
    // app, which is what smriti-project rm does and the only reason this is
    // safe to offer at all. The label says so, because "delete project" reads
    // like it takes the work with it.
    h += '<div class="tear"><button class="btn danger" data-act="delproj">' +
      (armedDelete === 'p' + p.id ? 'really delete? tickets go loose' : 'delete project') +
      '</button></div>';

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
    if (changed) trailOpen = null;
    // The attach command from a start is carried across the navigation it
    // triggers, and dropped the moment you are looking at anything else — an
    // unscoped stash surfaces one ticket's command on the next ticket's page.
    if (!(view.kind === 'ticket' && pendingAttach && pendingAttach.id === view.id)) pendingAttach = null;
    // Both belong to the view you are on, not to the session: an armed delete
    // must not survive a navigation, and the document you had open on one
    // ticket must not spring open on the next.
    // Keyed by view, not by id alone, now that a project can be armed too: a
    // ticket arms as its number and a project as 'p<id>', so #7 and project 7
    // cannot inherit each other's confirm.
    const armKey = view.kind === 'ticket' ? view.id
      : view.kind === 'project' ? 'p' + view.id : null;
    if (armKey === null || armKey !== armedDelete) armedDelete = null;
    if (!(view.kind === 'ticket' && view.id === armedStop)) armedStop = null;
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
    // Reordering. Bound per grid rather than per card, and re-bound here with
    // everything else because #plots is replaced wholesale on every render.
    // The completed fold is deliberately not a candidate — see ordGrid.
    $$('.cards:not(.folded)').forEach((g) => g.addEventListener('pointerdown', onGridDown));
    // The ticket page's dispositions and its re-file select. Here rather than
    // beside the render, because wire() reaches the whole sheet — the by-hand
    // binding the overlay ended with existed only because a veil was outside
    // this function's reach.
    $$('[data-act]').forEach((b) => {
      b.addEventListener('click', () => ticketAct(b));
      // The project name is a heading wearing role="button", and a div does not
      // synthesise a click from Enter the way a real <button> does. Every other
      // act here IS a <button>, so this only has to cover the one that is not.
      if (b.tagName !== 'BUTTON'){
        b.addEventListener('keydown', (e) => {
          if (e.target !== b) return;
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault(); e.stopPropagation(); ticketAct(b);
        });
      }
    });
    // The stub's writable fields. The re-file <select> that used to be wired
    // here is gone: the project row does that job, and does it for a ticket
    // with no app too.
    $$('[data-field]').forEach((el) => {
      const open = () => openFieldPicker(el.dataset.field);
      el.addEventListener('click', open);
      el.addEventListener('keydown', (e) => {
        if (e.target !== el) return;
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault(); e.stopPropagation(); open();
      });
    });
    // stopPropagation because the glyph now sits INSIDE the row that opens a
    // picker — without it, going to the app page would raise the app picker on
    // the way out.
    $$('[data-app]').forEach((el) => {
      const open = () => { if (el.dataset.app !== NO_APP) go('#/r/' + encodeURIComponent(el.dataset.app)); };
      el.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); open(); });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); e.stopPropagation(); open(); }
      });
    });
    $$('[data-proj]').forEach((el) => {
      const open = () => go('#/p/' + el.dataset.proj);
      el.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); open(); });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); e.stopPropagation(); open(); }
      });
    });
    // Same contract as data-app / data-proj: the ↗ inside a dependency row
    // navigates to the other ticket, and must stop the row it sits in from
    // also opening the dependency picker on the way out.
    $$('[data-tgo]').forEach((el) => {
      const open = () => go('#/t/' + el.dataset.tgo);
      el.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); open(); });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); e.stopPropagation(); open(); }
      });
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
        // projectById, not a bare project_id != null: the LABEL falls back to
        // the app when the project is missing from the payload, and a target
        // that disagreed would promise the app page and deliver the board.
        const t = S.tickets.find((x) => x.id === view.id);
        const p = t && t.project_id != null ? projectById(t.project_id) : null;
        if (p){ go('#/p/' + p.id); return; }
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
      const id = el.dataset.doc;
      try {
        const html = trailCache.has(id) ? trailCache.get(id) : (await api('/api/doc/' + id)).html;
        trailCache.set(id, html);
        trailOpen = id;
        const live = $('#pagedoc');
        if (live){ live.innerHTML = html; live.classList.add('on'); }
      } catch (e) { toast('could not read the file: ' + esc(e.message)); }
    }));
    // Re-open whatever you were reading. route() replaces the sheet wholesale
    // about once a second while an agent runs, and trailHtml emits an empty
    // viewer every time — so without this the document you opened disappears
    // out from under you a second later.
    if (trailOpen && trailCache.has(trailOpen)){
      const dv = $('#pagedoc');
      if (dv){ dv.innerHTML = trailCache.get(trailOpen); dv.classList.add('on'); }
    }
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
    // A ticket's prose is its body; an app's and a project's is a column called
    // description. Same box, two field names underneath.
    const field = kind === 'ticket' ? 'body' : 'description';
    const subject = kind === 'repo' ? view.slug
      : kind === 'ticket' ? Number(d.dataset.ticket) : Number(d.dataset.pid);

    const save = async () => {
      const next = ta.value.trim();
      const was = current().trim();
      ta.classList.remove('on'); d.style.display = '';
      if (next === was) return;

      // Paint the new text over the display node BEFORE anything is sent. This
      // one line is the whole reported bug: closing the editor used to unhide a
      // node still holding the OLD text, so every save visibly reverted first.
      // The markdown is usually already rendered by the time we get here — the
      // editor pre-renders as you type — so this is normally the finished form
      // rather than a plain-text stop on the way to it.
      showDesc(d, next);

      const url = kind === 'repo' ? '/api/repos/' + encodeURIComponent(view.slug)
        : kind === 'ticket' ? '/api/tickets/' + d.dataset.ticket
        : '/api/projects/' + d.dataset.pid;
      const payload = kind === 'ticket' ? { body: next } : { description: next };

      await writeOptimistic(kind, subject, { [field]: next },
        () => api(url, { method: 'PATCH', body: JSON.stringify(payload) }),
        {
          raw: ta.value, before: ta.value, failMsg: 'could not save',
          // Hand the typing back rather than dropping it. Before this, a failed
          // save only toasted: the editor was already closed, the old text was
          // already showing, and the next render rebuilt the box from the value
          // that never changed — so what you wrote was silently gone.
          onFail: (text) => {
            const box = $('#pagedesc'), edit = $('#pagedescedit');
            if (!box || !edit) return;
            edit.value = text;
            startEdit(box, edit);
          },
        });
    };
    wireDescEdit(d, ta, save);
    d.addEventListener('click', (ev) => {
      if (editBlocked(ev, d)) return;
      startEdit(d, ta);
    });
    paintDesc(d, current());
  }

  // Put a value into the display node now, rendered if we already have it.
  // Deliberately NOT paintDesc: that one takes a generation and refuses to land
  // while an editor is open over the node, which is exactly the state we are
  // leaving — and it would await a round-trip before showing anything at all.
  function showDesc(el, src){
    if (!el) return;
    el.dataset.seq = String(++descSeq);   // outrank any paint still in flight
    const hit = src ? mdCache.get(src) : undefined;
    if (hit !== undefined && mdApply(el, hit)) return;
    el.classList.remove('md');
    el.classList.add('raw');
    el.textContent = src;
    // Not cached yet — fetch it and swap in place. Nothing flickers: the text
    // is already the right text, only its formatting is late.
    if (src) paintDesc(el, src);
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
    document.querySelectorAll('.card.sel,.item.sel,.freedrow.sel').forEach((e) => e.classList.remove('sel'));
    if (sel < 0 || !flat[sel]) return;
    const { id, kind } = flat[sel];
    // A freed row is a 'wait' row that is not an .item — look for either, or
    // arrowing into the freed group would silently paint nothing.
    const el = kind === 'wait'
      ? document.querySelector('.item[data-tid="' + id + '"], .freedrow[data-tid="' + id + '"]')
      : document.querySelector('.card[data-tid="' + id + '"]');
    if (el){ el.classList.add('sel'); el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  }
  function move(d){ if (!flat.length) return; sel = sel < 0 ? 0 : Math.min(flat.length - 1, Math.max(0, sel + d)); tapKey('nav'); paintSel(); }
  function selectedTicket(){ return sel >= 0 && flat[sel] ? S.tickets.find((t) => t.id === flat[sel].id) : null; }

  // ── api ──────────────────────────────────────────────────────────────
  async function api(path, opts){
    const r = await fetch(path, Object.assign({ headers: { 'content-type': 'application/json' } }, opts));
    if (!r.ok){
      // Unwrap {error} rather than throwing the raw body. Every failure here
      // starts life as a CLI die() written to be read by a human, and a toast
      // showing {"error":"smriti-ticket: #12 is started on …"} buries the
      // sentence inside its own transport. The prefix goes too: the toast
      // already says which action failed.
      const raw = await r.text().catch(() => '');
      let msg = raw;
      try { const pj = JSON.parse(raw); if (pj && typeof pj.error === 'string') msg = pj.error; } catch (_) {}
      msg = String(msg || '').replace(/^smriti-[a-z]+:\s*/, '');
      throw new Error(msg || ('HTTP ' + r.status));
    }
    return r.json();
  }
  // True while the user is mid-interaction with a control the re-render would
  // destroy. An editor is the obvious one: re-rendering underneath a textarea
  // destroys it without firing its blur handler, so the text is lost with no
  // save — worse than showing data a second out of date.
  //
  // A native select is the other. Its popup is drawn by the OS and there is no
  // event for "the popup is open", so focus is the only signal there is; the
  // ticket page redraws about once a second while an agent runs, and each redraw
  // closed the re-file dropdown with no choice made.
  // savesInFlight is the third arm, and it closes a hole the other two never
  // covered: this guard used to stop protecting the instant an editor closed,
  // and a save closes it as its first act. From then until the write landed, a
  // re-render was free to rebuild the box from the value that had not changed
  // yet. The optimistic overlay makes that harmless for the VALUE, but a render
  // mid-save still throws away the node that a failed save needs to reopen.
  let savesInFlight = 0;
  function isBusy(){
    if (savesInFlight > 0) return true;
    // A reorder in flight is the same kind of thing as a half-typed
    // description: the board redraws #plots wholesale about once a second while
    // an agent runs, and doing that mid-gesture pulls the card out from under
    // the cursor. This covers BOTH triggers, because they both land here — the
    // SSE 'changed' stream, and the 'changed' this very move broadcast back at
    // us the moment it was written.
    if (reorder) return true;
    const ta = document.querySelector('.descedit.on');
    if (ta && document.activeElement === ta) return true;
    const a = document.activeElement;
    return Boolean(a && a.tagName === 'SELECT');
  }

  // ── reordering ───────────────────────────────────────────────────────
  // "Lift it, and leave a slot." The card you are holding stays solid and
  // leaves a highlighter slot behind; the slot is a real grid item, so the
  // browser's own auto-placement works out where a mid-row drop belongs and
  // the siblings glide there with FLIP. See the CSS above for the why.
  //
  // Both inputs end in the same place: smriti ticket move --before/--after.
  // Nothing here computes a position — the CLI owns that arithmetic, so the
  // page cannot invent an order the store disagrees with.
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)');
  const CARRY_T = 'rotate(-2.2deg) scale(1.035)';
  const DRAG_THRESHOLD = 5;   // px of travel before a click becomes a drag

  // Non-null exactly while a reorder is happening. isBusy() reads it.
  let reorder = null;
  let pend = null;            // a pointer that is down but has not moved far enough

  function isCard(el){ return el && el.classList && el.classList.contains('card'); }
  function prevCard(el){ let p = el.previousElementSibling; while (p && !isCard(p)) p = p.previousElementSibling; return p; }
  function nextCard(el){ let n = el.nextElementSibling;     while (n && !isCard(n)) n = n.nextElementSibling;     return n; }
  // A grid you may reorder in. The history fold is excluded on purpose: a
  // hand-placed sequence over shipped work is a number nobody reads.
  function ordGrid(el){
    const g = el && el.parentElement;
    return g && g.classList.contains('cards') && !g.classList.contains('folded') ? g : null;
  }

  function announce(msg){ const l = $('#live'); if (l) l.textContent = msg; }
  function movePos(card){
    const g = card.parentElement; if (!g) return '';
    const cards = [...g.children].filter(isCard);
    return 'position ' + (cards.indexOf(card) + 1) + ' of ' + cards.length;
  }

  // FLIP: measure, re-parent, then play the difference. Without it the grid
  // snaps between cells, which on a board this springy reads as cheap.
  function flipStart(grid, skip){
    if (REDUCED.matches) return null;
    const m = new Map();
    for (const el of grid.children){
      if (el === skip) continue;
      if (isCard(el) || el.classList.contains('slot')) m.set(el, el.getBoundingClientRect());
    }
    return m;
  }
  function flipEnd(before){
    if (!before) return;
    const moved = [];
    for (const [el, r0] of before){
      if (!el.isConnected) continue;
      const r1 = el.getBoundingClientRect();
      const dx = r0.left - r1.left, dy = r0.top - r1.top;
      if (!dx && !dy) continue;
      el.classList.remove('flip');
      // A carried card keeps its lift while it travels — clearing the inline
      // transform later hands it back to the .carry class untouched.
      el.style.transform = 'translate(' + dx + 'px,' + dy + 'px)' +
        (el.classList.contains('carry') ? ' ' + CARRY_T : '');
      moved.push(el);
    }
    if (!moved.length) return;
    requestAnimationFrame(() => {
      for (const el of moved){
        if (!el.isConnected) continue;
        el.classList.add('flip');
        el.style.transform = '';
      }
      // .flip has to come back OFF. It overrides the whole transition
      // shorthand, so a card left wearing it loses the box-shadow half of the
      // hover transition and does its hover lift on the overshooting spring —
      // leaving the board with two different hover feels side by side until
      // the next full re-render.
      setTimeout(() => { for (const el of moved) el.classList.remove('flip'); }, 220);
    });
  }

  // Where the slot sits now, expressed the way the CLI wants to hear it.
  function anchorFor(node){
    const p = prevCard(node), n = nextCard(node);
    if (p) return { after: Number(p.dataset.tid) };
    if (n) return { before: Number(n.dataset.tid) };
    return null;
  }

  async function commitMove(id, anchor, unchanged){
    reorder = null;
    setMoveKeys(false);
    if (!anchor || unchanged){ refresh(); return; }
    try {
      const r = await api('/api/tickets/' + id + '/move', { method: 'POST', body: JSON.stringify(anchor) });
      // The card stays exactly where it was dropped. You may be sequencing
      // deliberately — about to force past the blocker, or about to cancel it —
      // so this reports the contradiction and lets it stand. Announced as well
      // as toasted, because the keyboard carry is the other way to cause it.
      if (r && r.note){ toast('heads up — ' + esc(r.note), 6000); announce(r.note); }
    } catch (e){
      // 409 is the CLI refusing a target in another app or project — an
      // illegal drop, not a broken server, and worth saying plainly.
      toast(e.message || 'could not move it', 4000);
    }
    refresh();
  }

  function setMoveKeys(on){
    const k = $('#keys'), mk = $('#movekeys');
    if (k) k.hidden = Boolean(on);
    if (mk) mk.hidden = !on;
  }

  // ── pointer ──────────────────────────────────────────────────────────
  function onGridDown(e){
    if (e.button !== 0 || reorder) return;
    const card = e.target.closest('.card');
    if (!card || !ordGrid(card)) return;
    // Nothing is claimed yet — a click must stay a click until the pointer has
    // actually travelled. A press-and-hold delay would put latency on every
    // open; distance costs nothing and starts the drag the moment you mean it.
    pend = { card, id: Number(card.dataset.tid), x: e.clientX, y: e.clientY, pid: e.pointerId };
  }

  function onGridMove(e){
    if (pend && !reorder){
      if (Math.abs(e.clientX - pend.x) < DRAG_THRESHOLD && Math.abs(e.clientY - pend.y) < DRAG_THRESHOLD) return;
      beginDrag(e);
      if (!reorder) return;
    }
    if (!reorder || reorder.mode !== 'drag' || e.pointerId !== reorder.pid) return;
    e.preventDefault();
    const dx = e.clientX - reorder.x, dy = e.clientY - reorder.y;
    // The one flourish: the card leans into the throw. Everything else on this
    // board is hand-drawn and hand-placed, and a card that hangs perfectly
    // rigid while you fling it across the page contradicts that. Clamped
    // tight — past about 4 degrees it stops reading as weight.
    let tilt = -2.2;
    if (!REDUCED.matches){
      reorder.vs = reorder.vs * 0.82 + (e.clientX - reorder.lx) * 0.18;
      tilt = Math.max(-3.8, Math.min(-0.6, -2.2 + reorder.vs * 0.05));
    }
    reorder.lx = e.clientX;
    reorder.card.style.transform =
      'translate3d(' + dx + 'px,' + dy + 'px,0) rotate(' + tilt.toFixed(2) + 'deg) scale(1.035)';
    slotTo(e.clientX, e.clientY);
  }

  function beginDrag(e){
    const { card, id } = pend;
    const grid = ordGrid(card);
    pend = null;
    if (!grid) return;
    // isBusy() guards a drag in flight, but NOT the window between pressing a
    // card and moving far enough to mean it. A redraw landing in there replaces
    // #plots and detaches this card, whose parent is still a .cards div — just
    // one in a dead tree. Dragging it would insert the slot into that tree,
    // yank a stale card into the live page, and file it back somewhere nobody
    // can see, having read its new neighbours from a DOM that no longer exists.
    if (!card.isConnected) return;
    const r = card.getBoundingClientRect();

    const slot = document.createElement('div');
    slot.className = 'box slot';
    slot.style.minHeight = r.height + 'px';
    grid.insertBefore(slot, card);

    // Out of the grid entirely, and fixed where it already was, so the slot can
    // own its cell and sibling scans never trip over the card in your hand.
    card.classList.add('drag');
    card.style.position = 'fixed';
    card.style.left = r.left + 'px'; card.style.top = r.top + 'px';
    card.style.width = r.width + 'px'; card.style.height = r.height + 'px';
    card.style.margin = '0';
    document.body.appendChild(card);
    // The grabbing cursor has to live on the root: .card.drag is
    // pointer-events:none, so the cursor is hit-tested against whatever is
    // underneath it and a rule on the card itself never renders.
    document.documentElement.classList.add('dragging');

    reorder = {
      mode: 'drag', id, card, slot, grid, pid: e.pointerId,
      x: e.clientX, y: e.clientY, lx: e.clientX, vs: 0,
      from: anchorKey(slot),
    };
    try { card.setPointerCapture(e.pointerId); } catch {}
  }

  // A stable description of where something sits, so a drop that changed
  // nothing can skip the write entirely.
  function anchorKey(node){
    const p = prevCard(node);
    return p ? 'after:' + p.dataset.tid : 'top';
  }

  function slotTo(x, y){
    const { grid, slot } = reorder;
    const sibs = [...grid.children].filter(isCard);
    if (!sibs.length) return;
    // Hit-tested against LAYOUT geometry (offsetLeft/Top), not
    // getBoundingClientRect. The siblings are mid-FLIP for 180ms after every
    // slot move, and a bounding rect reports the transformed, half-travelled
    // box rather than the cell the card actually occupies. Sweeping the pointer
    // across the grid would then place the slot relative to where a card WAS,
    // and the indicator thrashes — the exact cheapness FLIP was added to avoid.
    // .cards is position:relative so these offsets are grid-relative.
    const g = grid.getBoundingClientRect();
    const px = x - g.left, py = y - g.top;
    let target = null, after = false;
    for (const el of sibs){
      const l = el.offsetLeft, t = el.offsetTop, w = el.offsetWidth, h = el.offsetHeight;
      if (px >= l && px <= l + w && py >= t && py <= t + h){
        target = el; after = (px - l) > w / 2; break;
      }
    }
    if (!target){
      // Not over a card — in the gutter, or past the end of the last row.
      // Nearest centre keeps the slot following the pointer sensibly.
      let best = Infinity;
      for (const el of sibs){
        const cx = el.offsetLeft + el.offsetWidth / 2, cy = el.offsetTop + el.offsetHeight / 2;
        const d = (px - cx) * (px - cx) + (py - cy) * (py - cy);
        if (d < best){ best = d; target = el; after = px > cx; }
      }
    }
    if (!target) return;
    const ref = after ? target.nextSibling : target;
    if (slot.nextSibling === ref) return;      // already exactly there
    const before = flipStart(grid, slot);
    grid.insertBefore(slot, ref);
    flipEnd(before);
  }

  // Put the carried card back in the flow where its slot is standing, and undo
  // everything beginDrag did to it. One function because the drop path and the
  // cancel path must never drift apart — and the cancel path is the one nobody
  // exercises by hand.
  function restoreCard(){
    const { card, slot, grid } = reorder;
    card.classList.remove('drag');
    card.style.position = card.style.left = card.style.top = '';
    card.style.width = card.style.height = card.style.margin = card.style.transform = '';
    try { card.releasePointerCapture(reorder.pid); } catch {}
    grid.insertBefore(card, slot);
    slot.remove();
    document.documentElement.classList.remove('dragging');
  }

  function onGridUp(e){
    if (pend && !reorder){ pend = null; return; }
    if (!reorder || reorder.mode !== 'drag' || e.pointerId !== reorder.pid) return;
    const { slot, id } = reorder;
    const anchor = anchorFor(slot);
    const unchanged = anchorKey(slot) === reorder.from;
    restoreCard();
    // pointerup is followed by a click, and that click would open the ticket
    // you just finished dragging. Eat exactly one, then stop listening.
    const eat = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    document.addEventListener('click', eat, true);
    setTimeout(() => document.removeEventListener('click', eat, true), 0);

    commitMove(id, anchor, unchanged);
  }

  function cancelDrag(){
    // Before anything else: a pointercancel can arrive while only pend is
    // set — the browser taking over for a touch scroll or a palm rejection,
    // before the 5px threshold. Leaving pend alive there means the NEXT
    // pointermove starts a drag with no button held, pinning a card under a
    // cursor that is not pressing anything.
    pend = null;
    if (!reorder || reorder.mode !== 'drag') return;
    restoreCard();
    reorder = null;
    setMoveKeys(false);
    refresh();
  }

  // ── keyboard ─────────────────────────────────────────────────────────
  // The same gesture, not a second one: the card lifts in place exactly as it
  // would under the cursor, and the others shuffle past it.
  function carryStep(dir){
    // The selection must be a CARD. flat also holds "waiting on you" rows,
    // which are .item elements drawn from a ticket — and selectedTicket()
    // happily returns that ticket, so without this check ⇧J finds the same
    // ticket's card further down the board and silently lifts, steps and
    // commits a reorder the user never saw, while .sel stayed on the row above.
    if (sel < 0 || !flat[sel] || flat[sel].kind !== 'card') return;
    const t = selectedTicket(); if (!t) return;
    const card = document.querySelector('.card[data-tid="' + t.id + '"]');
    if (!card) return;
    const grid = ordGrid(card); if (!grid) return;

    if (!reorder){
      reorder = { mode: 'key', id: t.id, card, grid, origNext: card.nextSibling, from: anchorKey(card) };
      card.classList.add('carry');
      setMoveKeys(true);
      // Clicking away is a decision too — commit rather than leaving a card
      // stuck in the air with no visible way down.
      reorder.away = () => { if (reorder && reorder.mode === 'key') carryCommit(); };
      document.addEventListener('pointerdown', reorder.away, true);
    }
    const sib = dir < 0 ? prevCard(card) : nextCard(card);
    if (!sib){ announce('already at the ' + (dir < 0 ? 'top' : 'bottom')); return; }
    const before = flipStart(grid, null);
    grid.insertBefore(card, dir < 0 ? sib : sib.nextSibling);
    flipEnd(before);
    announce(t.title + ', ' + movePos(card));
  }

  function carryEnd(){
    if (!reorder || reorder.mode !== 'key') return null;
    const r = reorder;
    r.card.classList.remove('carry');
    r.card.style.transform = '';
    document.removeEventListener('pointerdown', r.away, true);
    return r;
  }
  function carryCommit(){
    const r = carryEnd(); if (!r) return;
    commitMove(r.id, anchorFor(r.card), anchorKey(r.card) === r.from);
    announce('dropped at ' + movePos(r.card));
  }
  function carryRevert(){
    const r = carryEnd(); if (!r) return;
    r.grid.insertBefore(r.card, r.origNext);
    reorder = null;
    setMoveKeys(false);
    announce('put back');
    paintSel();
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

  // Render what you are typing into the cache, so the value is already formatted
  // by the time you blur. Without it the save shows correct-but-unformatted text
  // for one round-trip and then reflows — the plain-text beat in the middle of
  // the four this whole change exists to remove.
  //
  // Debounced because it is a request per pause, not per keystroke, and skipped
  // entirely for text we have already rendered or already failed on.
  let preTimer = 0;
  function preRender(src){
    clearTimeout(preTimer);
    if (!src || mdCache.has(src) || mdFailed.has(src)) return;
    preTimer = setTimeout(async () => {
      try {
        const { html } = await api('/api/render', { method: 'POST', body: JSON.stringify({ md: src }) });
        mdPut(src, html);
      } catch { mdFailed.add(src); }
    }, 350);
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
    ta.oninput = () => { growEdit(ta); preRender(ta.value.trim()); };
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

  // ── optimistic writes ────────────────────────────────────────────────
  //
  // Every mutation on this board used to be write-then-refetch-everything, and
  // the description editor showed what that costs: save() closed the editor
  // BEFORE sending, unhiding a node still holding the old text, so the value
  // visibly reverted, then the PATCH landed, then the text reappeared — first
  // as plain source, then rendered. Four beats to change a sentence.
  //
  // So writes are held here the moment you make them and re-applied over every
  // server read until the server says the same thing back. Same idea as
  // armedDelete and runCache: state kept OUT of the DOM precisely because
  // route() rebuilds the DOM wholesale on every SSE tick, about once a second
  // while an agent runs.
  //
  // Keyed 'kind:id:field'. The stored value is the canonical one that actually
  // went to the server — echo is compared against THAT, never against raw
  // keystrokes, because save trims and the server stores the trimmed form.
  //
  // One entry per field rather than per write, because a single write can settle
  // more than one column: filing a ticket into a project settles its app too,
  // and showing the new project beside the old app for a round-trip would be a
  // worse lie than the one this replaces.
  const pending = new Map();
  // A write the server accepts but never echoes back would otherwise be
  // re-applied over every read for the life of the tab, quietly overriding the
  // truth. That is not hypothetical — it is what a field whose canonical form
  // differs from what we sent does. So an entry has a life, after which the
  // server's answer simply wins.
  const PENDING_TTL_MS = 30000;
  // Long enough that a slow sqlite write is never mistaken for a dead one, short
  // enough that a wedged request cannot hold the render guard indefinitely.
  const WRITE_TIMEOUT_MS = 15000;

  const pendKey = (kind, id, field) => kind + ':' + id + ':' + field;
  const collFor = (st, kind) =>
    kind === 'ticket' ? (st.tickets || []) : kind === 'project' ? (st.projects || []) : (st.repositories || []);
  const rowFor = (st, kind, id) =>
    kind === 'repo' ? (st.repositories || []).find((x) => x.slug === id)
      : collFor(st, kind).find((x) => Number(x.id) === Number(id));

  // Rows that exist, or stop existing, before the server has been told.
  //
  // The field overlay above cannot express either: patching a column assumes a
  // row to patch. Creating and deleting were the two mutations left doing the
  // full server-round-trip-then-refetch-everything, and both are the ones where
  // the wait is most obvious, because nothing at all is on screen until it ends.
  //
  // Keyed 'kind#id'. A create has no id yet — sqlite assigns it — so it gets a
  // NEGATIVE placeholder, which is a shape real ids never take, and the entry is
  // re-keyed to the real one the moment the server answers.
  const pendingRows = new Map();
  const rowKey = (kind, id) => kind + '#' + id;
  let tempSeq = 0;
  const tempId = () => -(++tempSeq);
  // The one thing every caller has to ask before acting on a row: a placeholder
  // id must never reach the server, which knows nothing about it.
  const isTemp = (id) => Number(id) < 0;

  function pendRowSet(kind, id, op, row){
    const e = { kind, id, op, row, until: Date.now() + PENDING_TTL_MS };
    if (op === 'remove'){
      // Keep what is about to be taken away, because a refusal has to put it
      // back — including the tickets a project was holding, which the removal
      // turns loose on the way past.
      e.row = rowFor(S, kind, id);
      if (kind === 'project'){
        e.held = (S.tickets || [])
          .filter((t) => Number(t.project_id) === Number(id))
          .map((t) => ({ id: t.id, project_id: t.project_id,
                         project_ref: t.project_ref, project_name: t.project_name }));
      }
    }
    pendingRows.set(rowKey(kind, id), e);
  }
  // Undo, not forget — the same distinction the field overlay needs and for the
  // same reason. applyPendingRows has already pushed the row in, or spliced it
  // out, of the live state; deleting the entry alone only stops that being
  // redone, leaving a project on screen that was refused, or a deleted one
  // still missing.
  function pendRowRollback(kind, id){
    const e = pendingRows.get(rowKey(kind, id));
    pendingRows.delete(rowKey(kind, id));
    if (!e) return;
    const coll = collFor(S, kind);
    const at = coll.findIndex((x) => Number(x.id) === Number(e.id));
    if (e.op === 'add'){
      if (at >= 0) coll.splice(at, 1);
      return;
    }
    if (e.row && at < 0) coll.push(e.row);
    for (const h of (e.held || [])){
      const t = (S.tickets || []).find((x) => Number(x.id) === Number(h.id));
      if (t) Object.assign(t, h);
    }
  }
  // A create that landed: the placeholder becomes the real row, under the real
  // id, so the next read recognises it and the entry retires itself.
  function pendRowPromote(kind, tmp, realId){
    const e = pendingRows.get(rowKey(kind, tmp));
    if (!e) return;
    pendingRows.delete(rowKey(kind, tmp));
    e.id = realId;
    // _pending goes with the placeholder. It is what greys a card out and
    // withholds its data-tid, and the row is no longer provisional — the server
    // has just named it. Leaving it set left a real ticket looking unsaved and
    // refusing to open until some later refresh happened to replace the row.
    e.row = Object.assign({}, e.row, { id: realId, _pending: false });
    pendingRows.set(rowKey(kind, realId), e);

    // The row already IN the live state still carries the placeholder, and
    // re-keying the entry alone does not touch it — so the next apply would
    // look for the real id, not find it, and push a SECOND row. That is exactly
    // what happened: two identical projects in the margin until a refresh
    // replaced the state wholesale and one of them vanished.
    //
    // Rewritten in place rather than removed and re-added, so the row keeps its
    // position instead of jumping to the end of the list under the user.
    const coll = collFor(S, kind);
    const at = coll.findIndex((x) => Number(x.id) === Number(tmp));
    if (at >= 0) coll[at] = e.row;
  }

  // 'prev' is captured here, from the state as it stands, because rolling back
  // is not the same as forgetting. applyPending mutates the row in place, so
  // dropping the entry on failure only stops it being RE-applied — the value it
  // already wrote is still sitting in S and still on screen.
  function pendSet(kind, id, fields){
    const row = rowFor(S, kind, id) || {};
    for (const field of Object.keys(fields)){
      const key = pendKey(kind, id, field);
      // Keep the ORIGINAL prev when a second write lands on a field that is
      // already pending: rolling back to the value of the failed write in
      // between would restore something the server never held.
      const had = pending.get(key);
      pending.set(key, {
        kind, id, field, sent: fields[field],
        prev: had ? had.prev : row[field],
        until: Date.now() + PENDING_TTL_MS,
      });
    }
  }
  // Undo, not just forget. Puts the value the field had before this write back
  // into the live state, so a rejected write leaves no trace of itself — and,
  // crucially for the description box, so current() reports what the server
  // actually holds and retyping the same text is a real change again.
  function pendRollback(kind, id, fields){
    const row = rowFor(S, kind, id);
    for (const field of Object.keys(fields)){
      const e = pending.get(pendKey(kind, id, field));
      if (e && row) row[field] = e.prev;
      pending.delete(pendKey(kind, id, field));
    }
  }

  // Two values are "the same" when the server would have stored them the same
  // way. null, undefined and '' all mean absent here — a ticket with no project
  // comes back as null, and the write that detached it sent null — and ids
  // arrive as numbers from sqlite but are written as strings by the pickers.
  function sameStored(a, b){
    if (a == null || a === '') return b == null || b === '';
    return String(a) === String(b);
  }

  // Lay every outstanding write back over a freshly-read state, and forget the
  // ones the server has caught up with. An entry is dropped only once the
  // server's value MATCHES, so a read taken before the write landed keeps
  // showing your value rather than flickering back to the old one.
  // Rows first, because a field patch on a row that is optimistically present
  // has nothing to apply to until that row is in the state.
  //
  // Each entry retires itself the moment the server agrees: a pending create
  // when the row appears, a pending delete when it is gone. Until then it is
  // re-applied over every read, so an SSE tick that arrives before the write
  // lands cannot flicker the row back into or out of existence.
  function applyPendingRows(next){
    if (!pendingRows.size) return;
    const now = Date.now();
    for (const e of [...pendingRows.values()]){
      if (now > e.until){ pendingRows.delete(rowKey(e.kind, e.id)); continue; }
      const coll = collFor(next, e.kind);
      const at = coll.findIndex((x) => Number(x.id) === Number(e.id));

      if (e.op === 'remove'){
        if (at < 0){ pendingRows.delete(rowKey(e.kind, e.id)); continue; }
        coll.splice(at, 1);
        // What the server does on the way past, mirrored: deleting a project
        // does not delete its tickets, it turns them loose. Without this the
        // tickets keep pointing at a project that is no longer in the state and
        // render under a heading that has gone.
        if (e.kind === 'project'){
          for (const t of (next.tickets || [])){
            if (Number(t.project_id) === Number(e.id)){
              t.project_id = null; t.project_ref = null; t.project_name = null;
            }
          }
        }
        continue;
      }
      // 'add'
      if (at >= 0){ pendingRows.delete(rowKey(e.kind, e.id)); continue; }
      coll.push(e.row);
    }
  }

  function applyPending(next){
    applyPendingRows(next);
    if (!pending.size) return next;
    const now = Date.now();
    for (const e of [...pending.values()]){
      const row = rowFor(next, e.kind, e.id);
      // Dropped when the row is gone (deleted while the write was in flight),
      // when the server has caught up, or when the entry has simply outlived
      // its usefulness — see PENDING_TTL_MS for why the last one exists.
      if (!row || sameStored(row[e.field], e.sent) || now > e.until){
        pending.delete(pendKey(e.kind, e.id, e.field));
        continue;
      }
      row[e.field] = e.sent;
    }
    return next;
  }

  // Serialized, because a single save used to trigger three of these: the one
  // it awaited, the SSE 'changed' the PATCH route broadcasts before it replies,
  // and the 900ms sqlite-mtime watcher behind that. None were de-duplicated, so
  // concurrent reads could land out of order and the older one won.
  let refreshing = null, refreshAgain = false;
  async function refresh(){
    if (refreshing){ refreshAgain = true; return refreshing; }
    refreshing = (async () => {
      try {
        do {
          refreshAgain = false;
          S = applyPending(await api('/api/state'));
        } while (refreshAgain);
        if (!isBusy()) route();
      } catch (e) {
        // 503 is the store failing to read; anything else is the server gone.
        const msg = /could not read/.test(String(e.message))
          ? 'could not read the ticket store — is sqlite3 there?'
          : 'lost the server — rerun <b>smriti</b> in a terminal';
        toast(msg, 6000);
      } finally { refreshing = null; }
    })();
    return refreshing;
  }

  // Write a field and show it immediately. The optimistic entry goes in BEFORE
  // the request, is mirrored straight into S so this render already has it, and
  // is dropped on failure so the next read puts the old value back.
  //
  // 'onFail' is how the description editor gets your typing back: the overlay
  // can restore the VALUE, but not the editor you were in, because route() has
  // rebuilt the DOM by then.
  async function writeOptimistic(kind, id, fields, req, opts){
    const o = opts || {};
    const before = o.before;
    pendSet(kind, id, fields);
    S = applyPending(S);
    route();
    let err = null;
    savesInFlight++;
    try {
      // Raced against a deadline, because savesInFlight suppresses re-rendering
      // while it is raised and fetch() here has no timeout of its own. A request
      // that never settles — a wedged server, a laptop suspended mid-write —
      // would leave the guard up for the life of the tab, and unlike the other
      // two arms of isBusy() this one cannot clear itself when focus moves. The
      // board would simply stop redrawing.
      await Promise.race([
        req(),
        new Promise((_, rej) => setTimeout(
          () => rej(new Error('timed out — the board did not answer')), WRITE_TIMEOUT_MS)),
      ]);
    }
    catch (e) { err = e; }
    // Dropped before the refresh below, so isBusy() stops reporting this save
    // and that read is allowed to render. Leaving it raised until after would
    // suppress the very re-render it exists to trigger.
    finally { savesInFlight--; }

    if (!err){
      // Not awaited: the PATCH already broadcast, so a read is on its way. This
      // one only makes it prompt when SSE is not connected.
      refresh();
      return true;
    }
    // Rolled back, not merely forgotten: applyPending already wrote the value
    // into the live row, so dropping the entry alone would leave the rejected
    // value on screen with a toast next to it saying it had not been saved.
    pendRollback(kind, id, fields);
    toast((o.failMsg || 'could not save') + ': ' + esc(err.message), 6000);
    // route() before onFail, so the handler is looking at the rebuilt page — and
    // after the rollback, so what it rebuilds is the value the server still
    // holds rather than the one that failed to land.
    route();
    if (o.onFail) o.onFail(before);
    // A timeout is not a refusal: the write may well have landed and only the
    // answer was lost. Ask the server what is actually true rather than leaving
    // the rollback standing as the last word.
    refresh();
    return false;
  }

  // The two-press delete confirm, and its timer. See ticketAct for why this is
  // not a data attribute on the button.
  let armedDelete = null, armTimer = 0;
  // Stop gets its own arm rather than sharing delete's. They sit on the same
  // page, and one variable would let a press on either finish the other.
  let armedStop = null, stopTimer = 0;
  // Same shape as armedDelete, and a module variable for the same reason: the
  // card or button that fired the first press is replaced by the next SSE
  // redraw, so arming anything on the node itself would be forgotten mid-window.
  let armedStart = null, startArmTimer = 0;
  // The paper-trail document you have open, and what it said. A page is
  // rebuilt by the SSE path and the overlay never was, so a document opened on
  // a ticket used to vanish a second later; app and project pages had the same
  // hole. Kept in memory, never localStorage — it is for the read you are in.
  let trailOpen = null;
  const trailCache = new Map();     // document id -> rendered html
  // The attach command produced by a start, carried across the navigation that
  // start now triggers. Keyed by ticket and dropped by route() the moment you
  // are looking at anything else — an unscoped stash puts one ticket's command
  // on the next ticket's page after a later restart.
  let pendingAttach = null;

  async function startTicket(t){
    if (!t) return;
    // Finished work has nothing to start. The button hid itself for these and
    // was the only mouse route; the keys reach the page's ticket, so the guard
    // belongs on the action rather than on the control.
    if (!isOpen(t)){
      toast('#' + t.id + ' is ' + esc(STATUS[t.status] || t.status) + ' — set it back to ready first');
      return;
    }
    tapKey('s');
    const live = Boolean(sessionFor(t));
    // Say what is in the way before cutting a worktree for work that cannot
    // land, and make the second press mean "anyway". Armed in a module
    // variable and confirmed by a toast rather than by confirm(): a modal
    // would block the SSE-driven page it interrupts, and the two-press arm is
    // the shape this board already uses for delete.
    //
    // Re-attaching a live session is never guarded — the work is already
    // underway, which is exactly the line bin/smriti-ticket draws by checking
    // blockers only on the path that CUTS a worktree.
    const blocked = !live && isBlocked(t);
    if (blocked && armedStart !== t.id){
      armedStart = t.id;
      clearTimeout(startArmTimer);
      startArmTimer = setTimeout(() => { armedStart = null; }, 6000);
      toast('#' + t.id + ' waits on ' +
        openBlockers(t).map((e) => '#' + e.blocker_id).join(' · ') +
        ' — press again to start it anyway', 6000);
      return;
    }
    clearTimeout(startArmTimer); armedStart = null;
    toast(live ? 'finding the session for <b>#' + t.id + '</b>…'
               : 'cutting a worktree for <b>#' + t.id + '</b>…', 8000);
    try {
      runCache.delete(t.id);          // a start is exactly when the trace moves
      // force only on the second press; an unblocked start sends an empty body
      // exactly as it always has.
      const res = await api('/api/tickets/' + t.id + '/start',
        { method: 'POST', body: blocked ? '{"force":true}' : '{}' });
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
    // Same reason as startTicket: re-shipping only bumps updated_at and
    // re-broadcasts, and the button that used to guard this is gone. The
    // stamp is where you move it somewhere else.
    if (t.status === 'shipped'){ toast('#' + t.id + ' is already shipped'); return; }
    tapKey('d');
    try { await api('/api/tickets/' + t.id + '/done', { method: 'POST', body: '{}' }); toast('#' + t.id + ' shipped ✓'); refresh(); }
    catch (e) { toast('could not update: ' + esc(e.message)); }
  }
  async function addTicket(title, where){
    const w = where || {};
    const body = JSON.stringify(Object.assign({ title }, w));
    // The card is on the board before the request leaves. It carries a
    // placeholder id and '_pending', which keeps it un-clickable until the real
    // one arrives — a page for a ticket the server has never heard of would
    // offer a start button that cannot work.
    const tmp = tempId();
    const proj = w.project ? projectById(w.project) : null;
    const now = new Date().toISOString();
    pendRowSet('ticket', tmp, 'add', {
      id: tmp, title, body: '', status: 'idea', priority: 0,
      repo_slug: w.repo || (proj && proj.repo_slug) || null,
      project_id: proj ? proj.id : null,
      project_ref: proj ? proj.slug : null,
      project_name: proj ? proj.name : null,
      branch: null, worktree_path: null, pr_url: null,
      created_at: now, updated_at: now, _pending: true,
    });
    S = applyPending(S);
    route();

    try {
      const res = await api('/api/tickets', { method: 'POST', body });
      pendRowPromote('ticket', tmp, res.id);
      S = applyPending(S);
      route();
      toast('added <b>#' + res.id + '</b> — press s to start it');
      refresh();
    } catch (e) {
      pendRowRollback('ticket', tmp);
      S = applyPending(S);
      route();
      throw e;      // capture() reports it; this only undoes the optimism
    }
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
      // Filing into a placeholder would send the server an id it cannot resolve.
      if (p && isTemp(p.id)){ toast('that project is still being created — one moment'); return; }
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
    const open = isOpen(t);

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
    // The stamp is the status control: x re-stamps it. role/tabindex make it
    // reachable, and onCtl in the key handler keeps its own Enter from also
    // firing the page's.
    h += '<div class="head edit" data-k="x" data-field="status" role="button" tabindex="0">' +
      '<span class="stamp big s-' + esc(t.status) + (changed ? ' struck' : '') + '">' +
      esc(STATUS[t.status] || t.status) + '</span></div>';
    // ↗ already means "opens elsewhere" on this page, so navigation moves onto
    // it and leaves the value free to be the edit target — editing has no
    // other route, while the app and project pages also sit in the margin.
    const goGlyph = (attr, val, what) =>
      '<a class="go" href="#" ' + attr + '="' + esc(String(val)) + '" title="open ' + esc(what) +
      '" aria-label="open ' + esc(what) + '">↗</a>';
    // One edge, as a line in the filing column. The far end names its app when
    // that app is not this ticket's — an edge may cross apps and projects, so
    // a bare "#41" is often something you cannot place. A blocker that has
    // landed is struck through: the row then reads as history rather than as
    // something still in the way.
    const edgeLine = (self, otherId, satisfied) => {
      const o = ticketById(otherId);
      // Compared against the ticket the ROW belongs to, passed in. It used to
      // close over the page's ticket while its caller took one as a parameter,
      // so the two only agreed because there was a single call site.
      const elsewhere = o && (o.repo_slug || '') !== (self.repo_slug || '');
      return '<span class="dep' + (satisfied ? ' met' : '') + '">' +
        '<span class="dnum">#' + otherId + '</span>' +
        // A ticket the current state does not carry is not an error — say what
        // is known rather than rendering a blank.
        (o ? esc(o.title) : '<span class="empty">not in view</span>') +
        (o && elsewhere ? '<span class="far">' + esc(appLabel(o.repo_slug || NO_APP)) + '</span>' : '') +
        (o ? goGlyph('data-tgo', otherId, o.title) : '') + '</span>';
    };
    const depRowsHtml = (tk) => {
      const by = blockersOf(tk), bl = blockingOf(tk);
      let s = '<div class="f edit dep-f" data-k="w" data-field="deps" role="button" tabindex="0">' +
        '<span class="k2">blocked by</span><span class="v' + (by.length ? '' : ' empty') + '">' +
        (by.length ? by.map((e) => edgeLine(tk, e.blocker_id, edgeSatisfied(e))).join('')
                   : 'nothing — free to start') + '</span></div>';
      if (bl.length){
        // Struck through once a dependent has landed, symmetrically with the
        // row above — otherwise this row cannot answer "what is still waiting
        // on me", which is the only question it is here to answer.
        s += '<div class="f"><span class="k2">blocks</span><span class="v">' +
          bl.map((e) => edgeLine(tk, e.blocked_id, isSatisfied(ticketById(e.blocked_id)))).join('') +
          '</span></div>';
      }
      return s;
    };
    // Its worktree lives in the app's tree, so a started ticket cannot change
    // apps — bin/smriti-ticket refuses it. The row states that rather than
    // offering a picker that would fail on submit.
    const held = isStarted(t);
    h += '<div class="lab">filed under</div><div class="filed">' +
      '<div class="f' + (held ? '' : ' edit') + '"' +
        (held ? '' : ' data-k="a" data-field="app" role="button" tabindex="0"') + '>' +
        '<span class="k2">app</span><span class="v' + (t.repo_slug ? '' : ' empty') + '">' +
        (t.repo_slug ? esc(appLabel(t.repo_slug)) + goGlyph('data-app', t.repo_slug, appLabel(t.repo_slug))
                     : 'no app yet') +
        (held ? '<span class="held">held by <b>' +
                  (t.branch ? esc(t.branch) : 'its worktree') + '</b></span>' : '') +
        '</span></div>' +
      '<div class="f edit" data-k="f" data-field="project" role="button" tabindex="0">' +
        '<span class="k2">project</span><span class="v' + (proj ? '' : ' empty') + '">' +
        (proj ? esc(proj.name) + goGlyph('data-proj', proj.id, proj.name)
              : 'loose in the app') + '</span></div>' +
      depRowsHtml(t) +
      '</div>';
    // The re-file <select> that used to sit here has moved up into the project
    // row, which can also do it for a ticket with no app yet — the case a
    // dropdown rendered only if (t.repo_slug) could never reach.
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
    // The board could start a session and replace one and had no way to END one,
    // so a run you were done with had to be killed in herdr — after which the
    // board went on claiming the ticket was running, because nothing reconciled
    // that. Beside restart because it is the same kind of act on the same thing;
    // armed like delete because it destroys a live pane and whatever command is
    // mid-flight in it.
    if (live) h += '<button class="btn danger" data-act="stop">' +
      (armedStop === t.id ? 'really stop?' : 'stop') + '</button>';
    // mark done / cancel / bring it back used to live here. All three were one
    // thing — a status write — and the stamp above is that control now, so
    // they were three buttons competing with the one action that is not just a
    // status change. d still ships a ticket in a keystroke.
    h += '</div></div>';
    h += '<div class="tear"><button class="btn danger" data-act="delete">' +
      (armedDelete === t.id ? 'really delete?' : 'delete') + '</button></div>';
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
    // Dispatched on the VIEW, not on a list of act names. wire() binds every
    // [data-act] on the sheet to this one handler, and everything below reads a
    // ticket and returns early without one — so any control on a non-ticket page
    // silently does nothing. Naming the two project acts here would have fixed
    // exactly those two and left the next one to fail the same silent way.
    if (view.kind === 'project') return projectAct(b);
    const t = view.kind === 'ticket' ? S.tickets.find((x) => x.id === view.id) : null;
    if (!t) return;
    const act = b.dataset.act;
    if (act === 'start') startTicket(t);
    if (act === 'restart'){
      toast('restarting the session for <b>#' + t.id + '</b>…', 8000);
      try {
        runCache.delete(t.id);
        const res = await api('/api/tickets/' + t.id + '/restart', { method: 'POST', body: '{}' });
        // Rendered HERE rather than left to refresh(): refresh() skips the
        // re-render while an editor is open and swallows a failed read, and a
        // restart whose attach command never appears is a restart you cannot use.
        pendingAttach = { id: t.id, res };
        go('#/t/' + t.id);
        refresh();
      } catch (e) { toast('could not restart: ' + esc(e.message)); }
    }
    if (act === 'stop'){
      if (armedStop !== t.id){
        armedStop = t.id; b.textContent = 'really stop?';
        clearTimeout(stopTimer);
        stopTimer = setTimeout(() => {
          armedStop = null;
          const again = document.querySelector('.sheet [data-act="stop"]');
          if (again) again.textContent = 'stop';
        }, 4000);
        return;
      }
      clearTimeout(stopTimer); armedStop = null;
      toast('stopping the session for <b>#' + t.id + '</b>…', 8000);
      try {
        runCache.delete(t.id);          // stopping is exactly when the trace moves
        const res = await api('/api/tickets/' + t.id + '/stop', { method: 'POST', body: '{}' });
        // Saying which of the two happened, because they fail independently:
        // a pane that could not be read is still closed, and losing the only
        // copy of what the run concluded is worth naming rather than implying.
        toast(res && res.captured === false
          ? 'session stopped — its pane could not be read, so nothing was kept'
          : 'session stopped, and what it said is on the ticket');
        refresh();
      } catch (e) { toast('could not stop: ' + esc(e.message)); }
    }
    if (act === 'delete'){
      // Armed in a module variable, not on the button. The button is a node
      // route() replaces on every SSE tick, so a ticket with a running agent
      // lost its armed state within the confirm window — the label silently
      // reverted and delete could never be completed. renderTicket reads this
      // back, so the confirm survives the redraw that used to eat it.
      if (armedDelete !== t.id){
        armedDelete = t.id; b.textContent = 'really delete?';
        clearTimeout(armTimer);
        armTimer = setTimeout(() => {
          armedDelete = null;
          const again = document.querySelector('.sheet [data-act="delete"]');
          if (again) again.textContent = 'delete';
        }, 4000);
        return;
      }
      clearTimeout(armTimer); armedDelete = null;
      // Out to the board first: the page you are standing on is about to stop
      // having a subject, and route() would bounce you anyway.
      pendRowSet('ticket', t.id, 'remove');
      S = applyPending(S);
      go('');
      try { await api('/api/tickets/' + t.id, { method: 'DELETE' }); toast('#' + t.id + ' deleted'); refresh(); }
      catch (e) {
        pendRowRollback('ticket', t.id);
        S = applyPending(S);
        route();
        toast('could not delete: ' + esc(e.message), 6000);
        refresh();
      }
    }
  }
  // ── projects: rename, delete, create ─────────────────────────────────
  // A project could be created and renamed and deleted from the CLI and over
  // the API since both existed — the board simply never called any of it, so a
  // project's name was fixed from the moment it was made and a stray one could
  // not be got rid of at all.
  const pageProject = () => (view.kind === 'project' ? projectById(view.id) : null) || null;

  async function projectAct(b){
    const p = pageProject();
    if (!p) return;
    // A placeholder id would 404, and worse, would read as the project being
    // broken rather than simply not saved yet. The window is one request wide.
    if (isTemp(p.id)){ toast('still being created — one moment'); return; }
    if (b.dataset.act === 'rename'){ renameProject(p); return; }

    // Same two-press confirm as a ticket, held in a module variable so the
    // SSE re-render underneath cannot quietly disarm it mid-window.
    const key = 'p' + p.id;
    if (armedDelete !== key){
      armedDelete = key; b.textContent = 'really delete? tickets go loose';
      clearTimeout(armTimer);
      armTimer = setTimeout(() => {
        armedDelete = null;
        const again = document.querySelector('[data-act="delproj"]');
        if (again) again.textContent = 'delete project';
      }, 4000);
      return;
    }
    clearTimeout(armTimer); armedDelete = null;
    // Gone from the state first, then navigated away, then told to the server.
    // Out to the app it lived in, or the board — this page is about to stop
    // having a subject.
    pendRowSet('project', p.id, 'remove');
    S = applyPending(S);
    go(p.repo_slug ? '#/r/' + encodeURIComponent(p.repo_slug) : '');
    try {
      await api('/api/projects/' + p.id, { method: 'DELETE' });
      toast('project deleted — its tickets are loose in the app');
      refresh();
    } catch (e) {
      // Put it back. The overlay is the only thing that removed it, so dropping
      // the entry restores the project AND the tickets it was holding.
      pendRowRollback('project', p.id);
      S = applyPending(S);
      route();
      toast('could not delete: ' + esc(e.message), 6000);
      refresh();
    }
  }

  function renameProject(p){
    tapKey('r');
    pickOpen({
      cue: 'rename project', placeholder: 'what this project is called',
      value: p.name,
      build: (q) => {
        const name = q.trim();
        // Nothing to commit until it differs — an accidental Enter on the
        // untouched name should close the picker, not fire a pointless PATCH.
        if (!name || name === p.name) return [];
        return [{ label: 'Rename to “' + name + '”', r: '⏎', act: () =>
          // esc: toast writes innerHTML, and this name is whatever was typed
          // into the box. Every other writeField call site escapes its subject.
          writeField('renamed to ' + esc(name),
            () => api('/api/projects/' + p.id, { method: 'PATCH', body: JSON.stringify({ name }) }),
            { kind: 'project', id: p.id, fields: { name } }) }];
      },
    });
  }

  // Where a new project lands: the app you are looking at, or the one that owns
  // the page you are on. '-' is smriti-project's explicit "no app yet", which
  // the server needs stated — its own cwd means nothing.
  function newProjectRepo(){
    if (view.kind === 'app') return view.slug;
    if (view.kind === 'project') return (pageProject() || {}).repo_slug || '';
    if (view.kind === 'ticket'){
      const t = S.tickets.find((x) => x.id === view.id);
      return (t && t.repo_slug) || '';
    }
    return '';
  }

  async function newProject(name){
    const repo = newProjectRepo();
    // The page exists before the server has heard of it. sqlite assigns the id,
    // so the row carries a placeholder until the answer comes back — and the
    // route uses that placeholder too, which is what makes the project page open
    // on the keystroke rather than two round trips later.
    const tmp = tempId();
    pendRowSet('project', tmp, 'add', {
      id: tmp, name, slug: '', description: '',
      repo_slug: repo || null, status: 'active', open: 0, _pending: true,
    });
    S = applyPending(S);
    go('#/p/' + tmp);

    try {
      const res = await api('/api/projects',
        { method: 'POST', body: JSON.stringify({ name, repo: repo || '-' }) });
      const id = res && res.id;
      if (!id) throw new Error('the board did not say which project it made');
      pendRowPromote('project', tmp, id);
      S = applyPending(S);
      // replace, not push: the placeholder route must not become a back-button
      // destination, because the id in it stops resolving the moment the real
      // row lands.
      if (location.hash === '#/p/' + tmp) location.replace('#/p/' + id);
      else route();
      toast('project “' + esc(name) + '” created');
      refresh();
    } catch (e) {
      pendRowRollback('project', tmp);
      S = applyPending(S);
      // Off the page that just stopped existing, back where it was opened from.
      if (location.hash === '#/p/' + tmp) go(repo ? '#/r/' + encodeURIComponent(repo) : '');
      else route();
      toast('could not create: ' + esc(e.message), 6000);
    }
  }

  // ── the stub's three pickers ─────────────────────────────────────────
  // The ticket the page is showing. Everything below reads it fresh at the
  // moment of the click: an agent may have rewritten it since the page was
  // drawn, and both the "current" marker and the app scoping depend on being
  // right about that.
  const pageTicket = () =>
    (view.kind === 'ticket' ? S.tickets.find((x) => x.id === view.id) : null) || null;

  function openFieldPicker(which){
    const t = pageTicket();
    if (!t) return;
    if (which === 'app'){
      if (isStarted(t)) return;   // held by its worktree
      pickApp(t);
    }
    else if (which === 'project') pickProject(t);
    else if (which === 'status') pickStatus(t);
    else if (which === 'deps') pickDep(t);
  }
  // All three end the same way: write through the CLI, then redraw. refresh()
  // re-runs route(), which re-renders the ticket page in place — so unlike the
  // overlay this replaced, there is nothing extra to re-open.
  // 'opt' is what the write settles locally: {kind, id, fields}. Given it, the
  // value lands the moment you pick it and the request goes out behind you —
  // the picker used to close onto the OLD value and sit there for a round-trip
  // that spawns five CLI processes. Without it this is the original
  // write-then-refetch, which the callers with no single field to name still use.
  async function writeField(msg, run, opt){
    if (opt){
      if (await writeOptimistic(opt.kind, opt.id, opt.fields, run)) toast(msg);
      return;
    }
    try {
      await run();
      toast(msg);
      await refresh();
    } catch (e) { toast(esc(e.message)); }
  }
  const patchTicket = (id, body) =>
    api('/api/tickets/' + id, { method: 'PATCH', body: JSON.stringify(body) });

  function pickApp(t){
    tapKey('a');
    // S.repositories, not appsWithWork(): this is every app you have stood in,
    // and filing something into one that has no tickets yet is exactly the
    // move being made here.
    pickOpen({
      cue: 'move to', placeholder: 'which app?',
      build: (q) => {
        const ql = q.trim().toLowerCase();
        const rows = (S.repositories || [])
          .filter((r) => !ql || r.slug.toLowerCase().includes(ql) || (r.name || '').toLowerCase().includes(ql))
          .map((r) => ({
            label: r.name || r.slug,
            r: r.slug === t.repo_slug ? 'current' : ((r.counts && r.counts.open) || 0) + ' open',
            // Moving apps drops the project with it — a project lives in one
            // app, so the old one cannot survive the move and showing it for a
            // round-trip would be a worse lie than the revert this replaces.
            //
            // ...but only when the app ACTUALLY changes. cmd_edit guards the
            // strand-clearing on the repo differing, so picking the app the
            // ticket is already in leaves project_id alone — and an overlay
            // claiming null against a project id the server keeps returning
            // never matches, so it would be re-applied over every read for the
            // life of the tab and quietly strand the ticket on screen.
            act: () => writeField('moved to ' + esc(appLabel(r.slug)),
              () => patchTicket(t.id, { repo: r.slug }),
              { kind: 'ticket', id: t.id, fields: r.slug === t.repo_slug
                  ? { repo_slug: r.slug }
                  : { repo_slug: r.slug, project_id: null } }),
          }));
        if (t.repo_slug && 'no app'.includes(ql))
          rows.push({ label: 'no app', r: 'back to an idea',
            act: () => writeField('back to an idea, in no app',
              () => patchTicket(t.id, { repo: '' }),
              { kind: 'ticket', id: t.id, fields: { repo_slug: '', project_id: null } }) });
        return rows;
      },
    });
  }

  function pickProject(t){
    tapKey('f');
    const active = (S.projects || []).filter((p) => p.status === 'active');
    // With an app, the choice is scoped to it. WITHOUT one, every app's
    // projects are offered and grouped — because a project settles the app
    // too, so one pick files a captured idea completely.
    const pool = t.repo_slug
      ? active.filter((p) => (p.repo_slug || NO_APP) === t.repo_slug)
      : active.slice().sort((a, b) =>
          String(a.repo_slug || '').localeCompare(String(b.repo_slug || '')) || a.name.localeCompare(b.name));
    pickOpen({
      cue: 'file into',
      placeholder: t.repo_slug ? 'which project?' : 'which project? its app comes too',
      build: (q) => {
        const ql = q.trim().toLowerCase();
        const rows = pool
          .filter((p) => !ql || p.name.toLowerCase().includes(ql) || String(p.slug || '').toLowerCase().includes(ql))
          .map((p) => ({
            label: p.name,
            group: t.repo_slug ? '' : appLabel(p.repo_slug || NO_APP),
            r: Number(t.project_id) === Number(p.id) ? 'current' : (p.open || 0) + ' open',
            // The app comes with it: bin/smriti-ticket takes the project's own
            // repo_slug, so mirroring only project_id here would leave the
            // "filed under" rows disagreeing until the read landed.
            act: () => writeField('filed into ' + esc(p.name),
              () => patchTicket(t.id, { project: String(p.id) }),
              { kind: 'ticket', id: t.id,
                fields: { project_id: p.id, repo_slug: p.repo_slug || '' } }),
          }));
        if (t.project_id != null && 'leave it loose'.includes(ql))
          rows.push({ label: 'leave it loose', group: t.repo_slug ? '' : '— or —', r: 'no project',
            act: () => writeField('now loose in ' + esc(appLabel(t.repo_slug || NO_APP)),
              () => patchTicket(t.id, { project: null }),
              { kind: 'ticket', id: t.id, fields: { project_id: null } }) });
        // An app with no projects yet would otherwise draw a blank panel,
        // which reads as a failure to load rather than as an empty shelf.
        if (!rows.length && !pool.length)
          rows.push({ label: (t.repo_slug ? appLabel(t.repo_slug) : 'no app') + ' has no projects yet',
            r: 'smriti project add', act: () => {} });
        return rows;
      },
    });
  }

  // Draw or cut a dependency. One picker for both, because "what is this
  // waiting on" is one question — the existing edges sit at the top, ready to
  // be removed, and everything else is a candidate blocker.
  //
  // Only --blocked-by is offered. The reverse direction is the same edge said
  // backwards, and a picker that could write either way would need the user to
  // choose a direction before choosing a ticket — two decisions where the page
  // already answers one of them by being the page it is. "dep --blocks" is
  // still there on the CLI for when you are looking at it from the other end.
  function pickDep(t){
    tapKey('w');
    pickOpen({
      cue: 'blocked by', placeholder: 'which ticket has to land first?',
      build: (q) => {
        const ql = q.trim().toLowerCase();
        const rows = [];
        for (const e of blockersOf(t)){
          const o = ticketById(e.blocker_id);
          const label = o ? o.title : 'ticket #' + e.blocker_id;
          if (ql && !label.toLowerCase().includes(ql) && !String(e.blocker_id).includes(ql)) continue;
          rows.push({
            label: label, group: 'remove',
            r: edgeSatisfied(e) ? 'landed' : 'waiting',
            act: () => writeField('#' + e.blocker_id + ' no longer blocks #' + t.id,
              () => api('/api/tickets/' + t.id + '/deps',
                { method: 'POST', body: JSON.stringify({ rm: e.blocker_id }) })),
          });
        }
        // Candidates: everything except itself and what it is already waiting
        // on. Tickets in other apps are offered too — a cross-app edge is the
        // common case, not an exotic one — and are grouped by app so the list
        // stays readable when it spans several.
        const already = new Set(blockersOf(t).map((e) => e.blocker_id));
        const pool = S.tickets
          .filter((x) => x.id !== t.id && !already.has(x.id) && !isSatisfied(x))
          .filter((x) => !ql || x.title.toLowerCase().includes(ql) || String(x.id).includes(ql));
        // Unfiltered, this is every open ticket in the factory, which is a wall
        // rather than a choice. Same app first, then a bounded remainder — type
        // to reach anything past it.
        const mine = pool.filter((x) => (x.repo_slug || '') === (t.repo_slug || ''));
        const others = pool.filter((x) => (x.repo_slug || '') !== (t.repo_slug || ''));
        for (const x of mine.concat(others).slice(0, ql ? 40 : 12)){
          rows.push({
            label: x.title,
            group: (x.repo_slug || '') === (t.repo_slug || '') ? 'add' : appLabel(x.repo_slug || NO_APP),
            r: '#' + x.id + ' · ' + (STATUS[x.status] || x.status),
            act: () => writeField('#' + t.id + ' now waits on #' + x.id,
              () => api('/api/tickets/' + t.id + '/deps',
                { method: 'POST', body: JSON.stringify({ blockedBy: x.id }) })),
          });
        }
        if (!rows.length)
          rows.push({ label: 'nothing to link to', r: 'no other open tickets', act: () => {} });
        return rows;
      },
    });
  }

  function pickStatus(t){
    tapKey('x');
    // All six, in lifecycle order. cancelled is in the list because the CLI
    // takes it — "smriti ticket status <id> cancelled" has always worked; only
    // the usage string said otherwise.
    const VALUES = Object.keys(STATUS);
    pickOpen({
      cue: 'set status', placeholder: 'idea, ready, building…',
      build: (q) => {
        const ql = q.trim().toLowerCase();
        return VALUES
          .filter((v) => !ql || v.includes(ql) || STATUS[v].includes(ql))
          .map((v) => ({
            label: STATUS[v],
            // The raw value the CLI takes, so the picker teaches
            // "smriti ticket status <id> in_review" while you use it.
            r: v === t.status ? 'current' : v,
            act: () => writeField('#' + t.id + ' → ' + STATUS[v],
              () => api('/api/tickets/' + t.id + '/status',
                { method: 'POST', body: JSON.stringify({ status: v }) }),
              { kind: 'ticket', id: t.id, fields: { status: v } }),
          }));
      },
    });
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
  // One load per ticket at a time. The chain is 1 + N sqlite-backed requests
  // and easily outlasts one SSE tick, and until it finishes there is nothing in
  // the cache to short-circuit the next call — so without this, five ticks into
  // a four-run ticket there are twenty-five requests in flight for one page.
  const runInFlight = new Set();
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
    if (runInFlight.has(ticketId)) return;
    runInFlight.add(ticketId);
    try {
      let runs, reports;
      try {
        const got = await api('/api/runs?ticket=' + ticketId);
        runs = got.runs || [];
        // Every run's report arrives with the run list, so filling N bodies
        // costs N fetches rather than 2N.
        reports = got.artifacts || [];
      }
      catch (e) {
        // A ticket with no runs comes back as an empty list, not an error — so
        // the only things reaching here are a broken store or a dead server.
        // Swallowing them renders "never run" for "cannot read", which is the
        // same lie the 503 on /api/state exists to prevent. Only worth saying
        // once, though: a stale trace is already on screen from the cache.
        if (!hit) toast('could not read the trace: ' + esc(e.message), 5000);
        return;
      }
      const here = () => (view.kind === 'ticket' && view.id === ticketId ? $('#runs') : null);
      if (!runs.length){
        const empty = '<div class="box b3"><div class="nothing">no runs yet' +
          '<div class="cmd">press s to cut a worktree and start</div></div></div>';
        runCache.set(ticketId, { at: Date.now(), live: false, runs, html: empty });
        const el = here();
        if (el && el.innerHTML !== empty) el.innerHTML = empty;
        paintTally(ticketId, runs);
        return;
      }
      // Shells first ONLY when there is nothing cached to lose. On a refresh
      // the stale trace stands until the new one is complete — painting bare
      // shells would blank the phase rows every ten seconds and collapse the
      // page height under whoever is reading them.
      if (!hit){ const el = here(); if (el) el.innerHTML = runs.map((r) => runShell(r)).join(''); }
      // Concurrently, not one after another: each of these spawns sqlite behind
      // the server, and awaiting them in sequence made opening a ticket with
      // several runs take as long as all of them put together.
      const bodies = await Promise.all(runs.map(async (r) => {
        const rep = reportHtml(reports.filter((a) => a.run_uid === r.run_uid));
        try { const d = await api('/api/run/' + r.run_uid); return rep + phaseBreakdown(d.phases || [], d.totals || {}); }
        catch { return rep; }
      }));
      const html = runs.map((r, i) => runShell(r, bodies[i])).join('');
      runCache.set(ticketId, { at: Date.now(), live: runs.some((r) => !r.ended_at), runs, html });
      // The view may have moved on while those were in flight; the cache is
      // still worth keeping, the paint is not.
      const el = here();
      if (el && el.innerHTML !== html) el.innerHTML = html;
      paintTally(ticketId, runs);
    } finally { runInFlight.delete(ticketId); }
  }
  // The header tally, corrected once every run is known. /api/state's window is
  // bounded, so the first paint can undercount a ticket with a long history.
  function paintTally(ticketId, runs){
    if (!(view.kind === 'ticket' && view.id === ticketId)) return;
    const el = $('#ttally');
    if (el) el.innerHTML = tallyTime(runs);
  }

  function runShell(r, body){
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
      '<div class="bd">' + (body || '') + '</div></div>';
  }

  // What the run concluded. Until this existed the text lived only in a herdr
  // pane, so shipping — which deletes the worktree and lets the board close the
  // pane — destroyed it.
  //
  // Two provenances, shown honestly. A run-written report gets no marker at all:
  // it is the normal case, and a badge on the normal case only teaches the eye
  // to ignore badges. A scrape is one viewport of terminal that happened not to
  // have scrolled away, so it says so in a sentence and folds its raw text away.
  function reportHtml(artifacts){
    const rep = (artifacts || []).find((a) => a.kind === 'report');
    if (!rep || !rep.body) return '';
    const scraped = rep.source === 'pane';
    if (scraped){
      return '<div class="rep scraped">' +
        '<p class="prov">recovered from the terminal — may be partial</p>' +
        '<pre class="raw">' + esc(rep.body) + '</pre></div>';
    }
    // The shape /begin writes is "label: value" lines. Parsed into a two-column
    // grid when it holds, rendered verbatim when it does not — a report that
    // arrived in some other shape is still the run's own words and must not be
    // dropped for failing to match a pattern.
    // (No backticks in here: this whole file is one template literal.)
    // The split argument is DOUBLE-escaped on purpose. This whole file is one
    // template literal, so a single backslash-n is consumed there and reaches
    // the browser as a real line break inside a string literal — which ends the
    // string, and the script stops parsing at that point. Same trap the regex on
    // the route matcher notes. (Do not write the sequence in these comments
    // either: it breaks the comment line and spills the rest into code.)
    const lines = String(rep.body).split('\\n').map((l) => l.trim()).filter(Boolean)
      .filter((l) => !/^✅/.test(l));
    const rows = lines.map((l) => {
      // Parentheses are in the class because the canonical last line of a
      // /begin report is "next (you): …" — the one row always present was the
      // one row that never got a label. And the separator demands a SPACE after
      // the colon, which is what keeps a bare URL in the body from parsing as a
      // field: "https://…" would otherwise render an uppercase HTTPS label
      // beside a mangled value.
      const m = l.match(/^([a-z][a-z ()]{0,14}): +(.+)$/i);
      return m
        ? '<div class="r"><span class="lb">' + esc(m[1]) + '</span><span class="v">' + esc(m[2]) + '</span></div>'
        : '<div class="r"><span class="v">' + esc(l) + '</span></div>';
    }).join('');
    return rows ? '<div class="rep">' + rows + '</div>' : '';
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

  // ── picker ───────────────────────────────────────────────────────────
  // One picker, several jobs. It was the command palette; it is now
  // parameterised, because the stub's fields need the same list-with-a-filter
  // and a second one would mean a second keymap branch and a second set of
  // styles in a file nothing type-checks.
  //
  // A caller supplies build(q) returning rows — so ranking and any cap stay
  // the caller's policy, not the widget's — and rows may carry a group, which
  // the project picker needs: on a ticket with no app it lists every app's
  // projects and has to say which is which.
  let palSel = 0, palItems = [], picker = null;

  function pickOpen(opts){
    picker = opts;
    $('#palv').classList.add('on');
    const cue = $('#palcue');
    cue.textContent = opts.cue || '';
    cue.style.display = opts.cue ? '' : 'none';
    const q = $('#palq');
    // Seeded for the pickers that EDIT a value rather than choose one — rename
    // starts from the current name, so a one-word fix is a one-word edit and
    // not a retype. Selected rather than merely placed: the common case is
    // replacing the name outright, and a caret at the end would make that the
    // slowest of the two.
    q.value = opts.value || '';
    q.placeholder = opts.placeholder || 'type a ticket title, or search…';
    palRender(q.value);
    q.focus();
    if (opts.value) q.select();
  }
  function pickCommit(i){
    const it = palItems[i];
    closeAll();
    if (it) it.act();
  }
  function palRender(q){
    if (!picker) return;
    palItems = picker.build(q) || [];
    palSel = 0;
    let seen = null;
    $('#palopts').innerHTML = palItems.map((it, i) => {
      let head = '';
      if (it.group && it.group !== seen){ head = '<div class="grp">' + esc(it.group) + '</div>'; seen = it.group; }
      return head + '<div class="o' + (i === palSel ? ' on' : '') + '" data-i="' + i + '">' +
        '<span>' + esc(it.label) + '</span><span class="r">' + esc(it.r || '') + '</span></div>';
    }).join('');
    $('#palopts').querySelectorAll('.o').forEach((el) =>
      el.addEventListener('click', () => pickCommit(Number(el.dataset.i))));
  }
  function palPaint(){
    $('#palopts').querySelectorAll('.o').forEach((el, i) => el.classList.toggle('on', i === palSel));
  }

  // ── the command palette, now the picker's first caller ───────────────
  function palOpen(){ tapKey('k'); pickOpen({ build: paletteItems }); }
  function paletteItems(q){
    const ql = q.trim().toLowerCase();
    const palItems = [];
    if (q.trim()){
      const into = view.kind === 'project' ? ' into this project'
        : view.kind === 'app' ? ' into ' + appLabel(view.slug)
        : view.kind === 'ticket' ? ' beside this one' : '';
      palItems.push({ label: 'New ticket — “' + q.trim() + '”' + into, r: '⏎', act: () => capture(q.trim()) });
      // Creating a project had no route into it from the board at all. It sits
      // under the ticket rather than above it because capturing a ticket is the
      // thing you do constantly and starting a project is the thing you do
      // occasionally — the palette's first row should stay the common one.
      const inApp = newProjectRepo();
      palItems.push({
        label: 'New project — “' + q.trim() + '”' + (inApp ? ' in ' + appLabel(inApp) : ''),
        r: 'project', act: () => newProject(q.trim()),
      });
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
    // The ten-row cap is this caller's ranking policy — the palette is a
    // shortlist over everything you own. The field pickers deliberately do not
    // cap: a list of your apps is short and must be complete.
    return palItems;
  }

  function closeAll(){
    ['palv','helpv','pacev'].forEach((id) => $('#' + id).classList.remove('on'));
    picker = null;
    // Hiding the veil takes the query input out of the page, but the browser
    // only moves focus off it on a later frame — and until it does,
    // activeElement is still an INPUT, so the typing guard swallows every key.
    // Closing a picker and immediately pressing another key found a dead
    // keyboard.
    const q = $('#palq');
    if (q && document.activeElement === q) q.blur();
  }

  // ── keyboard ─────────────────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    const inPal = $('#palv').classList.contains('on');
    // SELECT belongs here with INPUT and TEXTAREA: a native select is TYPED
    // into — s jumps to the first option starting with s — and without this
    // that keystroke also started the ticket, while ArrowDown/Up were
    // preventDefault-ed out from under the dropdown so it could not be
    // navigated by keyboard at all.
    const typing = e.target &&
      (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT');
    // A focused CONTROL owns its own Enter and Space — a link, a button, or
    // anything wearing role="button". Without this the global handler fires as
    // well: following a link would also start the ticket behind it, and on a
    // ticket page — where the page itself is the selection, so selectedTicket()
    // is never null — activating any button in the stub by keyboard would ALSO
    // cut a worktree and spawn a session.
    const onCtl = e.target && typeof e.target.closest === 'function' &&
      e.target.closest('a[href],button,[role="button"]');

    // A carried card is a modal state, and it comes first: it owns esc, ⏎ and
    // ⇧J/⇧K, and swallows everything else until you put it down. Letting s or d
    // fire under a card that is mid-air is how you lose track of what moved —
    // and esc especially, which otherwise navigates up a level and strands the
    // card lifted on a page you just left.
    // Caps Lock makes e.key report 'J' for an unshifted press and 'j' for a
    // shifted one, so matching on the capital letter alone swaps carry and
    // navigation for as long as the light is on. The modifier is the thing
    // being asked about; ask about it.
    const kl = e.key.length === 1 ? e.key.toLowerCase() : e.key;

    if (reorder && reorder.mode === 'key' && !typing){
      if (e.key === 'Escape'){ e.preventDefault(); carryRevert(); }
      else if (e.key === 'Enter'){ e.preventDefault(); carryCommit(); }
      else if (e.shiftKey && kl === 'j'){ e.preventDefault(); carryStep(1); }
      else if (e.shiftKey && kl === 'k'){ e.preventDefault(); carryStep(-1); }
      return;
    }

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
      else if (e.key === 'Enter'){ e.preventDefault(); pickCommit(palSel); }
      return;
    }
    if (typing) return;
    if (onCtl && (e.key === 'Enter' || e.key === ' ')) return;
    // A modifier means the key belongs to the browser or the OS — Cmd+F is
    // find, Cmd+A is select all, Cmd+X is cut. The single-letter keys below
    // must not answer for them, and a/f/x land on the ticket page, which is
    // the one surface with prose you would reach for those on. (Cmd+K is
    // handled above, before this point.)
    if (e.metaKey || e.ctrlKey) return;

    // j/k move the cursor; SHIFTED they carry the selected card, which reads as
    // "the same movement, but holding something". The first shifted press picks
    // the card up as well as moving it — a separate key to enter move mode
    // would be one more thing to remember for no gain.
    //
    // Handled here rather than as switch cases so both halves match on the
    // normalised letter and the shift modifier together. Keying off 'J' vs 'j'
    // instead would let Caps Lock swap the two.
    if (kl === 'j' || kl === 'k'){
      e.preventDefault();
      const d = kl === 'j' ? 1 : -1;
      if (e.shiftKey) carryStep(d); else move(d);
      return;
    }

    const t = selectedTicket();
    switch (e.key){
      case 'ArrowDown': e.preventDefault(); move(1); break;
      case 'ArrowUp': e.preventDefault(); move(-1); break;
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
      // stops refresh() re-rendering, since isBusy() then reports true.
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
      // The stub's fields. Only on a ticket page: these act on one ticket's
      // filing, and there is no such thing on a board or an app page.
      case 'a': if (view.kind === 'ticket' && t && !isStarted(t)){ e.preventDefault(); pickApp(t); } break;
      case 'f': if (view.kind === 'ticket' && t){ e.preventDefault(); pickProject(t); } break;
      case 'x': if (view.kind === 'ticket' && t){ e.preventDefault(); pickStatus(t); } break;
      // w for "waits on". NOT b, however well it would have read: b is the
      // margin toggle, and a second case 'b' in this switch is unreachable
      // code that looks like a working binding.
      case 'w': if (view.kind === 'ticket' && t){ e.preventDefault(); pickDep(t); } break;
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
  // Bound once, on the document rather than on a grid: the pointer leaves the
  // card the instant it lifts, and a drag that ends over the margin or off the
  // window still has to end. wire() only binds the pointerdown that starts it.
  document.addEventListener('pointermove', onGridMove);
  document.addEventListener('pointerup', onGridUp);
  document.addEventListener('pointercancel', cancelDrag);

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
