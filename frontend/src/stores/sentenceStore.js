/**
 * Where saved sentences and folders come from (epic 013).
 *
 * Everything above this line — App.jsx, useSentenceGenerator — imports
 * persistence from here rather than from api.js, and knows nothing about
 * where the records actually live. That is the whole point of the module:
 * it is the frontend twin of the backend's get_provider(), the one place
 * that would branch.
 *
 * Today it does not branch. Saved sentences live in the user's browser,
 * because the production tables are unauthenticated and are being reserved
 * for signed-in users; api.js keeps its own copies of these eight
 * functions, unused, for when auth lands and this file gains its switch.
 * Building that switch now would mean one arm no caller can reach.
 *
 * Generation is deliberately NOT here. It needs a provider API key, so it
 * stays on the server and keeps being imported straight from api.js.
 */
export {
  getSentenceFolders,
  createSentenceFolder,
  renameSentenceFolder,
  deleteSentenceFolder,
  getSentences,
  saveSentences,
  moveSentence,
  deleteSentence,
  getStorageStatus,
} from "./localSentenceStore";
