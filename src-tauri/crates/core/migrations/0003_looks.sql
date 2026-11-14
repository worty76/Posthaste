-- User looks. Each row holds one validated, re-serialized look document;
-- the id says where it came from ("user:<uuid>"). The bundled looks ship as
-- data files and are never stored here.
CREATE TABLE looks (
    id         TEXT PRIMARY KEY NOT NULL,
    doc        TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
) WITHOUT ROWID;

CREATE INDEX looks_by_created ON looks (created_at DESC);
