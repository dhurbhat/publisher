DROP TABLE IF EXISTS feedback;
CREATE TABLE feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chapter_slug TEXT NOT NULL,
    sentence_id INTEGER NOT NULL,
    reader_did TEXT NOT NULL,
    feedback TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
