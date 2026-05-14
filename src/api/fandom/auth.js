import { BOT_UA, FANDOM_API } from '../../constants/index.js';
import { dataUtils } from '../../utils/dataUtils.js';

const MAX_LOGIN_RETRIES = 3;

function readLoginToken(tokenData) {
  const loginToken = tokenData?.query?.tokens?.logintoken;
  if (typeof loginToken !== "string" || loginToken.length === 0) {
    throw new Error("Invalid login token payload");
  }
  return loginToken;
}

function readLoginResult(loginData) {
  if (!loginData || typeof loginData !== "object" || Array.isArray(loginData)) {
    throw new Error("Invalid login payload");
  }
  const login = loginData.login;
  if (!login || typeof login !== "object" || Array.isArray(login)) {
    throw new Error("Invalid login payload");
  }
  if (login.result !== "Success") {
    const result = typeof login.result === "string" && login.result ? login.result : "unknown";
    throw new Error(`Login Failed: ${result}`);
  }
  if (typeof login.lgusername !== "string" || login.lgusername.length === 0) {
    throw new Error("Invalid login username payload");
  }
  return login;
}

export async function login(user, pass) {
  if (!user || !pass) {
    throw new Error("Missing Fandom credentials: FANDOM_BOT_USERNAME/FANDOM_BOT_PASSWORD");
  }

  for (let attempt = 1; attempt <= MAX_LOGIN_RETRIES; attempt++) {
    try {
      const tokenResp = await fetch(`${FANDOM_API}?action=query&meta=tokens&type=login&format=json`, {
        headers: { "User-Agent": BOT_UA }
      });
      if (!tokenResp.ok) throw new Error(`Token HTTP Error: ${tokenResp.status}`);

      const tokenData = await tokenResp.json();
      const loginToken = readLoginToken(tokenData);

      const step1Cookie = dataUtils.extractCookies(tokenResp.headers);
      const loginParams = new URLSearchParams();
      loginParams.append("action", "login");
      loginParams.append("format", "json");
      loginParams.append("lgname", user);
      loginParams.append("lgpassword", pass);
      loginParams.append("lgtoken", loginToken);

      const loginResp = await fetch(FANDOM_API, {
        method: "POST",
        body: loginParams,
        headers: { "User-Agent": BOT_UA, "Cookie": step1Cookie }
      });
      const loginData = await loginResp.json();
      const loginResult = readLoginResult(loginData);

      const step2Cookie = dataUtils.extractCookies(loginResp.headers);
      return { cookie: `${step1Cookie}; ${step2Cookie}`, username: loginResult.lgusername };
    } catch (error) {
      console.error(`[FANDOM:AUTH] attempt=${attempt}/${MAX_LOGIN_RETRIES} error=${error.message}`);
      if (attempt < MAX_LOGIN_RETRIES) {
        await new Promise(resolveDelay => setTimeout(resolveDelay, attempt * 2000));
      }
    }
  }

  throw new Error(`[Fandom Login] All attempts failed`);
}
