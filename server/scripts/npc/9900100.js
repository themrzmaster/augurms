/*
 * AugurMS Universal NPC (ID: 9900100)
 *
 * A single script that powers all AI Game Master-created NPCs.
 * Reads its behavior from the gm_npcs table based on the NPC ID.
 * Supports types: exchange (currency shop), dialogue, teleporter.
 *
 * No server restart needed when config changes -- re-reads DB each interaction.
 * The GM spawns this NPC on maps via add_map_spawn, then configures it via gm_npcs.
 *
 * Multiple NPC IDs can share this script by symlinking or by using the
 * scriptName override. The script resolves config by cm.getNpc().
 */

var DatabaseConnection = Java.type("tools.DatabaseConnection");
var status;
var npcConfig;
var npcName;
var npcType;
var selectedItem;

function loadConfig() {
  var con = null;
  var ps = null;
  var rs = null;
  try {
    con = DatabaseConnection.getConnection();
    ps = con.prepareStatement("SELECT name, type, config FROM gm_npcs WHERE npc_id = ? AND enabled = 1");
    ps.setInt(1, cm.getNpc());
    rs = ps.executeQuery();
    if (rs.next()) {
      npcName = rs.getString("name");
      npcType = rs.getString("type");
      npcConfig = JSON.parse(rs.getString("config"));
      return true;
    }
    return false;
  } catch (e) {
    java.lang.System.out.println("[9900100] loadConfig error for npc " + cm.getNpc() + ": " + e);
    return false;
  } finally {
    if (rs != null) try { rs.close(); } catch (e2) {}
    if (ps != null) try { ps.close(); } catch (e2) {}
    if (con != null) try { con.close(); } catch (e2) {}
  }
}

// ---- Currency helpers ----

function getCurrencyBalance() {
  var currency = npcConfig.currency || "meso";
  if (currency === "votepoints") {
    return queryVotePoints();
  } else if (currency === "meso") {
    return cm.getMeso();
  } else {
    return cm.getItemQuantity(parseInt(currency));
  }
}

function getCurrencyName() {
  if (npcConfig.currency_name) return npcConfig.currency_name;
  if (npcConfig.currency === "votepoints") return "Vote Points";
  return "Meso";
}

function deductCurrency(amount) {
  var currency = npcConfig.currency || "meso";
  if (currency === "votepoints") {
    return deductVotePoints(amount);
  } else if (currency === "meso") {
    if (cm.getMeso() >= amount) {
      cm.gainMeso(-amount);
      return true;
    }
    return false;
  } else {
    var itemId = parseInt(currency);
    if (cm.getItemQuantity(itemId) >= amount) {
      cm.gainItem(itemId, -amount);
      return true;
    }
    return false;
  }
}

function queryVotePoints() {
  var con = null;
  var ps = null;
  var rs = null;
  try {
    con = DatabaseConnection.getConnection();
    ps = con.prepareStatement("SELECT votepoints FROM accounts WHERE id = ?");
    ps.setInt(1, cm.getClient().getAccID());
    rs = ps.executeQuery();
    return rs.next() ? rs.getInt("votepoints") : 0;
  } catch (e) {
    return 0;
  } finally {
    if (rs != null) try { rs.close(); } catch (e2) {}
    if (ps != null) try { ps.close(); } catch (e2) {}
    if (con != null) try { con.close(); } catch (e2) {}
  }
}

function deductVotePoints(amount) {
  var con = null;
  var ps = null;
  try {
    con = DatabaseConnection.getConnection();
    ps = con.prepareStatement("UPDATE accounts SET votepoints = votepoints - ? WHERE id = ? AND votepoints >= ?");
    ps.setInt(1, amount);
    ps.setInt(2, cm.getClient().getAccID());
    ps.setInt(3, amount);
    return ps.executeUpdate() > 0;
  } catch (e) {
    return false;
  } finally {
    if (ps != null) try { ps.close(); } catch (e2) {}
    if (con != null) try { con.close(); } catch (e2) {}
  }
}

// ---- Entry point ----

function start() {
  status = -1;
  java.lang.System.out.println("[9900100] start() called for npc " + cm.getNpc());
  if (!loadConfig()) {
    java.lang.System.out.println("[9900100] loadConfig() returned false for npc " + cm.getNpc());
    cm.sendOk("This NPC is not available right now. Check back later!");
    cm.dispose();
    return;
  }
  java.lang.System.out.println("[9900100] loadConfig() success: type=" + npcType + " name=" + npcName);
  action(1, 0, 0);
}

