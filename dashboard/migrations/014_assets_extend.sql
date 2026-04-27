-- Extend custom_assets to support custom NPC sprites and custom ETC items
-- in addition to the existing hair/face cosmetics.
--
--   asset_type 'npc'  → adds an entry to Npc.wz/<id>.img + String.wz/Npc.img.
--                       Single binary file_key is the source PNG sprite.
--   asset_type 'etc'  → adds an entry to Item.wz/Etc/<bucket>.img/<itemId>/info
--                       + String.wz/Etc.img. file_key is the PNG icon; attrs
--                       JSON holds slotMax / price / quest.
--
-- attrs is also used to carry NPC dialogue and any other per-type metadata
-- that doesn't fit a dedicated column.

ALTER TABLE custom_assets
  MODIFY COLUMN asset_type ENUM('hair', 'face', 'npc', 'etc') NOT NULL;

ALTER TABLE custom_assets
  ADD COLUMN attrs JSON NULL AFTER notes;
