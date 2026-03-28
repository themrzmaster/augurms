package client.command.commands.gm0;

import client.Character;
import client.Client;
import client.command.Command;
import net.server.Server;
import tools.PacketCreator;

public class WorldChatCommand extends Command {
    {
        setDescription("Send a message to all players in the world.");
    }

    @Override
    public void execute(Client c, String[] params) {
        Character player = c.getPlayer();
        String message = player.getLastCommandMessage();
        if (message.isEmpty()) {
            player.yellowMessage("Syntax: @world <message>");
            return;
        }
        Server.getInstance().broadcastMessage(c.getWorld(),
                PacketCreator.serverNotice(6, "[World] " + player.getName() + ": " + message));
    }
}
