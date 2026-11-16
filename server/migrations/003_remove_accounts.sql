-- Sign-in was removed: anyone can import games and analyses, and no account data is kept
DROP TABLE sessions;
ALTER TABLE games DROP COLUMN uploaded_by;
ALTER TABLE game_analyses DROP COLUMN analyzed_by;
DROP TABLE users;
