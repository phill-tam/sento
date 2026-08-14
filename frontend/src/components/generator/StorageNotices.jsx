import styles from "../../styles/StorageNotices.module.css";

/**
 * The three things the generator has to say about browser storage
 * (epic 013). Deliberately three components rather than one with a
 * `severity` prop: they differ in persistence, copy and urgency, and
 * collapsing them would invite styling the permanent one like the
 * alarming one.
 */

/**
 * Permanent, non-dismissible, and quiet.
 *
 * The failure it prevents is silent and delayed: someone saves forty
 * sentences on their laptop, opens the app on their phone, and finds an
 * empty library with no explanation. A dismissible notice is dismissed
 * long before that moment arrives — which is exactly when it was needed —
 * so this has to survive being read. Hence a muted line rather than a
 * banner: its job is to still be there in six months, not to be noticed
 * today.
 */
export function DeviceStorageNote() {
  return (
    <p className={styles.deviceNote}>
      Saved in this browser — these sentences stay on this device and won&rsquo;t appear on your
      others.
    </p>
  );
}

/**
 * Storage is blocked (private browsing, a browser setting, a full disk).
 * An error, and loud, because saves genuinely will not persist: the store
 * throws rather than pretending, and the user needs to know before they
 * spend provider quota generating sentences they cannot keep.
 */
export function StorageUnavailableNotice() {
  return (
    <p className={styles.unavailable}>
      <strong>Your browser is blocking storage.</strong> Sentences you save now will be gone when
      you reload the page. Private browsing is the usual cause.
    </p>
  );
}

/**
 * Some stored data could not be read and was moved aside instead of being
 * dropped. Recoverable, not fatal — the bytes are still on disk under a
 * timestamped key — so this is a warning rather than an error, and it says
 * where the data went rather than just that something went wrong.
 */
export function QuarantineNotice({ keys }) {
  if (!keys || keys.length === 0) return null;

  return (
    <p className={styles.quarantine}>
      Some saved data couldn&rsquo;t be read and was set aside rather than deleted (
      {keys.length === 1 ? "1 entry" : `${keys.length} entries`}). It is still in this
      browser&rsquo;s storage under a key ending in <code>:quarantine:</code> and a timestamp.
    </p>
  );
}
