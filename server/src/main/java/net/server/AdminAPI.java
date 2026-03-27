package net.server;

import client.Character;
import client.inventory.InventoryType;
import client.inventory.Item;
import com.sun.net.httpserver.HttpServer;
import com.sun.net.httpserver.HttpExchange;
import constants.inventory.ItemConstants;
import net.server.world.World;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import server.ItemInformationProvider;
import server.TimerManager;
import server.life.LifeFactory;
import server.life.NPC;
import server.maps.MapleMap;

import tools.DatabaseConnection;

import java.awt.Point;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;

/**
 * Lightweight HTTP API for the dashboard to control the game server.
 * Listens on port 8585 (internal network only).
 */
public class AdminAPI {
    private static final Logger log = LoggerFactory.getLogger(AdminAPI.class);
    private static final int PORT = 8585;
    private HttpServer server;

    public void start() {
        try {
            server = HttpServer.create(new InetSocketAddress(PORT), 0);
            server.createContext("/rates", this::handleRates);
            server.createContext("/status", this::handleStatus);
            server.createContext("/drop", this::handleDrop);
            server.createContext("/message", this::handleMessage);
            server.createContext("/npc", this::handleNpcSpawn);
            server.setExecutor(null);
            server.start();
            log.info("Admin API started on port {}", PORT);
            loadRatesFromDb();
            spawnCustomNpcs();
        } catch (IOException e) {
            log.error("Failed to start Admin API", e);
        }
    }

    public void stop() {
        if (server != null) server.stop(0);
    }

    private void handleRates(HttpExchange ex) throws IOException {
        if ("GET".equals(ex.getRequestMethod())) {
            getRates(ex);
        } else if ("PUT".equals(ex.getRequestMethod())) {
            setRates(ex);
        } else {
            respond(ex, 405, "{\"error\":\"Method not allowed\"}");
        }
    }

    private void getRates(HttpExchange ex) throws IOException {
        World world = Server.getInstance().getWorld(0);
        if (world == null) {
            respond(ex, 500, "{\"error\":\"World 0 not found\"}");
            return;
        }
        String json = String.format(
            "{\"exp_rate\":%d,\"meso_rate\":%d,\"drop_rate\":%d,\"boss_drop_rate\":%d}",
            world.getExpRate(), world.getMesoRate(), world.getDropRate(), world.getBossDropRate()
        );
        respond(ex, 200, json);
    }

    private void setRates(HttpExchange ex) throws IOException {
        String body = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        World world = Server.getInstance().getWorld(0);
        if (world == null) {
            respond(ex, 500, "{\"error\":\"World 0 not found\"}");
            return;
        }

        // Simple JSON parsing (no dependencies needed)
        Integer expRate = extractInt(body, "exp_rate");
        Integer mesoRate = extractInt(body, "meso_rate");
        Integer dropRate = extractInt(body, "drop_rate");
        Integer bossDropRate = extractInt(body, "boss_drop_rate");

        StringBuilder changes = new StringBuilder();
        if (expRate != null) { world.setExpRate(expRate); changes.append("exp_rate=").append(expRate).append(" "); }
        if (mesoRate != null) { world.setMesoRate(mesoRate); changes.append("meso_rate=").append(mesoRate).append(" "); }
        if (dropRate != null) { world.setDropRate(dropRate); changes.append("drop_rate=").append(dropRate).append(" "); }
        if (bossDropRate != null) { world.setBossDropRate(bossDropRate); changes.append("boss_drop_rate=").append(bossDropRate).append(" "); }

        if (changes.length() == 0) {
            respond(ex, 400, "{\"error\":\"No valid rates provided\"}");
            return;
        }

        log.info("Admin API: Rates updated — {}", changes.toString().trim());
        saveRatesToDb(world);
        respond(ex, 200, String.format(
            "{\"success\":true,\"exp_rate\":%d,\"meso_rate\":%d,\"drop_rate\":%d,\"boss_drop_rate\":%d}",
            world.getExpRate(), world.getMesoRate(), world.getDropRate(), world.getBossDropRate()
        ));
    }

