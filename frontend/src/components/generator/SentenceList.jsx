import SentenceListItem from "./SentenceListItem";
import styles from "../../styles/SentenceList.module.css";

/**
 * Saved-sentence browser for the Generate page's "browsing" workflow
 * phase (App.jsx's generatorWorkflowPhase). Fully controlled — no
 * fetching here, GeneratePage (Step 15) owns the sentences array via
 * api.js's getSentences().
 */
export default function SentenceList({ sentences, folders, onRelocate, onDelete }) {
  if (sentences.length === 0) {
    return <p className={styles.empty}>No saved sentences in this folder yet.</p>;
  }

  return (
    <ul className={styles.list}>
      {sentences.map((sentence) => (
        <SentenceListItem
          key={sentence.id}
          sentence={sentence}
          folders={folders}
          onRelocate={onRelocate}
          onDelete={onDelete}
        />
      ))}
    </ul>
  );
}