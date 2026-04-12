/*
    This file is part of the HeavenMS MapleStory Server, commands OdinMS-based
    Copyleft (L) 2016 - 2019 RonanLana

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as
    published by the Free Software Foundation version 3 as published by
    the Free Software Foundation. You may not use, modify or distribute
    this program under any other version of the GNU Affero General Public
    License.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

/*
   @Author: Arthur L - Refactored command content into modules
*/
package client.command.commands.gm0;

import client.Character;
import client.Client;
import client.command.Command;
import constants.id.NpcId;
import server.ItemInformationProvider;
import server.life.MonsterInformationProvider;
import tools.DatabaseConnection;
import tools.Pair;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.util.ArrayList;
import java.util.List;

public class WhoDropsCommand extends Command {
    {
        setDescription("Show what drops an item.");
    }

    private static class ItemDropInfo {
        final int itemId;
        final String itemName;
        final int dropCount;

        ItemDropInfo(int itemId, String itemName, int dropCount) {
            this.itemId = itemId;
            this.itemName = itemName;
            this.dropCount = dropCount;
        }
    }

    @Override
    public void execute(Client c, String[] params) {
        Character player = c.getPlayer();
        if (params.length < 1) {
            player.dropMessage(5, "Please do @whodrops <item name>");
            return;
        }

        if (c.tryacquireClient()) {
            try {
                String searchString = player.getLastCommandMessage();
                List<Pair<Integer, String>> matches = ItemInformationProvider.getInstance().getItemDataByName(searchString);

                if (matches.isEmpty()) {
                    player.dropMessage(5, "The item you searched for doesn't exist.");
                    return;
                }

                List<ItemDropInfo> itemsWithDrops = new ArrayList<>();
                int queryLimit = Math.min(matches.size(), 25);

                try (Connection con = DatabaseConnection.getConnection()) {
                    // Phase 1: Get drop counts for each match and filter out items with no drops
                    for (int i = 0; i < queryLimit; i++) {
                        Pair<Integer, String> match = matches.get(i);
                        int dropCount = 0;

                        try (PreparedStatement ps = con.prepareStatement(
                                "SELECT COUNT(*) FROM drop_data WHERE itemid = ?")) {
                            ps.setInt(1, match.getLeft());
                            try (ResultSet rs = ps.executeQuery()) {
                                if (rs.next()) {
                                    dropCount = rs.getInt(1);
                                }
                            }
                        }

                        if (dropCount > 0) {
                            itemsWithDrops.add(new ItemDropInfo(match.getLeft(), match.getRight(), dropCount));
                        }
                    }

                    if (itemsWithDrops.isEmpty()) {
                        player.dropMessage(5, "No monsters drop items matching that name.");
                        return;
                    }

                    // Sort by drop count descending (items with most drop sources first)
                    itemsWithDrops.sort((a, b) -> b.dropCount - a.dropCount);

                    // Phase 2: Build output for top 10 items
                    StringBuilder output = new StringBuilder();
                    int displayCount = 0;

                    for (ItemDropInfo item : itemsWithDrops) {
                        if (displayCount >= 10) break;

                        output.append("#b").append(item.itemName)
                              .append(" (").append(item.itemId).append(")#k is dropped by:\r\n");

                        try (PreparedStatement ps = con.prepareStatement(
                                "SELECT dropperid FROM drop_data WHERE itemid = ? LIMIT 50")) {
                            ps.setInt(1, item.itemId);
                            try (ResultSet rs = ps.executeQuery()) {
                                boolean first = true;
                                while (rs.next()) {
                                    String resultName = MonsterInformationProvider.getInstance()
                                            .getMobNameFromId(rs.getInt("dropperid"));
                                    if (resultName != null) {
                                        if (!first) {
                                            output.append(", ");
                                        }
                                        output.append(resultName);
                                        first = false;
                                    }
                                }
                            }
                        }
                        output.append("\r\n\r\n");
                        displayCount++;
                    }

                    c.getAbstractPlayerInteraction().npcTalk(NpcId.MAPLE_ADMINISTRATOR, output.toString());
                } catch (Exception e) {
                    player.dropMessage(6, "There was a problem retrieving the required data. Please try again.");
                    e.printStackTrace();
                }
            } finally {
                c.releaseClient();
            }
        } else {
            player.dropMessage(5, "Please wait a while for your request to be processed.");
        }
    }
}