    private void handleStatus(HttpExchange ex) throws IOException {
        if (!"GET".equals(ex.getRequestMethod())) {
            respond(ex, 405, "{\"error\":\"Method not allowed\"}");
            return;
        }
        Server srv = Server.getInstance();
        int totalPlayers = 0;
        for (World w : srv.getWorlds()) {
            totalPlayers += w.getPlayerStorage().getAllCharacters().size();
        }
        World w0 = srv.getWorld(0);
        String json = String.format(
            "{\"online\":true,\"players\":%d,\"exp_rate\":%d,\"meso_rate\":%d,\"drop_rate\":%d}",
            totalPlayers,
            w0 != null ? w0.getExpRate() : 0,
            w0 != null ? w0.getMesoRate() : 0,
            w0 != null ? w0.getDropRate() : 0
        );
        respond(ex, 200, json);
    }

    private void handleDrop(HttpExchange ex) throws IOException {
        if (!"POST".equals(ex.getRequestMethod())) {
            respond(ex, 405, "{\"error\":\"Method not allowed\"}");
            return;
        }

        String body = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);

        // Parse required fields
        Integer itemId = extractInt(body, "itemId");
        Integer quantity = extractInt(body, "quantity");
        String characterName = extractString(body, "characterName");
        Integer characterId = extractInt(body, "characterId");
        Integer mapId = extractInt(body, "mapId");
        Integer x = extractInt(body, "x");
        Integer y = extractInt(body, "y");
        Integer worldId = extractInt(body, "world");

        if (itemId == null) {
            respond(ex, 400, "{\"error\":\"itemId is required\"}");
            return;
        }
        if (quantity == null || quantity < 1) quantity = 1;
        if (worldId == null) worldId = 0;

        World world = Server.getInstance().getWorld(worldId);
        if (world == null) {
            respond(ex, 500, "{\"error\":\"World not found\"}");
            return;
        }

        // Find the target character (by name or id)
        Character target = null;
        if (characterName != null) {
            target = world.getPlayerStorage().getCharacterByName(characterName);
        } else if (characterId != null) {
            target = world.getPlayerStorage().getCharacterById(characterId);
        }

        // Target must be an online player (needed as dropper/owner for the drop packet)
        if (target == null) {
            // If characterName/Id didn't find anyone, and we have mapId+x+y, try to find ANY player on that map
            if (mapId != null && x != null && y != null) {
                for (var ch : world.getChannels()) {
                    MapleMap m = ch.getMapFactory().getMap(mapId);
                    var players = m.getAllPlayers();
                    if (!players.isEmpty()) {
                        target = players.get(0);
                        break;
                    }
                }
            }
            if (target == null) {
                respond(ex, 400, "{\"error\":\"No online player found. Provide characterName/characterId of an online player, or ensure someone is on the target map.\"}");
                return;
            }
        }

        // Determine map and drop position
        MapleMap map = target.getMap();
        Point dropPos;

        if (mapId != null && x != null && y != null) {
            // Use explicit map + coords if given
            map = target.getClient().getChannelServer().getMapFactory().getMap(mapId);
            dropPos = new Point(x, y);
        } else {
            // Drop in front of the character
            Point pos = target.getPosition();
            dropPos = new Point(pos.x + 30, pos.y);
        }

        // Create item — use proper equip generation for equip items (matching !drop command)
        ItemInformationProvider ii = ItemInformationProvider.getInstance();
        int qty = Math.min(quantity, 999);
        Item toDrop;
        if (ItemConstants.getInventoryType(itemId) == InventoryType.EQUIP) {
            toDrop = ii.getEquipById(itemId);
        } else {
            toDrop = new Item(itemId, (short) 0, (short) qty);
        }
        toDrop.setOwner("");

