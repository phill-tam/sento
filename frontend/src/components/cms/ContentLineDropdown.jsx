import styles from "../../styles/ContentLineDropdown.module.css";

const LINES = [
  { id: "kanji", label: "Kanji" },
  { id: "vocab", label: "Vocabulary" },
  { id: "grammar", label: "Grammar" },
];

/**
 * Switches which content line's data feeds CsvUploadCard and the
 * inventory CategoryTree. Fully controlled — no internal state.
 */
export default function ContentLineDropdown({ activeLine, onSelectLine }) {
  return (
    <select
      className={styles.dropdown}
      value={activeLine}
      onChange={(e) => onSelectLine(e.target.value)}
    >
      {LINES.map((line) => (
        <option key={line.id} value={line.id}>
          {line.label}
        </option>
      ))}
    </select>
  );
}