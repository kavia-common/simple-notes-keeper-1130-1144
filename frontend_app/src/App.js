import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const STORAGE_KEY = "simple-notes-keeper:notes:v1";

/**
 * @typedef {Object} Note
 * @property {string} id
 * @property {string} title
 * @property {string} body
 * @property {number} createdAt
 * @property {number} updatedAt
 */

/**
 * Generates a reasonably unique ID without adding dependencies.
 * Uses crypto.randomUUID when available.
 */
function generateId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Parses a JSON string into notes, with validation and safe fallbacks.
 * @param {string | null} raw
 * @returns {Note[]}
 */
function parseStoredNotes(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((n) => n && typeof n === "object")
      .map((n) => {
        const title = typeof n.title === "string" ? n.title : "";
        const body = typeof n.body === "string" ? n.body : "";
        const id = typeof n.id === "string" ? n.id : generateId();
        const createdAt = typeof n.createdAt === "number" ? n.createdAt : Date.now();
        const updatedAt = typeof n.updatedAt === "number" ? n.updatedAt : createdAt;
        return { id, title, body, createdAt, updatedAt };
      });
  } catch {
    return [];
  }
}

/**
 * Formats a timestamp for display.
 * @param {number} ts
 */
function formatDateTime(ts) {
  try {
    return new Date(ts).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

// PUBLIC_INTERFACE
function App() {
  /** @type {[Note[], Function]} */
  const [notes, setNotes] = useState(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const initial = parseStoredNotes(raw);

    // Helpful first-run note
    if (initial.length === 0) {
      const now = Date.now();
      return [
        {
          id: generateId(),
          title: "Welcome to Simple Notes Keeper",
          body:
            "Create notes, search, and sort them. Everything is saved locally in your browser (localStorage).\n\nTip: Use Ctrl/Cmd + Enter to save quickly.",
          createdAt: now,
          updatedAt: now,
        },
      ];
    }
    return initial;
  });

  const [selectedId, setSelectedId] = useState(() => (notes[0] ? notes[0].id : null));
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("updatedDesc"); // updatedDesc | updatedAsc | titleAsc | titleDesc
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [draftId, setDraftId] = useState(null); // null => creating new

  const titleInputRef = useRef(null);

  // Persist to localStorage
  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  }, [notes]);

  // Keep selection valid if notes list changes (e.g., deletion)
  useEffect(() => {
    if (selectedId && notes.some((n) => n.id === selectedId)) return;
    setSelectedId(notes[0] ? notes[0].id : null);
  }, [notes, selectedId]);

  const selectedNote = useMemo(() => notes.find((n) => n.id === selectedId) || null, [notes, selectedId]);

  const filteredAndSorted = useMemo(() => {
    const q = query.trim().toLowerCase();

    const filtered = q
      ? notes.filter((n) => {
          const haystack = `${n.title}\n${n.body}`.toLowerCase();
          return haystack.includes(q);
        })
      : notes.slice();

    const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

    filtered.sort((a, b) => {
      switch (sortBy) {
        case "updatedAsc":
          return a.updatedAt - b.updatedAt;
        case "updatedDesc":
          return b.updatedAt - a.updatedAt;
        case "titleAsc":
          return collator.compare(a.title || "", b.title || "");
        case "titleDesc":
          return collator.compare(b.title || "", a.title || "");
        default:
          return b.updatedAt - a.updatedAt;
      }
    });

    return filtered;
  }, [notes, query, sortBy]);

  function openCreate() {
    setDraftId(null);
    setDraftTitle("");
    setDraftBody("");
    setIsEditorOpen(true);
  }

  function openEdit(note) {
    setDraftId(note.id);
    setDraftTitle(note.title);
    setDraftBody(note.body);
    setIsEditorOpen(true);
  }

  useEffect(() => {
    if (!isEditorOpen) return;
    // Focus title input when editor opens
    const t = setTimeout(() => titleInputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [isEditorOpen]);

  function upsertNote() {
    const title = draftTitle.trim();
    const body = draftBody.trim();

    // Allow empty title/body, but not both empty (avoid accidental empty notes)
    if (!title && !body) return;

    const now = Date.now();

    if (!draftId) {
      const newNote = {
        id: generateId(),
        title,
        body,
        createdAt: now,
        updatedAt: now,
      };
      setNotes((prev) => [newNote, ...prev]);
      setSelectedId(newNote.id);
    } else {
      setNotes((prev) =>
        prev.map((n) =>
          n.id === draftId
            ? {
                ...n,
                title,
                body,
                updatedAt: now,
              }
            : n
        )
      );
      setSelectedId(draftId);
    }

    setIsEditorOpen(false);
  }

  function deleteNote(noteId) {
    const note = notes.find((n) => n.id === noteId);
    const label = note?.title?.trim() ? `"${note.title.trim()}"` : "this note";
    // eslint-disable-next-line no-alert
    const ok = window.confirm(`Delete ${label}? This cannot be undone.`);
    if (!ok) return;

    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    if (selectedId === noteId) {
      setSelectedId(null);
    }
  }

  function clearAll() {
    // eslint-disable-next-line no-alert
    const ok = window.confirm("Delete ALL notes? This cannot be undone.");
    if (!ok) return;
    setNotes([]);
    setSelectedId(null);
    setQuery("");
    setIsEditorOpen(false);
  }

  function handleEditorKeyDown(e) {
    // Save on Ctrl/Cmd + Enter
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      upsertNote();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setIsEditorOpen(false);
    }
  }

  return (
    <div className="App">
      <div className="appShell">
        <header className="topbar">
          <div className="brand">
            <div className="brandMark" aria-hidden="true" />
            <div className="brandText">
              <div className="brandTitle">Simple Notes Keeper</div>
              <div className="brandSubtitle">Local-first notes (saved in your browser)</div>
            </div>
          </div>

          <div className="topbarActions">
            <button className="btn btnPrimary" type="button" onClick={openCreate}>
              New note
            </button>
            <button className="btn btnDangerGhost" type="button" onClick={clearAll} disabled={notes.length === 0}>
              Clear all
            </button>
          </div>
        </header>

        <main className="content">
          <section className="panel leftPanel" aria-label="Notes list">
            <div className="panelHeader">
              <div className="searchRow">
                <label className="srOnly" htmlFor="search">
                  Search notes
                </label>
                <input
                  id="search"
                  className="input"
                  value={query}
                  placeholder="Search notes…"
                  onChange={(e) => setQuery(e.target.value)}
                />
                <div className="countPill" title="Matching notes">
                  {filteredAndSorted.length}
                </div>
              </div>

              <div className="sortRow">
                <label className="fieldLabel" htmlFor="sortBy">
                  Sort
                </label>
                <select id="sortBy" className="select" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                  <option value="updatedDesc">Updated (newest)</option>
                  <option value="updatedAsc">Updated (oldest)</option>
                  <option value="titleAsc">Title (A → Z)</option>
                  <option value="titleDesc">Title (Z → A)</option>
                </select>
              </div>
            </div>

            <div className="notesList" role="list">
              {filteredAndSorted.length === 0 ? (
                <div className="emptyState">
                  <div className="emptyTitle">No notes found</div>
                  <div className="emptyDesc">Try a different search, or create a new note.</div>
                  <button className="btn btnPrimary" type="button" onClick={openCreate}>
                    Create a note
                  </button>
                </div>
              ) : (
                filteredAndSorted.map((n) => {
                  const isActive = n.id === selectedId;
                  const title = n.title?.trim() || "Untitled";
                  const preview = (n.body || "").trim().split("\n").filter(Boolean)[0] || "No content";
                  return (
                    <button
                      key={n.id}
                      type="button"
                      className={`noteRow ${isActive ? "active" : ""}`}
                      onClick={() => setSelectedId(n.id)}
                      role="listitem"
                      aria-current={isActive ? "true" : "false"}
                    >
                      <div className="noteRowTop">
                        <div className="noteTitle">{title}</div>
                        <div className="noteTime" title={`Updated ${formatDateTime(n.updatedAt)}`}>
                          {formatDateTime(n.updatedAt)}
                        </div>
                      </div>
                      <div className="notePreview">{preview}</div>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          <section className="panel rightPanel" aria-label="Note details">
            {!selectedNote ? (
              <div className="detailEmpty">
                <div className="detailEmptyTitle">Select a note</div>
                <div className="detailEmptyDesc">Choose a note from the list, or create a new one.</div>
                <button className="btn btnPrimary" type="button" onClick={openCreate}>
                  New note
                </button>
              </div>
            ) : (
              <div className="detail">
                <div className="detailHeader">
                  <div className="detailHeaderLeft">
                    <div className="detailTitle">{selectedNote.title?.trim() || "Untitled"}</div>
                    <div className="detailMeta">
                      <span>Created {formatDateTime(selectedNote.createdAt)}</span>
                      <span className="dot" aria-hidden="true">
                        •
                      </span>
                      <span>Updated {formatDateTime(selectedNote.updatedAt)}</span>
                    </div>
                  </div>

                  <div className="detailHeaderActions">
                    <button className="btn btnSecondary" type="button" onClick={() => openEdit(selectedNote)}>
                      Edit
                    </button>
                    <button className="btn btnDanger" type="button" onClick={() => deleteNote(selectedNote.id)}>
                      Delete
                    </button>
                  </div>
                </div>

                <div className="detailBody">
                  <pre className="noteBody">{selectedNote.body?.trim() ? selectedNote.body : "No content"}</pre>
                </div>
              </div>
            )}
          </section>
        </main>

        {isEditorOpen ? (
          <div className="modalOverlay" role="dialog" aria-modal="true" aria-label="Note editor">
            <div className="modalCard">
              <div className="modalHeader">
                <div className="modalTitle">{draftId ? "Edit note" : "New note"}</div>
                <button className="iconBtn" type="button" onClick={() => setIsEditorOpen(false)} aria-label="Close editor">
                  ×
                </button>
              </div>

              <div className="modalContent" onKeyDown={handleEditorKeyDown}>
                <div className="field">
                  <label className="fieldLabel" htmlFor="title">
                    Title
                  </label>
                  <input
                    id="title"
                    ref={titleInputRef}
                    className="input"
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    placeholder="Untitled"
                  />
                </div>

                <div className="field">
                  <label className="fieldLabel" htmlFor="body">
                    Body
                  </label>
                  <textarea
                    id="body"
                    className="textarea"
                    value={draftBody}
                    onChange={(e) => setDraftBody(e.target.value)}
                    placeholder="Write your note…"
                    rows={10}
                  />
                  <div className="hintRow">
                    <span className="hint">Tip: Ctrl/Cmd + Enter to save • Esc to close</span>
                    <span className="hint">
                      {Math.max(0, draftBody.length)} chars
                    </span>
                  </div>
                </div>
              </div>

              <div className="modalFooter">
                <button className="btn" type="button" onClick={() => setIsEditorOpen(false)}>
                  Cancel
                </button>
                <button className="btn btnPrimary" type="button" onClick={upsertNote}>
                  Save
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <footer className="footer">
          <span>
            Stored locally in <code>localStorage</code> • No backend required
          </span>
        </footer>
      </div>
    </div>
  );
}

export default App;
