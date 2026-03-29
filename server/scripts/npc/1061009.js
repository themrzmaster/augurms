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

/*
        @Author Ronan

        1061009 - Door of Dimension
	Enter 3rd job event
*/

function jobString(niche) {
    if (niche == 1) {
        return "warrior";
    } else if (niche == 2) {
        return "magician";
    } else if (niche == 3) {
        return "bowman";
    } else if (niche == 4) {
        return "thief";
    } else if (niche == 5) {
        return "pirate";
    }

    return "beginner";
}

function canEnterDimensionMap(mapid, jobid) {
    if (mapid == 105070001 && (jobid >= 110 && jobid <= 130)) {
        return true;
    } else if (mapid == 105040305 && (jobid >= 310 && jobid <= 320)) {
        return true;
    } else if (mapid == 100040106 && (jobid >= 210 && jobid <= 230)) {
        return true;
    } else if (mapid == 107000402 && (jobid >= 410 && jobid <= 420)) {
        return true;
    } else if (mapid == 105070200 && (jobid >= 510 && jobid <= 520)) {
        return true;
    }

    return false;
}

function getDimensionMapForJob(jobid) {
    var niche = parseInt(jobid / 100) % 10;
    if (niche == 1) return "105070001 - #m105070001#";
    if (niche == 2) return "100040106 - #m100040106#";
    if (niche == 3) return "105040305 - #m105040305#";
    if (niche == 4) return "107000402 - #m107000402#";
    if (niche == 5) return "105070200 - #m105070200#";
    return null;
}

function start() {
    if (!canEnterDimensionMap(cm.getMapId(), cm.getJob().getId())) {
        var correctMap = getDimensionMapForJob(cm.getJob().getId());
        if (correctMap != null) {
            cm.sendOk("This is not the right Door of Dimension for your class. You need to find yours at #b" + correctMap + "#k.");
        } else {
            cm.sendOk("Only 2nd job adventurers who have been sent here by their job instructor may enter.");
        }
        cm.dispose();
        return;
    }

    if (!cm.getPlayer().gotPartyQuestItem("JBP")) {
        cm.sendOk("You are not ready to enter yet. Please speak with your #bjob instructor#k first to receive permission to challenge the dimensional crack.");
        cm.dispose();
        return;
    }

    if (cm.haveItem(4031059)) {
        cm.sendOk("You already hold the #b#t4031059##k. Please bring it back to your #bjob instructor#k to continue.");
        cm.dispose();
        return;
    }

    var js = jobString(cm.getPlayer().getJob().getJobNiche());
    var em = cm.getEventManager("3rdJob_" + js);
    if (em == null) {
        cm.sendOk("Sorry, but 3rd job advancement (" + js + ") is closed.");
        cm.dispose();
        return;
    }

    if (!em.startInstance(cm.getPlayer())) {
        cm.sendOk("Someone else is already challenging the clone. Please wait until the area is cleared.");
    }

    cm.dispose();
}
