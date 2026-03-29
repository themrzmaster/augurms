/*
	This file is part of the OdinMS Maple Story Server
    Copyright (C) 2008 Patrick Huy <patrick.huy@frz.cc>
		       Matthias Butz <matze@odinms.de>
		       Jan Christian Meyer <vimes@odinms.de>

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
package net.server.channel.handlers;

import client.Client;
import net.AbstractPacketHandler;
import net.packet.InPacket;
import scripting.npc.NPCScriptManager;
import server.Trade;
import server.Trade.TradeResult;
import server.life.NPC;
import server.maps.MapObject;
import server.maps.MapObjectType;
import server.maps.Portal;
import tools.PacketCreator;

import java.util.List;

public final class ChangeMapSpecialHandler extends AbstractPacketHandler {
    @Override
    public final void handlePacket(InPacket p, Client c) {
        p.readByte();
        String startwp = p.readString();
        p.readShort();
        Portal portal = c.getPlayer().getMap().getPortal(startwp);
        if (portal != null) {
            if (c.getPlayer().portalDelay() > currentServerTime() || c.getPlayer().getBlockedPortals().contains(portal.getScriptName())) {
                c.sendPacket(PacketCreator.enableActions());
                return;
            }
            if (c.getPlayer().isChangingMaps() || c.getPlayer().isBanned()) {
                c.sendPacket(PacketCreator.enableActions());
                return;
            }
            if (c.getPlayer().getTrade() != null) {
                Trade.cancelTrade(c.getPlayer(), TradeResult.UNSUCCESSFUL_ANOTHER_MAP);
            }
            portal.enterPortal(c);
            return;
        }

        // No portal found - check if this is an NPC with a WZ script field.
        // In v83, some NPCs have info/script entries that cause the client to
        // send CHANGE_MAP_SPECIAL instead of NPC_TALK when the player presses
        // UP near them. Fall through to start the nearest NPC's script.
        for (MapObject obj : c.getPlayer().getMap().getMapObjectsInRange(c.getPlayer().getPosition(), 400000.0, List.of(MapObjectType.NPC))) {
            if (obj instanceof NPC npc) {
                if (NPCScriptManager.getInstance().start(c, npc.getId(), obj.getObjectId(), null)) {
                    return;
                }
            }
        }

        c.sendPacket(PacketCreator.enableActions());
    }
}