function action(mode, type, selection) {
  if (mode == -1) {
    cm.dispose();
    return;
  }
  if (mode == 0 && status > 0) {
    cm.dispose();
    return;
  }
  if (mode == 1) {
    status++;
  } else {
    status--;
  }

  if (npcType === "exchange") {
    handleExchange(mode, type, selection);
  } else if (npcType === "dialogue") {
    handleDialogue(mode, type, selection);
  } else if (npcType === "teleporter") {
    handleTeleporter(mode, type, selection);
  } else {
    cm.sendOk("This NPC doesn't know what to do!");
    cm.dispose();
  }
}

// ---- Exchange (currency shop) ----

function handleExchange(mode, type, selection) {
  var items = npcConfig.items || [];
  var currName = getCurrencyName();

  if (status == 0) {
    var balance = getCurrencyBalance();
    var greeting = npcConfig.greeting || ("Welcome! I sell items for #b" + currName + "#k.");
    var text = "#e" + npcName + "#n\r\n\r\n" + greeting + "\r\n";
    text += "You have #r" + balance + "#k " + currName + ".\r\n\r\n#b";

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var qty = item.quantity || 1;
      var qtyStr = qty > 1 ? (qty + "x ") : "";
      var itemPrice = item.price || item.cost || 0;
      text += "#L" + i + "# " + qtyStr + "#t" + item.itemId + "# - #r" + itemPrice + "#k " + currName + "#l\r\n";
    }

    cm.sendSimple(text);
  } else if (status == 1) {
    selectedItem = selection;
    if (selection < 0 || selection >= items.length) {
      cm.dispose();
      return;
    }
    var item = items[selection];
    var qty = item.quantity || 1;
    var qtyStr = qty > 1 ? (qty + "x ") : "";
    var itemPrice = item.price || item.cost || 0;
    cm.sendYesNo("Buy " + qtyStr + "#t" + item.itemId + "# for #r" + itemPrice + "#k " + currName + "?");
  } else if (status == 2) {
    var item = items[selectedItem];
    var qty = item.quantity || 1;
    var price = item.price || item.cost || 0;

    if (getCurrencyBalance() < price) {
      cm.sendOk("You don't have enough " + currName + "! You need #r" + price + "#k.");
      cm.dispose();
      return;
    }
    if (!cm.canHold(item.itemId)) {
      cm.sendOk("Please make sure you have enough inventory space!");
      cm.dispose();
      return;
    }
    if (deductCurrency(price)) {
      cm.gainItem(item.itemId, qty);
      cm.sendOk("Enjoy your #t" + item.itemId + "#!");
    } else {
      cm.sendOk("Transaction failed. Please try again.");
    }
    cm.dispose();
  } else {
    cm.dispose();
  }
}

// ---- Dialogue (multi-page text) ----

function handleDialogue(mode, type, selection) {
  var pages = npcConfig.pages || [];
  if (pages.length === 0) {
    cm.sendOk("...");
    cm.dispose();
    return;
  }
  if (status < 0 || status >= pages.length) {
    cm.dispose();
    return;
  }
  var header = "#e" + npcName + "#n\r\n\r\n";
  if (pages.length === 1) {
    cm.sendOk(header + pages[0]);
    cm.dispose();
  } else if (status === 0) {
    cm.sendNext(header + pages[0]);
  } else if (status === pages.length - 1) {
    cm.sendPrev(header + pages[status]);
  } else {
    cm.sendNextPrev(header + pages[status]);
  }
}

// ---- Teleporter (warp menu) ----

function handleTeleporter(mode, type, selection) {
  var dests = npcConfig.destinations || [];

  if (status == 0) {
    var greeting = npcConfig.greeting || "Where would you like to go?";
    var text = "#e" + npcName + "#n\r\n\r\n" + greeting + "\r\n\r\n#b";

    for (var i = 0; i < dests.length; i++) {
      var d = dests[i];
      var costStr = d.cost > 0 ? (" - #r" + d.cost + "#k meso") : " - #gFree#k";
      text += "#L" + i + "# " + d.name + costStr + "#l\r\n";
    }

    cm.sendSimple(text);
  } else if (status == 1) {
    selectedItem = selection;
    if (selection < 0 || selection >= dests.length) {
      cm.dispose();
      return;
    }
    var d = dests[selection];
    var costText = d.cost > 0 ? ("It costs #r" + d.cost + "#k meso.") : "It's free!";
    cm.sendYesNo("Travel to #b" + d.name + "#k? " + costText);
  } else if (status == 2) {
    var d = dests[selectedItem];
    if (d.cost > 0) {
      if (cm.getMeso() < d.cost) {
        cm.sendOk("You don't have enough meso!");
        cm.dispose();
        return;
      }
      cm.gainMeso(-d.cost);
    }
    cm.warp(d.mapId, 0);
    cm.dispose();
  } else {
    cm.dispose();
  }
}
