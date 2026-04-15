/**
 * @NPC: Kisha
 * @ID: 1102008
 * @Map: 130030005 (A path out of the Forest of Beginning)
 * @Function: End-of-Cygnus-tutorial guide
 *
 * Not present in upstream Cosmic/HeavenMS. Authored for AugurMS so a new
 * Noblesse who finishes the Forest of Beginning chain has a way to
 * actually exit into Ereve.
 *
 * Quest 20014 is bound to this NPC for the scripted flow; this fallback
 * covers the generic "click anyway" case.
 */

function start() {
    var noblesse = (cm.getJobId() == 1000);

    if (noblesse) {
        cm.sendSimple(
            "You've made it through the Forest of Beginning! I'm #bKisha#k, " +
            "and I'll take you the rest of the way to Ereve.\r\n\r\n" +
            "#L0#Take me to Ereve (Empress's Palace)#l\r\n" +
            "#L1#Not yet, I'll stay around#l"
        );
    } else {
        cm.sendSimple(
            "Hello! This is the far end of the Forest of Beginning. Normally " +
            "only Noblesses come this way.\r\n\r\n" +
            "#L0#Take me to Ereve#l\r\n" +
            "#L1#Take me to Henesys#l\r\n" +
            "#L2#I'll find my own way#l"
        );
    }
}

function action(mode, type, selection) {
    if (mode < 1) { cm.dispose(); return; }

    var noblesse = (cm.getJobId() == 1000);

    if (noblesse) {
        if (selection == 0) cm.warp(130000000); // Ereve
    } else {
        if (selection == 0) cm.warp(130000000);      // Ereve
        else if (selection == 1) cm.warp(100000000); // Henesys
    }
    cm.dispose();
}
