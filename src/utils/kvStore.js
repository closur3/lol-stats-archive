export async function kvPut(env, key, value) {
  console.log(`[KV] PUT ${key}`);
  return env["lol-stats-kv"].put(key, value);
}

export async function kvDelete(env, key) {
  console.log(`[KV] DEL ${key}`);
  return env["lol-stats-kv"].delete(key);
}

