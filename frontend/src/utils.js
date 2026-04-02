export function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatPace(speedMs, imperial) {
  if (!speedMs || speedMs <= 0) return '—';
  if (imperial) {
    const secsPerMile = 1609.34 / speedMs;
    const mins = Math.floor(secsPerMile / 60);
    const secs = Math.round(secsPerMile % 60);
    return `${mins}:${String(secs).padStart(2, '0')} /mi`;
  }
  const secsPerKm = 1000 / speedMs;
  const mins = Math.floor(secsPerKm / 60);
  const secs = Math.round(secsPerKm % 60);
  return `${mins}:${String(secs).padStart(2, '0')} /km`;
}

export function formatDistance(meters, imperial) {
  if (imperial) return (meters / 1609.34).toFixed(2);
  return (meters / 1000).toFixed(2);
}

export function unitLabel(imperial) {
  return imperial ? 'mi' : 'km';
}

export function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

export function formatElapsed(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

export function formatCost(input_tokens, output_tokens) {
  if (!input_tokens) return null;
  const cost = (input_tokens / 1_000_000) * 3 + (output_tokens / 1_000_000) * 15;
  return `$${cost.toFixed(4)} · ${input_tokens.toLocaleString()} in / ${output_tokens} out`;
}
