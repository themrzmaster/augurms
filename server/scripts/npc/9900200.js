/*
 * AugurMS — The Augur NPC (ID: 9900200)
 *
 * AI-powered oracle chatbot. Players type questions,
 * the script calls the dashboard API which runs an LLM
 * with read-only game tools.
 *
 * Max 10 messages per day per character (enforced server-side).
 */

var status;
var DASHBOARD_URL = "https://augurms.com"; // prod: public; local: use LAN IP:3005
var NPC_SECRET = "augur-npc-secret";

function start() {
  status = 0;
  cm.sendNext("I am the Augur... I see the threads of fate that bind this world.\r\nWhat knowledge do you seek, adventurer?");
}

function action(mode, type, selection) {
  if (mode == -1) {
    cm.dispose();
    return;
  }

  if (status == 0) {
    // After greeting, show text input
    status = 1;
    cm.sendGetText("Speak your question, and I shall consult the stars...");
  } else if (status == 1) {
    // Player submitted text
    var playerMessage = cm.getText();
    if (playerMessage == null || playerMessage.length == 0) {
      cm.dispose();
      return;
    }

    // Call dashboard API
    var response = callAugurAPI(String(playerMessage));

    if (response == null || response.text == null) {
      cm.sendOk("The crystal dims... I cannot see clearly. Try again later.");
      cm.dispose();
      return;
    }

    status = 2;
    cm.sendNext(response.text);
  } else if (status == 2) {
    // After response, offer to continue
    status = 1;
    cm.sendGetText("Is there anything else you wish to know?");
  } else {
    cm.dispose();
  }
}

function callAugurAPI(message) {
  var HttpURLConnection = Java.type("java.net.HttpURLConnection");
  var URL = Java.type("java.net.URL");
  var BufferedReader = Java.type("java.io.BufferedReader");
  var InputStreamReader = Java.type("java.io.InputStreamReader");
  var OutputStreamWriter = Java.type("java.io.OutputStreamWriter");

  var conn = null;
  try {
    var url = new URL(DASHBOARD_URL + "/api/npc/chat");
    conn = url.openConnection();
    conn.setRequestMethod("POST");
    conn.setRequestProperty("Content-Type", "application/json");
    conn.setRequestProperty("X-NPC-Secret", NPC_SECRET);
    conn.setDoOutput(true);
    conn.setConnectTimeout(10000);
    conn.setReadTimeout(60000); // LLM can take time

    var payload = JSON.stringify({
      characterId: cm.getPlayer().getId(),
      characterName: cm.getPlayer().getName(),
      characterLevel: cm.getPlayer().getLevel(),
      message: message
    });

    var writer = new OutputStreamWriter(conn.getOutputStream(), "UTF-8");
    writer.write(payload);
    writer.flush();
    writer.close();

    var responseCode = conn.getResponseCode();
    var stream = responseCode >= 200 && responseCode < 400
      ? conn.getInputStream()
      : conn.getErrorStream();

    var reader = new BufferedReader(new InputStreamReader(stream, "UTF-8"));
    var sb = new java.lang.StringBuilder();
    var line;
    while ((line = reader.readLine()) != null) {
      sb.append(line);
    }
    reader.close();

    return JSON.parse(sb.toString());
  } catch (e) {
    java.lang.System.out.println("[Augur] API error: " + e);
    return { text: "The stars are clouded... I cannot reach the beyond right now." };
  } finally {
    if (conn != null) {
      try { conn.disconnect(); } catch (e2) {}
    }
  }
}
