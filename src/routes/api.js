import { isUnauthorized } from "./api/auth.js";
import { handleBackup } from "./api/backup.js";
import { handleDeleteArchive, handleManualArchive, handleRebuildArchive } from "./api/archiveActions.js";
import { handleForceUpdate } from "./api/force.js";

export class APIRouter {
  static handleBackup = handleBackup;
  static handleForceUpdate = handleForceUpdate;
  static handleRebuildArchive = handleRebuildArchive;
  static handleDeleteArchive = handleDeleteArchive;
  static handleManualArchive = handleManualArchive;
  static isUnauthorized = isUnauthorized;
}
