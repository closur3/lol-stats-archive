export async function kvPut(env, key, value) {
  console.log(`[KV] PUT ${key}`);
  return env["lol-stats-kv"].put(key, value);
}

export async function kvDelete(env, key) {
  console.log(`[KV] DEL ${key}`);
  return env["lol-stats-kv"].delete(key);
}

export async function kvPutIfChanged(env, key, value) {
  const oldValue = await env["lol-stats-kv"].get(key);
  const newSerialized = typeof value === "string" ? value : JSON.stringify(value);
  if (oldValue !== newSerialized) {
    console.log(`[KV] PUT ${key}`);
    return env["lol-stats-kv"].put(key, newSerialized);
  }
}

