package client.command.commands.gm0;

import client.Character;
import client.Client;
import client.command.Command;
import config.YamlConfig;
import tools.DatabaseConnection;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;

public class RecalcHpCommand extends Command {
    {
        setDescription("Recalculate your HP with the server's bonus HP per level (no more HP washing needed!).");
    }

    @Override
    public void execute(Client c, String[] params) {
        Character player = c.getPlayer();
        int bonusPerLevel = YamlConfig.config.server.BONUS_HP_PER_LEVEL;

        if (bonusPerLevel <= 0) {
            player.dropMessage(5, "Bonus HP is not enabled on this server.");
            return;
        }

        int level = player.getLevel();
        if (level <= 1) {
            player.dropMessage(5, "You must be at least level 2 to recalculate HP.");
            return;
        }

        // Total bonus HP this character should have: (level - 1) levels of bonus
        int totalBonusHp = (level - 1) * bonusPerLevel;

        try (Connection con = DatabaseConnection.getConnection()) {
            // Ensure tracking table exists
            try (PreparedStatement ps = con.prepareStatement(
                    "CREATE TABLE IF NOT EXISTS character_bonus_hp (character_id INT PRIMARY KEY, bonus_hp_granted INT NOT NULL DEFAULT 0)")) {
                ps.executeUpdate();
            }

            // Check how much bonus HP was already granted
            int alreadyGranted = 0;
            try (PreparedStatement ps = con.prepareStatement(
                    "SELECT bonus_hp_granted FROM character_bonus_hp WHERE character_id = ?")) {
                ps.setInt(1, player.getId());
                try (ResultSet rs = ps.executeQuery()) {
                    if (rs.next()) {
                        alreadyGranted = rs.getInt("bonus_hp_granted");
                    }
                }
            }

            int delta = totalBonusHp - alreadyGranted;
            if (delta <= 0) {
                player.dropMessage(6, "Your HP is already up to date! You have +" + alreadyGranted + " bonus HP from " + (level - 1) + " levels.");
                return;
            }

            // Grant the missing HP (addMaxHP sends the client update)
            player.addMaxHP(delta);

            // Record the grant
            try (PreparedStatement ps = con.prepareStatement(
                    "INSERT INTO character_bonus_hp (character_id, bonus_hp_granted) VALUES (?, ?) ON DUPLICATE KEY UPDATE bonus_hp_granted = ?")) {
                ps.setInt(1, player.getId());
                ps.setInt(2, totalBonusHp);
                ps.setInt(3, totalBonusHp);
                ps.executeUpdate();
            }

            player.dropMessage(6, "HP recalculated! Gained +" + delta + " bonus HP (total bonus: +" + totalBonusHp + " HP).");
            player.dropMessage(6, "HP washing is not needed on AugurMS — you gain +" + bonusPerLevel + " bonus HP every level.");
        } catch (Exception e) {
            player.dropMessage(5, "Failed to recalculate HP. Please try again later.");
            e.printStackTrace();
        }
    }
}
