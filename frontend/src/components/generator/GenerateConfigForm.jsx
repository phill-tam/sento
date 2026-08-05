import { useState } from "react";
import styles from "../../styles/GenerateConfigForm.module.css";

/**
 * Count (1-3) + nuance/topic input, single "Generate" trigger. Fully
 * controlled — onGenerate(count, nuance) is called on submit; the actual
 * API call and phase transition live in useSentenceGenerator (Step 7),
 * called from GeneratePage (Step 15), not here.
 *
 * sourceItemCount: shown for context ("Generating from N selected
 * items") — this form has no knowledge of what the source items are,
 * just how many, matching the epic's "2-5 items carried forward" flow.
 */
export default function GenerateConfigForm({ sourceItemCount, onGenerate, isGenerating }) {
  const [count, setCount] = useState(1);
  const [nuance, setNuance] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    if (isGenerating) return;
    onGenerate(count, nuance.trim() || null);
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <p className={styles.context}>
        Generating from {sourceItemCount} selected item{sourceItemCount === 1 ? "" : "s"}
      </p>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="sentence-count">
          Sentences to generate
        </label>
        <div className={styles.countStepper}>
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              type="button"
              className={`${styles.countBtn} ${count === n ? styles.countBtnActive : ""}`}
              onClick={() => setCount(n)}
              aria-pressed={count === n}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="sentence-nuance">
          Nuance or topic (optional)
        </label>
        <input
          id="sentence-nuance"
          type="text"
          className={styles.nuanceInput}
          placeholder="e.g. ordering food at a restaurant"
          value={nuance}
          onChange={(e) => setNuance(e.target.value)}
        />
      </div>

      <button type="submit" className={styles.generateBtn} disabled={isGenerating}>
        {isGenerating ? "Generating…" : "Generate"}
      </button>
    </form>
  );
}