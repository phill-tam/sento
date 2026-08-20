import styles from "../../styles/LeaderboardList.module.css";

/**
 * The board itself (epic 015) — a device's cumulative score, ranked.
 *
 * Keyed by array index, not `device_hash`. ADR 021 names hash
 * collisions as an accepted property, not a bug (a display concern, the
 * same way two Discord users could once share a #1234 discriminator) —
 * so device_hash is not guaranteed unique across entries and cannot
 * safely be a React key. The list is replaced wholesale on every fetch
 * rather than incrementally patched, so an index key costs nothing here.
 */
export default function LeaderboardList({ entries, loading }) {
  if (loading) {
    return <p className={styles.status}>Loading leaderboard…</p>;
  }

  if (entries.length === 0) {
    return <p className={styles.status}>No one has synced to the leaderboard yet.</p>;
  }

  return (
    <ol className={styles.list}>
      {entries.map((entry, i) => (
        <li key={i} className={styles.row}>
          <span className={styles.rank}>{i + 1}</span>
          <span className={styles.name}>
            {entry.display_name}
            <span className={styles.hash}> · {entry.device_hash}</span>
          </span>
          <span className={styles.score}>{entry.total_score}</span>
        </li>
      ))}
    </ol>
  );
}
