import { useRef, useState } from "react";
import styles from "../../styles/CsvUploadCard.module.css";

/**
 * Drag-and-drop + click-to-browse CSV upload for the active content line.
 * onUpload: async (file) => BatchUploadResponse — caller supplies the actual
 * API call (uploadKanjiCsv/uploadVocabCsv/uploadGrammarCsv), this component
 * has no knowledge of which content line is active.
 * onResult: (BatchUploadResponse | null) => void — lifts the result up so
 * the parent can also refresh the inventory tree after a successful upload.
 */
export default function CsvUploadCard({ onUpload, onResult, disabled = false }) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const inputRef = useRef(null);

  async function handleFile(file) {
    if (!file || disabled) return;
    setIsUploading(true);
    setErrorMessage(null);
    onResult(null); // clear stale results immediately, not left visible mid-flight

    try {
      const result = await onUpload(file);
      onResult(result);
    } catch (err) {
      setErrorMessage(err.message || "Upload failed");
    } finally {
      setIsUploading(false);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    handleFile(file);
  }

  return (
    <div
      className={`${styles.card} ${isDragging ? styles.dragging : ""} ${
        disabled ? styles.disabled : ""
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && !isUploading && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className={styles.hiddenInput}
        disabled={disabled || isUploading}
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <div className={styles.prompt}>
        {isUploading ? (
          <span>Uploading…</span>
        ) : (
          <>
            <span className={styles.promptMain}>Drop a CSV here or click to browse</span>
            <span className={styles.promptSub}>One file per content line</span>
          </>
        )}
      </div>
      {errorMessage && <div className={styles.error}>{errorMessage}</div>}
    </div>
  );
}