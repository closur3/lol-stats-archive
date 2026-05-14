import { BOT_UA, MAX_RETRIES } from '../../constants/index.js';

export async function fetchWithRetry(authContext, url, maxRetries = MAX_RETRIES) {
  if (!authContext || typeof authContext.cookie !== "string" || authContext.cookie.length === 0) {
    throw new Error("Fandom auth cookie missing");
  }
  let attempt = 1;
  const headers = {
    "User-Agent": BOT_UA,
    "Accept": "application/json",
    "Accept-Encoding": "gzip, deflate, br",
    "Cookie": authContext.cookie
  };

  while (attempt <= maxRetries) {
    try {
      const response = await fetch(url, { headers });
      if (response.status === 429 || response.status === 503) {
        const retryAfter = response.headers.get("Retry-After");
        const waitSeconds = retryAfter ? parseInt(retryAfter) : 30;
        throw new Error(`Wait ${waitSeconds}s`);
      }

      const rawBody = await response.text();
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      let apiResponse;
      try {
        apiResponse = JSON.parse(rawBody);
      } catch (error) {
        throw new Error(`JSON Parse Fail`, { cause: error });
      }

      if (apiResponse.error) {
        if (apiResponse.error.code === "maxlag") {
          const retryAfter = response.headers.get("Retry-After") || 5;
          throw new Error(`Wait ${retryAfter}s`);
        }
        throw new Error(`API Error [${apiResponse.error.code}]`);
      }
      if (!apiResponse.cargoquery) throw new Error(`Structure Error`);
      return apiResponse.cargoquery;
    } catch (error) {
      let waitTimeMs = 15000 * Math.pow(2, attempt - 1);
      const match = error.message.match(/Wait (\d+)s/);
      if (match) waitTimeMs = parseInt(match[1]) * 1000;

      if (attempt >= maxRetries) throw error;
      await new Promise(resolveDelay => setTimeout(resolveDelay, waitTimeMs));
      attempt++;
    }
  }
}
