package client.command.commands.gm0;

import client.Character;
import client.Client;
import client.command.Command;
import tools.DatabaseConnection;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class FeedbackCommand extends Command {
    {
        setDescription("Send feedback to the AI Game Master. Usage: @feedback <positive/negative/suggestion> <message>");
    }

    // Rate limit: 1 per 5 minutes per character
    private static final Map<Integer, Long> cooldowns = new ConcurrentHashMap<>();
    private static final long COOLDOWN_MS = 5 * 60 * 1000;

    @Override
    public void execute(Client c, String[] params) {
        Character player = c.getPlayer();
        if (params.length < 2) {
            player.dropMessage(5, "Usage: @feedback <positive/negative/suggestion> <message>");
            player.dropMessage(5, "Shorthand: @feedback + Great event!  |  @feedback - Drop rates too low  |  @feedback s Add more quests");
            return;
        }

        // Check cooldown
        long now = System.currentTimeMillis();
        Long lastUsed = cooldowns.get(player.getId());
        if (lastUsed != null && now - lastUsed < COOLDOWN_MS) {
            long remaining = (COOLDOWN_MS - (now - lastUsed)) / 1000;
            player.dropMessage(5, "Please wait " + remaining + " seconds before sending more feedback.");
            return;
        }

        // Parse rating
        String ratingInput = params[0].toLowerCase();
        String rating;
        switch (ratingInput) {
            case "+":
            case "positive":
            case "pos":
                rating = "positive";
                break;
            case "-":
            case "negative":
            case "neg":
                rating = "negative";
                break;
            case "s":
            case "suggestion":
            case "sug":
                rating = "suggestion";
                break;
            default:
                player.dropMessage(5, "Invalid rating. Use: positive (+), negative (-), or suggestion (s)");
                return;
        }

        // Build message from remaining params
        String fullMessage = player.getLastCommandMessage();
        // Remove the rating token from the beginning
        int spaceIdx = fullMessage.indexOf(' ');
        if (spaceIdx < 0) {
            player.dropMessage(5, "Please include a message with your feedback.");
            return;
        }
        String message = fullMessage.substring(spaceIdx + 1).trim();
        if (message.isEmpty()) {
            player.dropMessage(5, "Please include a message with your feedback.");
            return;
        }
        if (message.length() > 500) {
            message = message.substring(0, 500);
        }

        try (Connection con = DatabaseConnection.getConnection();
             PreparedStatement ps = con.prepareStatement(
                 "INSERT INTO player_feedback (character_name, character_id, account_id, rating, message, character_level, character_map) VALUES (?, ?, ?, ?, ?, ?, ?)")) {
            ps.setString(1, player.getName());
            ps.setInt(2, player.getId());
            ps.setInt(3, player.getAccountID());
            ps.setString(4, rating);
            ps.setString(5, message);
            ps.setInt(6, player.getLevel());
            ps.setInt(7, player.getMapId());
            ps.executeUpdate();

            cooldowns.put(player.getId(), now);
            player.dropMessage(6, "Thank you for your feedback! The Game Master will review it.");
        } catch (Exception e) {
            player.dropMessage(5, "Failed to submit feedback. Please try again later.");
            e.printStackTrace();
        }
    }
}
