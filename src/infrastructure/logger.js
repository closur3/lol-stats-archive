import { dateUtils } from '../utils/dateUtils.js';

export class Logger {
  constructor() {
    this.logs = [];
  }

  error(message) {
    this.logs.push({
      timestamp: dateUtils.getNow().shortDateTimeString,
      level: 'ERROR',
      message
    });
  }

  success(message) {
    this.logs.push({
      timestamp: dateUtils.getNow().shortDateTimeString,
      level: 'SUCCESS',
      message
    });
  }

  export() {
    return this.logs;
  }
}