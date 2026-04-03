declare namespace Cloudflare {
  interface Env {
    "lol-stats-kv": KVNamespace;
    GITHUB_USER: string;
    GITHUB_REPO: string;
    GITHUB_TOKEN?: string;
    FANDOM_USER: string;
    FANDOM_PASS?: string;
    ADMIN_SECRET?: string;
    CRON_INTERVAL_MINUTES: string;
    SLOW_THRESHOLD_MINUTES: string;
    UPDATE_ROUNDS: string;
    MAX_SCHEDULE_DAYS: string;
    GITHUB_TIME?: string;
    GITHUB_SHA?: string;
  }
}

interface ExecutionContext {
  waitUntil(promise: Promise<any>): void;
  passThroughOnException(): void;
}

interface ScheduledEvent {
  readonly cron: string;
  readonly scheduledTime: number;
  readonly noRetry: boolean;
}
