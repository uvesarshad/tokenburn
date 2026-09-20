/** 41298657020 -> "41.3B". Three significant digits, K/M/B/T. */
export function fmtTokens(n) {
  n = Math.max(0, Math.round(n));
  const units = [
    [1e12, 'T'],
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ];
  for (const [v, u] of units) {
    if (n >= v) {
      const x = n / v;
      const s = x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2);
      return s.replace(/\.?0+$/, '') + u;
    }
  }
  return String(n);
}

/** 41298657020 -> "41,298,657,020" */
export function fmtInt(n) {
  return Math.round(n).toLocaleString('en-US');
}

/** 14629.4 -> "$14,629"; 12.5 -> "$12.50"; 0.4 -> "$0.40" */
export function fmtMoney(c) {
  if (c >= 1e6) return `$${(c / 1e6).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (c >= 1000) return `$${Math.round(c).toLocaleString('en-US')}`;
  return `$${c.toFixed(2)}`;
}

export function fmtPct(f) {
  const p = f * 100;
  if (p > 0 && p < 1) return '<1%';
  return `${Math.round(p)}%`;
}

/** Shorten a model id for tight spaces: "claude-opus-4-5-20251101" -> "opus-4-5". */
export function shortModel(model, max = 16) {
  let s = String(model)
    .replace(/^(anthropic|openai|google|xai)[/:]/i, '')
    .replace(/^claude-/i, '')
    .replace(/-\d{8}$/, '')
    .replace(/-latest$/, '');
  if (s.length > max) s = s.slice(0, max);
  return s;
}
