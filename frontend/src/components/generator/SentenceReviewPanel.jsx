import { useState } from "react";
import styles from "../../styles/SentenceReviewPanel.module.css";
import { useRomaji } from "../../context/RomajiContext";

/**
 * Kept pool + current round's candidates, keep/discard controls,
 * Regenerate/Save actions, API-limit notice. Purely presentational over
 * useSentenceGenerator's state (Step 7) — GeneratePage (Step 15) owns
 * the hook instance and passes its return values down as props here,
 * so the hook has exactly one owner.
 *
 * candidates: current round's ephemeral items, each carrying _tempId
 * keptSentences: accumulated across regenerate rounds, same _tempId shape
 * phase: "idle" | "generating" | "reviewing" — from the hook
 * folders: [{ id, name }] — for the save-destination select
 */
export default function SentenceReviewPanel({
  candidates,
  keptSentences,
  phase,
  error,
  rateLimitError,
  folders,
  onKeep,
  onDiscard,
  onRemoveKept,
  onRegenerate,
  onSave,
}) {
  const [saveFolderId, setSaveFolderId] = useState("");
  const { isVisible: showRomaji } = useRomaji();
  const isGenerating = phase === "generating";
  const hasKept = keptSentences.length > 0;

  function handleSave() {
    onSave(saveFolderId || null);
  }

  return (
    <div className={styles.panel}>
      {rateLimitError && (
        <div className={styles.rateLimitNotice}>
          <strong>Generation limit reached.</strong> {rateLimitError} Your kept
          sentences are safe — try regenerating again in a moment.
        </div>
      )}
      {error && !rateLimitError && <div className={styles.errorNotice}>{error}</div>}

      {hasKept && (
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Kept ({keptSentences.length})</h3>
          <ul className={styles.candidateList}>
            {keptSentences.map((s) => (
              <li key={s._tempId} className={styles.candidate}>
                <div className={styles.text}>
                  <div className={styles.jp}>{s.jp_text}</div>
                  <div className={styles.reading}>{s.reading}</div>
                  {showRomaji && s.romaji && (
                    <div className={styles.romaji}>{s.romaji}</div>
                  )}
                  <div className={styles.meaning}>{s.meaning_en}</div>
                </div>
                <button
                  type="button"
                  className={styles.removeBtn}
                  title="Remove from kept"
                  onClick={() => onRemoveKept(s._tempId)}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>
          {isGenerating ? "Generating…" : `This round (${candidates.length})`}
        </h3>
        {isGenerating ? (
          <p className={styles.generatingNotice}>Contacting the AI provider…</p>
        ) : candidates.length === 0 ? (
          <p className={styles.emptyNotice}>No candidates left to review this round.</p>
        ) : (
          <ul className={styles.candidateList}>
            {candidates.map((c) => (
              <li key={c._tempId} className={styles.candidate}>
                <div className={styles.text}>
                  <div className={styles.jp}>{c.jp_text}</div>
                  <div className={styles.reading}>{c.reading}</div>
                  {showRomaji && c.romaji && (
                    <div className={styles.romaji}>{c.romaji}</div>
                  )}
                  <div className={styles.meaning}>{c.meaning_en}</div>
                </div>
                <div className={styles.candidateActions}>
                  <button type="button" className={styles.keepBtn} onClick={() => onKeep(c._tempId)}>
                    Keep
                  </button>
                  <button
                    type="button"
                    className={styles.discardBtn}
                    onClick={() => onDiscard(c._tempId)}
                  >
                    Discard
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className={styles.footer}>
        <button
          type="button"
          className={styles.regenerateBtn}
          disabled={isGenerating}
          onClick={onRegenerate}
        >
          Regenerate
        </button>

        <div className={styles.saveGroup}>
          <select
            className={styles.folderSelect}
            value={saveFolderId}
            onChange={(e) => setSaveFolderId(e.target.value)}
            disabled={!hasKept}
          >
            <option value="">Uncategorized</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={styles.saveBtn}
            disabled={!hasKept || isGenerating}
            onClick={handleSave}
          >
            Save ({keptSentences.length})
          </button>
        </div>
      </div>
    </div>
  );
}