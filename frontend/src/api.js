import { API_BASE_URL } from "./config";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
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