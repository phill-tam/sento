import { useState } from "react";
import ConfirmDialog from "../common/ConfirmDialog";
import styles from "../../styles/SentenceFolderTree.module.css";

/**
 * Flat, user-editable folder list for the Sentence Generator (epic 5).
 * Unlike CategoryTree, this isn't a fixed content-line taxonomy — folders
 * are created/renamed/deleted by the user. Fully controlled data (folders
 * array + selection owned by the parent), matching CategoryTree's and
 * ModeToggle's existing pattern — this component owns only transient UI
 * state (rename/create inputs, the delete-confirm gate), never fetches.
 *
 * folders: [{ id, name, sentenceCount }]
 * activeFolderId: string | null — null selects Uncategorized (folder_id=null)
 */
export default function SentenceFolderTree({
  folders,
  activeFolderId,
  onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
}) {
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [creating, setCreating] = useState(false);
  const [createValue, setCreateValue] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

  function startRename(folder) {
    setRenamingId(folder.id);
    setRenameValue(folder.name);
  }

  function commitRename(folderId) {
    const trimmed = renameValue.trim();
    if (trimmed) onRenameFolder(folderId, trimmed);
    setRenamingId(null);
    setRenameValue("");
  }

  function commitCreate() {
    const trimmed = createValue.trim();
    if (trimmed) onCreateFolder(trimmed);
    setCreating(false);
    setCreateValue("");
  }

  function requestDelete(folder) {
    // Gate 1 — hard-blocked while non-empty, no override, no dialog even
    // offered. Only an empty folder reaches gate 2 (the confirm dialog).
    if (folder.sentenceCount > 0) return;
    setPendingDeleteId(folder.id);
  }

  function confirmDelete() {
    onDeleteFolder(pendingDeleteId);
    setPendingDeleteId(null);
  }

  return (
    <>
      <ul className={styles.tree}>
        <li
          className={`${styles.folder} ${activeFolderId === null ? styles.activeCat : ""}`}
          onClick={() => onSelectFolder(null)}
        >
          <div className={styles.folderHead}>
            <span className={styles.ficon}>全</span>
            <span className={styles.fname}>—</span>
          </div>
        </li>

        {folders.map((folder) => (
          <li
            key={folder.id}
            className={`${styles.folder} ${activeFolderId === folder.id ? styles.activeCat : ""}`}
          >
            <div className={styles.folderHead} onClick={() => onSelectFolder(folder.id)}>
              <span className={styles.ficon}>文</span>
              {renamingId === folder.id ? (
                <input
                  className={styles.renameInput}
                  value={renameValue}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => commitRename(folder.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename(folder.id);
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                />
              ) : (
                <span className={styles.fname}>{folder.name}</span>
              )}
              <span className={styles.fcount}>{folder.sentenceCount}</span>
              <div className={styles.actions} onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className={styles.iconBtn}
                  title="Rename folder"
                  onClick={() => startRename(folder)}
                >
                  ✎
                </button>
                <button
                  type="button"
                  className={styles.iconBtn}
                  title={
                    folder.sentenceCount > 0
                      ? "Folder must be empty before it can be deleted"
                      : "Delete folder"
                  }
                  disabled={folder.sentenceCount > 0}
                  onClick={() => requestDelete(folder)}
                >
                  ✕
                </button>
              </div>
            </div>
          </li>
        ))}

        <li className={styles.folder}>
          {creating ? (
            <div className={styles.folderHead}>
              <span className={styles.ficon}>+</span>
              <input
                className={styles.renameInput}
                value={createValue}
                autoFocus
                placeholder="Folder name"
                onChange={(e) => setCreateValue(e.target.value)}
                onBlur={commitCreate}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitCreate();
                  if (e.key === "Escape") setCreating(false);
                }}
              />
            </div>
          ) : (
            <div className={styles.folderHead} onClick={() => setCreating(true)}>
              <span className={styles.ficon}>+</span>
              <span className={styles.fname}>New folder</span>
            </div>
          )}
        </li>
      </ul>

      <ConfirmDialog
        open={pendingDeleteId !== null}
        message="Delete this folder? This can't be undone."
        onConfirm={confirmDelete}
        onCancel={() => setPendingDeleteId(null)}
      />
    </>
  );
}