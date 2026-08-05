import { API_BASE_URL } from "./config";

export class ApiError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

// Thrown specifically when the backend's SentenceGenerationError shape is
// detected on a 429 — lets useSentenceGenerator (epic 5) show the dedicated
// rate-limit notice instead of a generic failure message, per the epic's
// "clear error notice, not silent failure" requirement.
export class RateLimitError extends ApiError {
  constructor(message, opts) {
    super(message, opts);
    this.name = "RateLimitError";
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!response.ok) {
    let body = null;
    try {
      body = await response.json();
    } catch {
      // no JSON body on this error response — body stays null
    }

    if (response.status === 429 && body?.detail?.error === "rate_limit_exceeded") {
      throw new RateLimitError(body.detail.detail || "Rate limit exceeded", {
        status: response.status,
        body,
      });
    }

    throw new ApiError(`API request failed: ${response.status} ${response.statusText}`, {
      status: response.status,
      body,
    });
  }

  // DELETE endpoints return 204 with no body — parsing that as JSON throws.
  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function uploadCsv(path, file) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    body: formData,
    // no Content-Type header here — the browser sets multipart/form-data
    // with the correct boundary itself; setting it manually breaks the upload
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export function uploadKanjiCsv(file) {
  return uploadCsv("/api/v1/kanji/upload", file);
}

export function uploadVocabCsv(file) {
  return uploadCsv("/api/v1/vocab/upload", file);
}

export function uploadGrammarCsv(file) {
  return uploadCsv("/api/v1/grammar/upload", file);
}

function buildListQuery({ category, status } = {}) {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (status) params.set("status", status);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function getKanji(options) {
  return request(`/api/v1/kanji${buildListQuery(options)}`);
}

export function getVocab(options) {
  return request(`/api/v1/vocab${buildListQuery(options)}`);
}

export function getGrammar(options) {
  return request(`/api/v1/grammar${buildListQuery(options)}`);
}

export function getSentenceFolders() {
  return request("/api/v1/sentence-folders");
}

export function createSentenceFolder(name) {
  return request("/api/v1/sentence-folders", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function renameSentenceFolder(folderId, name) {
  return request(`/api/v1/sentence-folders/${folderId}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export function deleteSentenceFolder(folderId) {
  return request(`/api/v1/sentence-folders/${folderId}`, { method: "DELETE" });
}

function buildSentenceListQuery({ folderId } = {}) {
  const params = new URLSearchParams();
  if (folderId) params.set("folder_id", folderId);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function generateSentences({ sourceItemRefs, count, nuance }) {
  return request("/api/v1/sentences/generate", {
    method: "POST",
    body: JSON.stringify({ source_item_refs: sourceItemRefs, count, nuance }),
  });
}

export function saveSentences({ sentences, folderId }) {
  return request("/api/v1/sentences", {
    method: "POST",
    body: JSON.stringify({ sentences, folder_id: folderId }),
  });
}

export function getSentences(options) {
  return request(`/api/v1/sentences${buildSentenceListQuery(options)}`);
}

export function moveSentence(sentenceId, folderId) {
  return request(`/api/v1/sentences/${sentenceId}`, {
    method: "PATCH",
    body: JSON.stringify({ folder_id: folderId }),
  });
}

export function deleteSentence(sentenceId) {
  return request(`/api/v1/sentences/${sentenceId}`, { method: "DELETE" });
}