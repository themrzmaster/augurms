package client.autoban;

import client.Character;
import config.YamlConfig;
import net.server.Server;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import tools.DatabaseConnection;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;

/**
 * @author kevintjuh93
 */
public class AutobanManager {
    private static final Logger log = LoggerFactory.getLogger(AutobanManager.class);

    // These violations are too noisy to flag to DB — log only
    private static final Set<AutobanFactory> SKIP_FLAG = Set.of(
        AutobanFactory.FAST_HP_HEALING,
        AutobanFactory.FAST_MP_HEALING,
        AutobanFactory.HIGH_HP_HEALING,
        AutobanFactory.GACHA_EXP
    );

    private final Character chr;
    private final Map<AutobanFactory, Integer> points = new HashMap<>();
    private final Map<AutobanFactory, Long> lastTime = new HashMap<>();
    private int misses = 0;
    private int lastmisses = 0;
    private int samemisscount = 0;
    private final long[] spam = new long[20];
    private final int[] timestamp = new int[20];
    private final byte[] timestampcounter = new byte[20];


    public AutobanManager(Character chr) {
        this.chr = chr;
    }

    public void addPoint(AutobanFactory fac, String reason) {
        if (YamlConfig.config.server.USE_AUTOBAN) {
            if (chr.isGM() || chr.isBanned()) {
                return;
            }

            if (lastTime.containsKey(fac)) {
                if (lastTime.get(fac) < (Server.getInstance().getCurrentTime() - fac.getExpire())) {
                    points.put(fac, points.get(fac) / 2); //So the points are not completely gone.
                }
            }
            if (fac.getExpire() != -1) {
                lastTime.put(fac, Server.getInstance().getCurrentTime());
            }

            if (points.containsKey(fac)) {
                points.put(fac, points.get(fac) + 1);
            } else {
                points.put(fac, 1);
            }

            if (points.get(fac) >= fac.getMaximum()) {
                if (!SKIP_FLAG.contains(fac)) {
                    flagCheat(fac.name(), reason, "threshold", points.get(fac));
                }
                points.put(fac, 0); // reset so it can flag again if they keep going
            }
        }
        if (YamlConfig.config.server.USE_AUTOBAN_LOG && !SKIP_FLAG.contains(fac)) {
            log.info("Autoban - chr {} caused {} {}", Character.makeMapleReadable(chr.getName()), fac.name(), reason);
        }
    }

    public void addMiss() {
        this.misses++;
    }

    public void resetMisses() {
        if (lastmisses == misses && misses > 6) {
            samemisscount++;
        }
        if (samemisscount > 4) {
            flagCheat("MISS_GODMODE", "Consecutive miss count: " + misses + ", repeated " + samemisscount + " times", "godmode", samemisscount);
            samemisscount = 0;
        } else if (samemisscount > 0) {
            this.lastmisses = misses;
        }
        this.misses = 0;
    }

    //Don't use the same type for more than 1 thing
    public void spam(int type) {
        this.spam[type] = Server.getInstance().getCurrentTime();
    }

    public void spam(int type, int timestamp) {
        this.spam[type] = timestamp;
    }

    public long getLastSpam(int type) {
        return spam[type];
    }

    /**
     * Timestamp checker
     *
     * <code>type</code>:<br>
     * 1: Pet Food<br>
     * 2: InventoryMerge<br>
     * 3: InventorySort<br>
     * 4: SpecialMove<br>
     * 5: UseCatchItem<br>
     * 6: Item Drop<br>
     * 7: Chat<br>
     * 8: HealOverTimeHP<br>
     * 9: HealOverTimeMP<br>
     *
     * @param type type
     * @return Timestamp checker
     */
    public void setTimestamp(int type, int time, int times) {
        if (this.timestamp[type] == time) {
            this.timestampcounter[type]++;
            if (this.timestampcounter[type] >= times) {
                if (type != 8 && type != 9) { // skip heal spam — too noisy
                    flagCheat("SPAM_TYPE_" + type, "Repeated timestamp " + time + " for type " + type, "spam", this.timestampcounter[type]);
                }
                this.timestampcounter[type] = 0; // reset counter after flagging

                log.info("Autoban - Chr {} was caught spamming TYPE {}", chr, type);
            }
        } else {
            this.timestamp[type] = time;
            this.timestampcounter[type] = 0;
        }
    }

    private void flagCheat(String violationType, String details, String severity, int points) {
        int charId = chr.getId();
        int accountId = chr.getAccountID();
        String charName = chr.getName();
        int mapId = chr.getMapId();

        try (Connection con = DatabaseConnection.getConnection();
             PreparedStatement ps = con.prepareStatement(
                 "INSERT INTO cheat_flags (character_id, account_id, character_name, violation_type, details, severity, points, map_id) " +
                 "VALUES (?, ?, ?, ?, ?, ?, ?, ?)")) {
            ps.setInt(1, charId);
            ps.setInt(2, accountId);
            ps.setString(3, charName);
            ps.setString(4, violationType);
            ps.setString(5, details);
            ps.setString(6, severity);
            ps.setInt(7, points);
            ps.setInt(8, mapId);
            ps.executeUpdate();
        } catch (SQLException e) {
            log.warn("Failed to insert cheat flag for chr {}", charName, e);
        }

        Server.getInstance().broadcastGMMessage(chr.getWorld(),
            tools.PacketCreator.sendYellowTip("[CHEAT] " + Character.makeMapleReadable(charName) + " flagged: " + violationType + " - " + details));
        log.warn("CHEAT FLAG - chr={} account={} type={} details={} map={}", charName, accountId, violationType, details, mapId);
    }
}
