import { BOT_UA } from '../utils/constants.js';

/**
 * GitHub API 客户端
 */
export class GitHubClient {
  constructor(env) {
    this.env = env;
  }

  /**
   * 获取 JSON 文件内容
   */
  async fetchJson(filePath) {
    const url = `https://api.github.com/repos/${this.env.GITHUB_USER}/${this.env.GITHUB_REPO}/contents/${filePath}`;

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": BOT_UA,
          "Authorization": `Bearer ${this.env.GITHUB_TOKEN}`,
          "Accept": "application/vnd.github.v3.raw"
        }
      });

      if (!response.ok) return null;

      return await response.json();

    } catch (_error) {
      return null;
    }
  }
}