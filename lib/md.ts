// smriti — a small, escape-first markdown renderer.
//
// Exists because smriti-html's mdLite handles only bold/italic/code/newline,
// and the board renders whole plan documents — headings, lists, tables and
// fenced code included. Escape-first: every source line is HTML-escaped before
// any markup is applied, so document content can never inject markup.
//
// Deliberately not CommonMark. No raw HTML passthrough, no images, no nested
// lists deeper than one level. Links allow http/https/# only.

// Placeholder for lifted code spans. U+0000 cannot appear in the output of
// escapeHtml (it is stripped there), so it can never be forged by a document.
const SPAN_MARK = '\u0000';
const SPAN_RE = /\u0000(\d+)\u0000/g;

export function escapeHtml(s: string): string {
  return s
    .replace(/\u0000/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function inline(s: string): string {
  let h = escapeHtml(s);

  // Code spans are lifted out BEFORE the emphasis and link passes and put back
  // after. Running those passes over code contents mangles exactly what plan
  // documents are full of: `*.md` became <code><em>.md</code> ... </em>,
  // `fn(*args, **kwargs)` fell apart, and a URL in backticks turned into a
  // live link inside <code>.
  const spans: string[] = [];
  h = h.replace(/`([^`]+)`/g, (_m, code) => {
    spans.push(code);
    return SPAN_MARK + (spans.length - 1) + SPAN_MARK;
  });

  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  // Links: the href was escaped above, so quotes can't break out of the
  // attribute; scheme is allowlisted so javascript: never survives.
  h = h.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text, href) =>
    /^(https?:\/\/|#)/i.test(href) ? `<a href="${href}" target="_blank" rel="noopener">${text}</a>` : text,
  );

  h = h.replace(SPAN_RE, (_m, i) => '<code>' + spans[Number(i)] + '</code>');
  return h;
}

export function renderMarkdown(src: string): string {
  const out: string[] = [];
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  let para: string[] = [];

  const flush = () => {
    if (para.length) {
      out.push(`<p>${para.map(inline).join('<br>\n')}</p>`);
      para = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    // fenced code
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      flush();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) buf.push(lines[i++]);
      i++; // closing fence
      out.push(`<pre><code>${escapeHtml(buf.join('\n'))}</code></pre>`);
      continue;
    }

    // heading
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flush();
      const level = h[1].length;
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      i++;
      continue;
    }

    // hr
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      flush();
      out.push('<hr>');
      i++;
      continue;
    }

    // blockquote
    if (/^>\s?/.test(line)) {
      flush();
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${buf.map(inline).join('<br>\n')}</blockquote>`);
      continue;
    }

    // table: a header row followed by a |---| separator
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      flush();
      const cells = (row: string) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim()));
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      out.push(
        `<table><thead><tr>${head.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>` +
          rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('') +
          `</tbody></table>`,
      );
      continue;
    }

    // lists (one level)
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ul || ol) {
      flush();
      const ordered = Boolean(ol);
      const items: string[] = [];
      const re = ordered ? /^\s*\d+\.\s+(.*)$/ : /^\s*[-*]\s+(.*)$/;
      while (i < lines.length) {
        const m = lines[i].match(re);
        if (m) {
          items.push(m[1]);
          i++;
        } else if (/^\s{2,}\S/.test(lines[i]) && items.length) {
          // continuation line folds into the previous item
          items[items.length - 1] += ' ' + lines[i].trim();
          i++;
        } else break;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((it) => `<li>${inline(it)}</li>`).join('')}</${tag}>`);
      continue;
    }

    if (line.trim() === '') {
      flush();
      i++;
      continue;
    }

    para.push(line);
    i++;
  }
  flush();
  return out.join('\n');
}
