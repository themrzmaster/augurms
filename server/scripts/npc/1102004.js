/**
 * @NPC: Kimu
 * @ID: 1102004
 * @Map: 130030001 (Forest of Beginning 2)
 * @Function: Cygnus tutorial guide
 *
 * Not present in the upstream Cosmic/HeavenMS scripts — the Cygnus tutorial
 * chain was never ported there. Authored for AugurMS so the NPC actually
 * responds to clicks.
 *
 * Quest 20010 (bound to this NPC in Quest.wz/Check.img.xml) handles the
 * scripted Cygnus tutorial dialog for Noblesse characters with the quest
 * active. This NPC script is the fallback for characters without the
 * quest: it forwards new Noblesses into the tutorial, sends everyone
 * else somewhere useful instead of leaving them stuck on the map.
 */

var status = -1;

function start() {
    var noblesse = (cm.getJobId() == 1000); // MapleJob.NOBLESSE

    if (noblesse && !cm.isQuestCompleted(20010) && cm.getQuestStatus(20010) == 0) {
        // Available but not started — kick the tutorial off.
        cm.forceStartQuest(20010);
        cm.sendNext(
            "Welcome to Ereve's Forest of Beginning! My name is #bKimu#k, " +
            "and I'll be your guide. The Empress has asked me to teach every " +
            "new Noblesse the basics before meeting her.\r\n\r\n" +
            "Walk with #bthe arrow keys#k, jump with #bAlt#k, and attack with " +
            "#bCtrl#k. When you're ready, follow the path to the left."
        );
        return;
    }

    if (noblesse) {
        cm.sendSimple(
            "Good to see you again, Noblesse. Where would you like to go?\r\n\r\n" +
            "#L0#Take me to Ereve (Cygnus HQ)#l\r\n" +
            "#L1#Continue through the Forest of Beginning#l\r\n" +
            "#L2#Actually, never mind#l"
        );
    } else {
        // Non-Cygnus players — usually arrived here via @warp while exploring.
        cm.sendSimple(
            "Hello, adventurer! You've wandered onto #bEmpress's Road#k — the " +
            "training ground for new Cygnus Knights. There's nothing for a " +
            "seasoned hero like you here. Shall I send you somewhere livelier?\r\n\r\n" +
            "#L0#Take me to Henesys (Victoria Island)#l\r\n" +
            "#L1#Take me to Ereve anyway (Cygnus HQ)#l\r\n" +
            "#L2#I'll wander a bit longer#l"
        );
    }
}

function action(mode, type, selection) {
    if (mode < 1) { cm.dispose(); return; }

    var job = cm.getJob();
    var noblesse = (job.getId() == 1000);

    if (noblesse && cm.getQuestStatus(20010) == 1 && status == -1) {
        // First click after forceStartQuest — acknowledge and close.
        cm.dispose();
        return;
    }

    if (noblesse) {
        if (selection == 0) cm.warp(130000000);      // Ereve
        else if (selection == 1) cm.warp(130030002); // Forest of Beginning 3
    } else {
        if (selection == 0) cm.warp(100000000);      // Henesys
        else if (selection == 1) cm.warp(130000000); // Ereve
    }
    cm.dispose();
}
