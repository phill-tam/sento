import { useEffect, useRef, useState } from "react";
import styles from "../../styles/TopBarSearch.module.css";

/**
 * The search box, as it appears in the top bar below the breakpoint
 * (epic 011). Above the breakpoint search stays in the sidebar and this
 * component is not rendered at all — App.jsx renders one or the other,
 * never both, so there is only ever a single search field in the
 * accessibility tree.
 *
 * Search is promoted to the bar because it is the one control that
 * already works ACROSS content lines — searchIndex matches kanji, vocab
 * and grammar at once, and matches romaji regardless of the display
 * preference. Leaving it in the sidebar once the sidebar became a drawer
 * would have buried the only cross-line control two taps deep inside a
 * per-line navigation surface.
 *
 * Collapsed it is a 44px icon button; expanded it overlays the bar
 * rather than expanding inline. At 375px the bar cannot spare the room
 * inline — three rail buttons plus the drawer trigger at 44px each leave
 * roughly 135px once gaps are counted, and the longest realistic romaji
 * query (epic 009's own よろしくおねがいします -> yoroshikuonegaishimasu)
 * needs 174px at the field's 13px body font. Overlaying clears that
 * comfortably. A literal ~50px field would hold four characters and
 * would break romaji search, which is the feature this promotion exists
 * to serve.
 *
 * Owns only its expanded/collapsed state, the same way SettingsButton
 * owns its popover's — the query itself stays in App.jsx.
 */
export default function TopBarSearch({ value, onChange, readOnly = false }) {
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef(null);
  const triggerRef = useRef(null);
  const hadFocus = useRef(false);

  // Focus follows the expansion, but only after the render that actually
  // swaps the elements — the trigger is unmounted while expanded, so
  // focusing it in the same tick would focus a detached node.
  useEffect(() => {
    if (expanded) {
      inputRef.current?.focus();
      hadFocus.current = true;
    } else if (hadFocus.current) {
      triggerRef.current?.focus();
      hadFocus.current = false;
    }
  }, [expanded]);

  function collapse() {
    // Clearing on dismiss is what keeps the drawer honest: results
    // render in the drawer, so a query left behind a collapsed field
    // would leave the drawer showing results for a search the user can
    // no longer see or edit.
    onChange("");
    setExpanded(false);
  }

  return (
    <div className={`${styles.wrap} ${expanded ? styles.isExpanded : ""}`}>
      {expanded ? (
        <div className={styles.field}>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search everything…"
            value={value}
            onChange={readOnly ? undefined : (e) => onChange(e.target.value)}
            readOnly={readOnly}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                // Don't let this reach the shell's Escape handler, or
                // dismissing the search would close the drawer too.
                e.stopPropagation();
                collapse();
              }
            }}
          />
          <button
            type="button"
            className={styles.dismiss}
            title="Close search"
            aria-label="Close search"
            onClick={collapse}
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          className={styles.trigger}
          title="Search"
          aria-label="Search"
          aria-expanded="false"
          onClick={() => setExpanded(true)}
        >
          <span aria-hidden="true">⌕</span>
        </button>
      )}
    </div>
  );
}
