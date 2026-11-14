-- Full-text index over note content and category. External-content table:
-- the text lives only in `notes`; triggers keep the index in step.
CREATE VIRTUAL TABLE notes_fts USING fts5(
    content,
    category,
    content = 'notes',
    content_rowid = 'seq',
    tokenize = 'unicode61 remove_diacritics 2',
    prefix = '2 3'
);

INSERT INTO notes_fts (rowid, content, category)
SELECT seq, content, category FROM notes;

CREATE TRIGGER notes_fts_insert AFTER INSERT ON notes BEGIN
    INSERT INTO notes_fts (rowid, content, category)
    VALUES (new.seq, new.content, new.category);
END;

CREATE TRIGGER notes_fts_delete AFTER DELETE ON notes BEGIN
    INSERT INTO notes_fts (notes_fts, rowid, content, category)
    VALUES ('delete', old.seq, old.content, old.category);
END;

CREATE TRIGGER notes_fts_update AFTER UPDATE OF content, category ON notes BEGIN
    INSERT INTO notes_fts (notes_fts, rowid, content, category)
    VALUES ('delete', old.seq, old.content, old.category);
    INSERT INTO notes_fts (rowid, content, category)
    VALUES (new.seq, new.content, new.category);
END;
