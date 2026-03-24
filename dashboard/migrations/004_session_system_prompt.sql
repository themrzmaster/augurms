-- Add system_prompt column to gm_sessions to store the full AI prompt (system + historical context)
ALTER TABLE gm_sessions ADD COLUMN system_prompt LONGTEXT AFTER prompt;
