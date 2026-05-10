export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function escapeJsArg(value) {
  return escapeHtml(JSON.stringify(String(value ?? "")));
}

export function escapeUrl(value) {
  return escapeHtml(encodeURI(String(value ?? "")));
}
