import fs from "node:fs";

import { readTournamentConfig } from "../../../src/core/facts/tournamentConfigReader.js";

const configPath = process.argv[2];
if (!configPath) throw new Error("TournamentConfig path missing");

const storedConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
const env = {
  "lol-stats-kv": {
    get: async () => storedConfig
  }
};
const config = await readTournamentConfig(env);
console.log(`TournamentConfig valid: ${config.configDigest}`);
