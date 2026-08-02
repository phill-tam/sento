import styles from "../../styles/UploadResultsList.module.css";

/**
 * Renders a BatchUploadResponse — per-row success/error plus aggregate
 * counts. Pure presentational: no fetching, no state. Parent (Content-
 * ManagementPage) owns the result via CsvUploadCard's onResult callback.
 */
export default function UploadResultsList({ result }) {
  if (!result) return null;

  const { results, success_count, error_count } = result;
  const errorRows = results.filter((r) => r.status === "error");

  return (
    <div className={styles.wrapper}>
      <div className={styles.summary}>
        <span className={styles.successCount}>{success_count} succeeded</span>
        {error_count > 0 && (
          <span className={styles.errorCount}>{error_count} failed</span>
        )}
      </div>

      {errorRows.length > 0 && (
        <ul className={styles.errorList}>
          {errorRows.map((row) => (
            <li key={row.row} className={styles.errorItem}>
              <span className={styles.rowNum}>Row {row.row}</span>
              <span className={styles.rowError}>{row.error}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}