        // Spawn on the map's event thread to match how GM commands work
        final Character dropTarget = target;
        final MapleMap dropMap = map;
        final Point finalDropPos = dropPos;
        // Use TimerManager to run on game thread
        TimerManager.getInstance().schedule(() -> {
            dropMap.spawnItemDrop(dropTarget, dropTarget, toDrop, finalDropPos, true, true);
        }, 0);

        log.info("Admin API: Dropped {}x item {} on map {} at ({},{})", quantity, itemId, map.getId(), dropPos.x, dropPos.y);
        respond(ex, 200, String.format(
            "{\"success\":true,\"itemId\":%d,\"quantity\":%d,\"mapId\":%d,\"x\":%d,\"y\":%d}",
            itemId, quantity, map.getId(), dropPos.x, dropPos.y
        ));
    }

    private void handleMessage(HttpExchange ex) throws IOException {
        if (!"POST".equals(ex.getRequestMethod())) {
            respond(ex, 405, "{\"error\":\"Method not allowed\"}");
            return;
        }

        String body = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        String message = extractString(body, "message");

        if (message == null || message.isEmpty()) {
            respond(ex, 400, "{\"error\":\"message is required\"}");
            return;
        }

        World world = Server.getInstance().getWorld(0);
        if (world == null) {
            respond(ex, 500, "{\"error\":\"World 0 not found\"}");
            return;
        }

        world.setServerMessage(message);
        log.info("Admin API: Server message updated — {}", message);
        respond(ex, 200, String.format("{\"success\":true,\"message\":\"%s\"}", message.replace("\"", "\\\"")));
    }

    /**
     * On startup, spawn custom NPCs from gm_npcs + plife tables using the same
     * method as !npc command (broadcastMessage spawnNPC) so they are interactive.
     */
    private void spawnCustomNpcs() {
        try (Connection con = DatabaseConnection.getConnection();
             PreparedStatement ps = con.prepareStatement(
                     "SELECT p.map, p.life, p.x, p.y, p.fh FROM plife p " +
                     "INNER JOIN gm_npcs g ON g.npc_id = p.life AND g.enabled = 1 " +
                     "WHERE p.type = 'n' AND p.world = 0")) {
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    int mapId = rs.getInt("map");
                    int npcId = rs.getInt("life");
                    int x = rs.getInt("x");
                    int y = rs.getInt("y");
                    int fh = rs.getInt("fh");
                    spawnNpcOnMap(mapId, npcId, x, y, fh);
                }
            }
        } catch (Exception e) {
            log.warn("Failed to spawn custom NPCs", e);
        }
    }

    private void spawnNpcOnMap(int mapId, int npcId, int x, int y, int fh) {
        World world = Server.getInstance().getWorld(0);
        if (world == null) return;
        for (var ch : world.getChannels()) {
            try {
                MapleMap map = ch.getMapFactory().getMap(mapId);
                NPC npc = LifeFactory.getNPC(npcId);
                if (npc == null) continue;
                npc.setPosition(new Point(x, y));
                npc.setCy(y);
                npc.setRx0(x - 50);
                npc.setRx1(x + 50);
                npc.setFh(fh);
                map.addMapObject(npc);
                map.broadcastMessage(PacketCreator.spawnNPC(npc));
                log.info("Spawned custom NPC {} on map {} ch{} at ({},{})", npcId, mapId, ch.getId(), x, y);
            } catch (Exception e) {
                log.warn("Failed to spawn NPC {} on map {} ch{}", npcId, mapId, ch.getId(), e);
            }
        }
    }

    private void handleNpcSpawn(HttpExchange ex) throws IOException {
        if (!"POST".equals(ex.getRequestMethod())) {
            respond(ex, 405, "{\"error\":\"Method not allowed\"}");
            return;
        }
        String body = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
        Integer npcId = extractInt(body, "npcId");
        Integer mapId = extractInt(body, "mapId");
        Integer x = extractInt(body, "x");
        Integer y = extractInt(body, "y");
        Integer fh = extractInt(body, "fh");

        if (npcId == null || mapId == null || x == null || y == null) {
            respond(ex, 400, "{\"error\":\"npcId, mapId, x, y are required\"}");
            return;
        }
        spawnNpcOnMap(mapId, npcId, x, y, fh != null ? fh : 0);
        respond(ex, 200, String.format("{\"success\":true,\"npcId\":%d,\"mapId\":%d}", npcId, mapId));
    }

    private void loadRatesFromDb() {
        try (Connection con = DatabaseConnection.getConnection();
             PreparedStatement ps = con.prepareStatement("SELECT config_key, config_value FROM server_config WHERE config_key IN ('exp_rate','meso_rate','drop_rate','boss_drop_rate')");
             ResultSet rs = ps.executeQuery()) {
            World world = Server.getInstance().getWorld(0);
            if (world == null) return;
            boolean any = false;
            while (rs.next()) {
                String key = rs.getString("config_key");
                try {
                    int val = Integer.parseInt(rs.getString("config_value"));
                    switch (key) {
                        case "exp_rate" -> world.setExpRate(val);
                        case "meso_rate" -> world.setMesoRate(val);
                        case "drop_rate" -> world.setDropRate(val);
                        case "boss_drop_rate" -> world.setBossDropRate(val);
                    }
                    any = true;
                } catch (NumberFormatException ignored) {}
            }
            if (any) {
                log.info("Admin API: Loaded rates from DB — exp={} meso={} drop={} boss_drop={}",
                    world.getExpRate(), world.getMesoRate(), world.getDropRate(), world.getBossDropRate());
            }
        } catch (SQLException e) {
            log.warn("Admin API: Could not load rates from DB (table may not exist yet)", e);
        }
    }

    private void saveRatesToDb(World world) {
        String upsert = "INSERT INTO server_config (config_key, config_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)";
        try (Connection con = DatabaseConnection.getConnection()) {
            try (PreparedStatement ps = con.prepareStatement(upsert)) {
                String[][] pairs = {
                    {"exp_rate", String.valueOf(world.getExpRate())},
                    {"meso_rate", String.valueOf(world.getMesoRate())},
                    {"drop_rate", String.valueOf(world.getDropRate())},
                    {"boss_drop_rate", String.valueOf(world.getBossDropRate())}
                };
                for (String[] pair : pairs) {
                    ps.setString(1, pair[0]);
                    ps.setString(2, pair[1]);
                    ps.addBatch();
                }
                ps.executeBatch();
            }
        } catch (SQLException e) {
            log.warn("Admin API: Could not save rates to DB", e);
        }
    }

    private static String extractString(String json, String key) {
        String search = "\"" + key + "\":\"";
        int idx = json.indexOf(search);
        if (idx < 0) return null;
        int start = idx + search.length();
        int end = json.indexOf("\"", start);
        if (end < 0) return null;
        return json.substring(start, end);
    }

    private static Integer extractInt(String json, String key) {
        String search = "\"" + key + "\":";
        int idx = json.indexOf(search);
        if (idx < 0) return null;
        int start = idx + search.length();
        StringBuilder sb = new StringBuilder();
        for (int i = start; i < json.length(); i++) {
            char c = json.charAt(i);
            if (c == '-' || (c >= '0' && c <= '9')) sb.append(c);
            else if (sb.length() > 0) break;
        }
        if (sb.length() == 0) return null;
        try { return Integer.parseInt(sb.toString()); } catch (NumberFormatException e) { return null; }
    }

    private static void respond(HttpExchange ex, int code, String body) throws IOException {
        ex.getResponseHeaders().set("Content-Type", "application/json");
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        ex.sendResponseHeaders(code, bytes.length);
        try (OutputStream os = ex.getResponseBody()) {
            os.write(bytes);
        }
    }
}
