import styles from "../../styles/CategoryTree.module.css";

/**
 * Generic category → item tree, fully controlled by the parent.
 * No knowledge of Kanji/Vocabulary/Grammar — each content-line page
 * supplies its own `categories` shape and open/active state.
 *
 * categories: [{
 *   id, label, labelJp, icon,
 *   count, total,               // generic progress badge, not tracked here
 *   open, active,
 *   items: [{ id, label, labelJp, icon, count, total, active, complete }]
 * }]
 */
export default function CategoryTree({ categories, onToggleCategory, onSelectItem }) {
  return (
    <ul className={styles.tree}>
      {categories.map((cat) => (
        <li
          key={cat.id}
          className={`${styles.folder} ${cat.open ? styles.open : ""} ${
            cat.active ? styles.activeCat : ""
          }`}
        >
          <div
            className={styles.folderHead}
            onClick={() => onToggleCategory(cat.id)}
          >
            <span className={styles.chev}>▶</span>
            <span className={styles.ficon}>{cat.icon}</span>
            <span className={styles.fname}>
              <span className={styles.en}>{cat.label}</span>
              <span className={styles.jp}>{cat.labelJp}</span>
            </span>
            <span className={styles.fcount}>
              {cat.count}/{cat.total}
            </span>
          </div>

          <ul className={styles.treeChildren}>
            {cat.items.map((item) => (
              <li
                key={item.id}
                className={`${styles.station} ${item.active ? styles.active : ""} ${
                  item.complete ? styles.complete : ""
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectItem(cat.id, item.id);
                }}
              >
                <span className={styles.dot} />
                <span className={styles.label}>
                  <span className={styles.jp}>
                    {item.icon}　{item.label}
                  </span>
                </span>
                <span className={styles.count}>
                  {item.count}/{item.total}
                </span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}