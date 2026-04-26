const STYLE_MUTED_DASH = 'style="color:#cbd5e1"';
const STYLE_SPINE_BOLD = 'style="font-weight:700"';
const STYLE_SPINE_SEP = 'style="opacity:0.4;"';

export function mkSpine(val, sep) {
  if (!val || val === "-") return `<span ${STYLE_MUTED_DASH}>-</span>`;
  const parts = val.split(sep);
  if (parts.length !== 2) return val;
  return `<div class="spine-row"><span class="spine-l" ${STYLE_SPINE_BOLD}>${parts[0]}</span><span class="spine-sep" ${STYLE_SPINE_SEP}>${sep}</span><span class="spine-r" ${STYLE_SPINE_BOLD}>${parts[1]}</span></div>`;
}