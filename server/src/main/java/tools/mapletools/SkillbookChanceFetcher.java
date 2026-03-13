package tools.mapletools;

import server.life.MonsterStats;

import java.io.IOException;
import java.io.PrintWriter;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * <p>
 * This application normalizes skillbook drop chances on the underlying DB (that must be
 * defined on the DatabaseConnection file of this project) and generates a
 * SQL file that proposes missing drop entries for the drop_data table.
 * <p>
 * The drop chances are calculated based on the mob level. Bosses get a higher drop chance.
 * Legend skillbooks gain a boost in drop chance (for some reason).
 *
 * @author RonanLana
 * @author Ponk
 */
public class SkillbookChanceFetcher {
    private static final Path OUTPUT_FILE = ToolConstants.getOutputFile("skillbook_drop_data.sql");

    private record DropIdentifier(int mobId, int itemId) {}

    public static void main(String[] args) {
        Instant start = Instant.now();

        System.out.println("Fetching all skillbook drops from the database...");
        List<DropIdentifier> skillbookDrops = fetchAllSkillbookDrops();
        System.out.printf("Found %d skillbook drops%n", skillbookDrops.size());

        // load mob stats from WZ
        Map<Integer, MonsterStats> mobStats = MonsterStatFetcher.getAllMonsterStats();

        System.out.println("Calculating drop chances...");
        Map<DropIdentifier, Integer> skillbookChances = calculateSkillbookDropChances(skillbookDrops, mobStats);

        System.out.println("Writing output file...");
        generateSkillbookChanceUpdateFile(skillbookChances);

        Duration totalDuration = Duration.between(start, Instant.now());
        System.out.printf("Done! Total elapsed time: %d ms", totalDuration.toMillis());
    }

    private static List<DropIdentifier> fetchAllSkillbookDrops() {
        String sql = """
                SELECT dropperid, itemid
                FROM drop_data
                WHERE itemid >= 2280000
                AND itemid < 2300000""";
        try (Connection con = SimpleDatabaseConnection.getConnection();
             PreparedStatement ps = con.prepareStatement(sql);
             ResultSet rs = ps.executeQuery()) {
            List<DropIdentifier> skillbookDrops = new ArrayList<>();
            while (rs.next()) {
                int mobId = rs.getInt("dropperid");
                int itemId = rs.getInt("itemid");
                skillbookDrops.add(new DropIdentifier(mobId, itemId));
            }
            return skillbookDrops;
        } catch (Exception e) {
            throw new RuntimeException("Failed to fetch all skillbook drops", e);
        }
    }

    private static Map<DropIdentifier, Integer> calculateSkillbookDropChances(List<DropIdentifier> skillbookDrops,
                                                                              Map<Integer, MonsterStats> mobStats) {
        Map<DropIdentifier, Integer> skillbookChances = new HashMap<>();
        for (DropIdentifier drop : skillbookDrops) {
            int expectedChance = 250;

            if (mobStats.get(drop.mobId) != null) {
                int level = mobStats.get(drop.mobId).getLevel();
                expectedChance *= Math.max(2, (level - 80) / 15);

                if (mobStats.get(drop.mobId).isBoss()) {
                    expectedChance *= 20;
                }
            } else {
                expectedChance = 1287;
            }

            if (isLegendSkillUpgradeBook(drop.itemId)) { // drop rate of Legends seems to be higher than explorers, in retrospect from values in DB
                expectedChance *= 3;
            }

            skillbookChances.put(drop, expectedChance);
        }

        return skillbookChances;
    }

    private static boolean isLegendSkillUpgradeBook(int itemid) {
        int itemidBranch = itemid / 10000;
        return (itemidBranch == 228 && itemid >= 2280013 || itemidBranch == 229 && itemid >= 2290126); // drop rate of Legends are higher
    }

    private static void generateSkillbookChanceUpdateFile(Map<DropIdentifier, Integer> skillbookChances) {
        try (PrintWriter pw = new PrintWriter(Files.newOutputStream(OUTPUT_FILE))) {
            printSkillbookChanceUpdateSqlHeader(pw);

            List<Map.Entry<DropIdentifier, Integer>> skillbookChancesList = sortedSkillbookChances(skillbookChances);
            for (Map.Entry<DropIdentifier, Integer> e : skillbookChancesList) {
                pw.println("(%d, %d, 1, 1, 0, %d),".formatted(e.getKey().mobId, e.getKey().itemId, e.getValue()));
            }

        } catch (IOException e) {
            throw new RuntimeException("Failed to write output file", e);
        }
    }

    private static void printSkillbookChanceUpdateSqlHeader(PrintWriter pw) {
        pw.println(" # SQL File autogenerated from the SkillbookChanceFetcher feature by Ronan Lana.");
        pw.println(" # Generated data takes into account mob stats such as level and boss for the chance rates.");
        pw.println();

        pw.println("  REPLACE INTO drop_data (`dropperid`, `itemid`, `minimum_quantity`, `maximum_quantity`, `questid`, `chance`) VALUES");
    }

    private static List<Map.Entry<DropIdentifier, Integer>> sortedSkillbookChances(
            Map<DropIdentifier, Integer> skillbookChances) {
        List<Map.Entry<DropIdentifier, Integer>> skillbookChancesList = new ArrayList<>(skillbookChances.entrySet());
        skillbookChancesList.sort(mobIdAscThenItemIdAscComparator());
        return skillbookChancesList;
    }

    private static Comparator<Map.Entry<DropIdentifier, Integer>> mobIdAscThenItemIdAscComparator() {
        return Comparator.comparing((Map.Entry<DropIdentifier, Integer> entry) -> entry.getKey().mobId)
                .thenComparing(entry -> entry.getKey().itemId);
    }
}
