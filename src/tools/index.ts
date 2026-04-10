import { githubTools } from './github.js';
import { httpTools } from './http.js';

export const allTools = {
  ...githubTools,
  ...httpTools,
};
