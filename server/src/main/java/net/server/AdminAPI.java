package net.server;

import com.sun.net.httpserver.HttpServer;
import com.sun.net.httpserver.HttpExchange;
import net.server.world.World;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;

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
            server.setExecutor(null);
            server.start();
            log.info("Admin API started on port {}", PORT);
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
