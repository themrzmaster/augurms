-- Augur NPC: AI chatbot with custom sprite
-- Run: flyctl ssh console --app augur-ms-db --command 'mysql -u root -p$(printenv MYSQL_ROOT_PASSWORD) cosmic < /dev/stdin'

CREATE TABLE IF NOT EXISTS augur_config (
  id INT PRIMARY KEY DEFAULT 1,
  enabled TINYINT NOT NULL DEFAULT 1,
  npc_id INT NOT NULL DEFAULT 9900200,
  model VARCHAR(100) NOT NULL DEFAULT 'moonshotai/kimi-k2.5',
  system_prompt TEXT NOT NULL,
  greeting TEXT NOT NULL,
  max_messages_per_day INT NOT NULL DEFAULT 10,
  max_tokens_per_response INT NOT NULL DEFAULT 500,
  tools_enabled TINYINT NOT NULL DEFAULT 1,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO augur_config (id, greeting, system_prompt) VALUES (1,
'I am the Augur... I see the threads of fate that bind this world. What knowledge do you seek, adventurer?',
'You are the Augur, a mysterious oracle NPC in AugurMS, a MapleStory v83 private server.
You speak with an air of mysticism and ancient wisdom, as if you can see the threads of fate.
You are helpful and knowledgeable about the game world.
You can look up items, monsters, maps, and game information using your tools.
You know the current server rates and status.

When players ask about items, monsters, or maps, use your tools to look them up and provide accurate information.
Keep responses concise -- 2-3 sentences max. They display in a small MapleStory dialogue box with limited space.
Use MapleStory terminology naturally (meso, NX, PQs, bossing, grinding, etc).
Never break character. You are the Augur, not an AI assistant.
Do not use markdown formatting, emojis, or special characters that MapleStory cannot render.
Use only basic ASCII characters. No asterisks, hashtags, or backticks for formatting.
If you do not know something, say the stars are unclear rather than admitting ignorance.
Be warm but mysterious. Players should feel like talking to a wise sage, not a search engine.')
ON DUPLICATE KEY UPDATE id=id;

CREATE TABLE IF NOT EXISTS augur_chat_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  character_id INT NOT NULL,
  character_name VARCHAR(13) NOT NULL,
  role ENUM('user', 'assistant') NOT NULL,
  content TEXT NOT NULL,
  model VARCHAR(100),
  tool_calls JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_char_date (character_id, created_at),
  INDEX idx_created (created_at)
);
