-- The largest change in winning chances from one move, for the "Biggest swing" sort.
-- Existing analyses get it from the statistics job, which runs when the server starts.
ALTER TABLE game_analysis_stats ADD COLUMN max_swing real;

-- The Explore page's default order
CREATE INDEX games_played_order_idx ON games (played_date DESC NULLS LAST, imported_at DESC, id);
