/*
    Universal Stylist - Week-Seeded Royal Gacha & Pity System
    NPC ID: 5000000 (Big Headward)
    UI Refined for Premium Aesthetic
*/

// ==========================================
//           CONFIGURATION AREA
// ==========================================
var DB = Packages.tools.DatabaseConnection;
var shardItemID = 4311000;      // Style Shard ETC ID
var pityShardCost = 30;         // Shard cost for Pity
var sTierDropRate = 0.04;       // 4% chance to roll S-Tier

var enableDiscord = false;     
// ==========================================

// Master Arrays (Populated dynamically from WZ + SQL)
var commonMaleHairs = []; var commonFemaleHairs = []; var commonMaleFaces = []; var commonFemaleFaces = []; var premiumMaleHairs = []; var premiumFemaleHairs = []; var premiumMaleFaces = []; var premiumFemaleFaces = []; 

var status = -1;
var selectionType = -1; 
var mainStylesToUse = []; 
var weeklyRotation = [];  
var returnState = ""; 
var exchangeQty = 0; // Added for bulk exchange tracking

// === WZ DECODING LOGIC ===
function isMaleStyle(id) {
    var genderDigit = Math.floor((id / 1000) % 10);
    return [0, 3, 5, 6, 2, 9].indexOf(genderDigit) !== -1;
}

function isFemaleStyle(id) {
    var genderDigit = Math.floor((id / 1000) % 10);
    return [1, 4, 7, 8, 2, 9].indexOf(genderDigit) !== -1;
}

// === SMART ID PARSING HELPERS ===
function getColor(id, isHair) {
    if (isHair) return id % 10;
    return Math.floor((id / 100) % 10);
}

function getBase(id, isHair) {
    var color = getColor(id, isHair);
    if (isHair) return id - color;
    return id - (color * 100);
}

// === DATABASE LOGIC ===
function loadCatalog() {
    var liveHairs = cm.getLiveWzStyles("Hair").toArray();
    var liveFaces = cm.getLiveWzStyles("Face").toArray();
    var overrides = {};
    var baseOverrides = {};
    var con = null, ps = null, rs = null;
    try {
        con = DB.getConnection();
        ps = con.prepareStatement("SELECT style_id, status FROM stylist_overrides");
        rs = ps.executeQuery();
        while (rs.next()) {
            var dbId = rs.getInt("style_id");
            var dbStatus = rs.getString("status");
            overrides[dbId] = dbStatus;
            var isHairOverride = (dbId >= 30000 && dbId < 50000) || (dbId >= 60000);
            baseOverrides[getBase(dbId, isHairOverride)] = dbStatus;
        }
    } catch (e) {
        java.lang.System.out.println("[Stylist] DB Error: " + e);
    } finally {
        if (rs != null) try { rs.close(); } catch(e) {}
        if (ps != null) try { ps.close(); } catch(e) {}
        if (con != null) try { con.close(); } catch(e) {}
    }
    for (var i = 0; i < liveHairs.length; i++) {
        var id = liveHairs[i];
        var status = overrides[id] || baseOverrides[getBase(id, true)] || "COMMON";
        if (status === "DISABLED") continue;
        var isPremium = (status === "PREMIUM");
        if (isMaleStyle(id)) { if (isPremium) premiumMaleHairs.push(id); else commonMaleHairs.push(id); }
        if (isFemaleStyle(id)) { if (isPremium) premiumFemaleHairs.push(id); else commonFemaleHairs.push(id); }
    }
    for (var i = 0; i < liveFaces.length; i++) {
        var id = liveFaces[i];
        var status = overrides[id] || baseOverrides[getBase(id, false)] || "COMMON";
        if (status === "DISABLED") continue;
        var isPremium = (status === "PREMIUM");
        if (isMaleStyle(id)) { if (isPremium) premiumMaleFaces.push(id); else commonMaleFaces.push(id); }
        if (isFemaleStyle(id)) { if (isPremium) premiumFemaleFaces.push(id); else commonFemaleFaces.push(id); }
    }
}

function updateStyleInDB(styleId, status, isPromoting) {
    var con = null, ps = null;
    try {
        con = DB.getConnection();
        if (isPromoting) {
            ps = con.prepareStatement("REPLACE INTO stylist_overrides (style_id, status) VALUES (?, ?)");
            ps.setInt(1, styleId);
            ps.setString(2, status); // "PREMIUM" or "DISABLED"
        } else {
            ps = con.prepareStatement("DELETE FROM stylist_overrides WHERE style_id = ?");
            ps.setInt(1, styleId);
        }
        ps.executeUpdate();
        return true;
    } catch (e) {
        java.lang.System.out.println("[Stylist] DB Update Error: " + e);
        return false;
    } finally {
        if (ps != null) try { ps.close(); } catch(e) {}
        if (con != null) try { con.close(); } catch(e) {}
    }
}

// === THE WEEK-SEEDED RANDOMIZER ===
function getWeeklySeed() {
    var now = new Date();
    var start = new Date(now.getFullYear(), 0, 0);
    var diff = now - start;
    var oneDay = 1000 * 60 * 60 * 24;
    var dayOfYear = Math.floor(diff / oneDay);
    var weekOfYear = Math.ceil(dayOfYear / 7);
    return now.getFullYear() + "_" + weekOfYear;
}

function LCG(seed) {
    var hash = 0;
    for (var i = 0; i < seed.length; i++) {
        hash = ((hash << 5) - hash) + seed.charCodeAt(i);
        hash = hash & hash; 
    }
    this._seed = Math.abs(hash) % 2147483647;
    if (this._seed <= 0) this._seed += 2147483646;
}
LCG.prototype.next = function () {
    return this._seed = this._seed * 16807 % 2147483647;
};
LCG.prototype.nextFloat = function () {
    return (this.next() - 1) / 2147483646;
};

function generateWeeklyRotation(cm, isHair) {
    var player = cm.getPlayer();
    var isMale = player.getGender() == 0;
    var rotation = [];
    
    var commonPool = isHair ? (isMale ? commonMaleHairs : commonFemaleHairs) : (isMale ? commonMaleFaces : commonFemaleFaces);
    var premiumPool = isHair ? (isMale ? premiumMaleHairs : premiumFemaleHairs) : (isMale ? premiumMaleFaces : premiumFemaleFaces);

    if (commonPool.length < 5 || premiumPool.length < 1) return []; 

    var lcg = new LCG(getWeeklySeed() + "_" + (isHair ? "hair" : "face"));

    var commonBaseStyles = [];
    var commonStyleMap = {};
    for (var i = 0; i < commonPool.length; i++) {
        var base = getBase(commonPool[i], isHair);
        if (!commonStyleMap[base]) {
            commonStyleMap[base] = [];
            commonBaseStyles.push(base);
        }
        commonStyleMap[base].push(commonPool[i]);
    }

    var shuffledBases = commonBaseStyles.slice();
    for (var i = shuffledBases.length - 1; i > 0; i--) {
        var j = Math.floor(lcg.nextFloat() * (i + 1));
        var temp = shuffledBases[i];
        shuffledBases[i] = shuffledBases[j];
        shuffledBases[j] = temp;
    }
    
    var pickedCommonBases = shuffledBases.slice(0, 5);
    var currentColor = getColor(isHair ? player.getHair() : player.getFace(), isHair);
    
    for (var i = 0; i < pickedCommonBases.length; i++) {
        var options = commonStyleMap[pickedCommonBases[i]];
        var matched = false;
        var blackFallbackIndex = 0;
        for (var j = 0; j < options.length; j++) {
            var colorCode = getColor(options[j], isHair);
            if (colorCode == currentColor) {
                rotation.push({ id: options[j], isSTier: false });
                matched = true;
                break;
            }
            if (colorCode == 0) blackFallbackIndex = j;
        }
        if (!matched) rotation.push({ id: options[blackFallbackIndex], isSTier: false });
    }

    var premiumBaseStyles = [];
    var premiumStyleMap = {};
    for (var i = 0; i < premiumPool.length; i++) {
        var base = getBase(premiumPool[i], isHair);
        if (!premiumStyleMap[base]) {
            premiumStyleMap[base] = [];
            premiumBaseStyles.push(base);
        }
        premiumStyleMap[base].push(premiumPool[i]);
    }

    var shuffledPremBases = premiumBaseStyles.slice();
    for (var i = shuffledPremBases.length - 1; i > 0; i--) {
        var j = Math.floor(lcg.nextFloat() * (i + 1));
        var temp = shuffledPremBases[i];
        shuffledPremBases[i] = shuffledPremBases[j];
        shuffledPremBases[j] = temp;
    }
    
    var pickedPremBase = shuffledPremBases[0];
    var premOptions = premiumStyleMap[pickedPremBase];
    var premMatched = false;
    var premBlackFallbackIndex = 0;
    
    for (var j = 0; j < premOptions.length; j++) {
        var colorCode = getColor(premOptions[j], isHair);
        if (colorCode == currentColor) {
            rotation.unshift({ id: premOptions[j], isSTier: true });
            premMatched = true;
            break;
        }
        if (colorCode == 0) premBlackFallbackIndex = j;
    }
    if (!premMatched) rotation.unshift({ id: premOptions[premBlackFallbackIndex], isSTier: true });

    return rotation; 
}

// === MAIN NPC SYSTEM START ===
function start() {
    status = -1;
    commonMaleHairs = []; commonFemaleHairs = []; commonMaleFaces = []; commonFemaleFaces = []; premiumMaleHairs = []; premiumFemaleHairs = []; premiumMaleFaces = []; premiumFemaleFaces = []; 
    loadCatalog();
    action(1, 0, 0);
}

// === MAIN ACTION LOOP ===
function action(mode, type, selection) {
    if (mode == -1) { 
        cm.dispose(); 
        return; 
    }
    if (mode == 0) { 
        if (status == 2 && returnState == "GACHA_PREVIEW") { 
            status = 0; 
            action(1, 0, selectionType); 
            return; 
        } else if (status == 4 && returnState == "CURATOR_PREVIEW") { 
            status = 0; 
            action(1, 0, 99); 
            return; 
        } else if (status == 3 && selectionType == 4) { // User said "No" to exchange confirmation
            status = -1; 
            action(1, 0, 0);
            return;
        } else { 
            cm.dispose(); 
            return; 
        } 
    }
    
    status++;
    var player = cm.getPlayer();
    var isMale = player.getGender() == 0;

    // ──────────────────────────
    // Status 0: MAIN MENU
    // ──────────────────────────
    if (status == 0) {
        var text = "Welcome to the most exclusive boutique in Maple World!\r\n"
            + "\r\nI am Big Headward, and every week, I bring you the #e#dsix most fashionable looks#k#n from every corner of Maple World!\r\n\r\n";
        text += "#e#r#nCurrent styles leave the rotation this Sunday!#k\r\n\r\n";
        
        text += "#bYour Tribute (Vote Points): #d" + cm.getClient().getVotePoints() + "#k\r\n\r\n"; 
        
        text += "What can I do for you?\r\n"
        text += "#L4##bExchange Vote Points for Royal Style Shards#l\r\n";
        text += "#L0##bGive me a Royal Hair!#l\r\n";
        text += "#L1##bGive me a Royal Face!#l\r\n";
        text += "#L3##bChange my Hair or Face color!#l\r\n";
        text += "#L2##dTrade my Royal Style Shards for an S-Tier look!#l\r\n";
        
        if (player.gmLevel() >= 3) {
            text += "\r\n#L99##e#r[ADMIN ONLY] Open Live SQL Curator Mode#k#n#l\r\n";
        }
        cm.sendSimple(text);
    }

    // ──────────────────────────
    // Status 1: CATEGORY/ROLL SELECTION
    // ──────────────────────────
    else if (status == 1) {
        selectionType = selection;

        // --- SUB: SQL Curator (Red/Warning) ---
        if (selectionType == 99) {
            var text = "#e#r[ SQL DATABASE CURATOR MODE ]#k#n\r\n\r\n";
            text += "All modifications made here save #e#rINSTANTLY#k#n to the live server database.\r\n\r\n";
            
            text += "#d#ePromote Common Styles to S-Tier:#n#k\r\n";
            text += "#L100# [Hair] Promote Male#l\r\n";
            text += "#L101# [Hair] Promote Female#l\r\n";
            text += "#L102# [Face] Promote Male#l\r\n";
            text += "#L103# [Face] Promote Female#l\r\n\r\n";
            
            text += "#r#eDemote S-Tier Styles to Common:#n#k\r\n";
            text += "#L104# [Hair] Demote Male#l\r\n";
            text += "#L105# [Hair] Demote Female#l\r\n";
            text += "#L106# [Face] Demote Male#l\r\n";
            text += "#L107# [Face] Demote Female#l\r\n";
            cm.sendSimple(text);
        }
        
        // --- SUB: VP to Shard Exchange ---
        else if (selectionType == 4) {
            var currentVP = cm.getClient().getVotePoints();
            if (currentVP < 1) {
                cm.sendOk("You expect my shards for free?! My genius requires tribute! Return when you have at least #b1 Vote Point#k!");
                cm.dispose();
                return;
            }
            cm.sendGetNumber("How many of your hard-earned Vote Points do you wish to sacrifice? I shall forge one shard for every point offered.\r\n\r\n#bCurrent Vote Points: " + currentVP + "#k", 1, 1, currentVP);
        }

        // --- SUB: Gacha Options (Blue/Main) ---
        else if (selectionType == 0 || selectionType == 1) {
            var isHair = (selectionType == 0);
            weeklyRotation = generateWeeklyRotation(cm, isHair);
            if (weeklyRotation.length == 0) { 
                cm.sendOk("Oops, vaulting error!"); 
                cm.dispose(); 
                return; 
            }

            var text = "My curated selection of #bRoyal " + (isHair ? "Hairs" : "Faces") + "#k hides #e#done transcendent S-Tier masterpiece#k#n!\r\n" +
                "Your odds of grasping absolute perfection: #e#d" + (sTierDropRate * 100) + "% #k#n\r\n\r\n";
            
            text += "My exclusive services require #e#b1 Royal Style Shard#k#n as tribute. Are you ready to be transformed?\r\n\r\n";
            text += "#bYour Royal Style Shards: #d" + cm.itemQuantity(shardItemID) + "#k\r\n"; 
            
            text += "#L10##d[Preview My Current Masterpieces]#k#l\r\n";
            text += "#L11##e#dSculpt my " + (isHair ? "Hair" : "Face") +"!#k#n#l\r\n";
            cm.sendSimple(text);
        }

        // --- SUB: Pity (Dark Purple/Special) ---
        else if (selectionType == 2) {
            if (cm.haveItem(shardItemID, pityShardCost)) {
            var text = "The others... they don't appreciate my craftsmanship. They offer me paltry scraps and expect a miracle? " +
                "Bah! It takes true essence to craft perfection. Bring me #e#d"+ pityShardCost +" Royal Style Shards#k#n, and I'll manifest a " +
                "#e#bRoyal Style#k#n of the highest order just for you. Forget the luck of the draw; this is a guaranteed masterpiece. " +
                "So what are you waiting for? Hand them over, quickly now!\r\n\r\n"
                
                text += "#bYour Royal Style Shards: #d" + cm.itemQuantity(shardItemID) + "#k\r\n\r\n"; 
                
                text += "#L20##bStyle me with this week's S-Tier Royal Hair!#k#l\r\n";
                text += "#L21##bStyle me with this week's S-Tier Royal Face!#k#l\r\n";
                cm.sendSimple(text);
            } else {
                var text = "You dare mock my craft with empty pockets? I need the essence of #e#d"+ pityShardCost +" Royal Style Shards#k#n to weave such perfection! " +
                    "Begone until you have the materials, or you'll ruin the inspiration!\r\n\r\n";
                text += "#eCost:#n\r\n#i" + shardItemID + "# #d" + pityShardCost + "x Royal Style Shards#k\r\n\r\n";
                text += "#bExchange Vote Points for Royal Style Shards to proceed!#k";
                cm.sendOk(text); 
                cm.dispose(); 
                return;
            }
        }

        // --- SUB: Color Studio ---
        else if (selectionType == 3) {
            if (cm.haveItem(shardItemID, 1)) {
                var text = "The shape is... acceptable. But that #e#dpigment?#k#n A complete disaster! It physically hurts me to look at it. Let me strip that tragedy away and fix the #e#dhue#k#n immediately.\r\n\r\n";
                text += "My exclusive pigments require #e#b1 Royal Style Shard#k#n as tribute. What are we correcting today?\r\n\r\n";
                
                text += "#L30##bChange my Hair color!#k#l\r\n";
                text += "#L31##bChange my Face color!#l";
                cm.sendSimple(text);
            } else {
                var text = "You want me to mix my exquisite, hand-crafted pigments for... free?! Absolutely not! True art requires patronage!\r\n\r\n";
                text += "You need at least #i" + shardItemID + "# #b1 Royal Style Shard#k to afford my time. Get out of my lighting until you have the tribute!";
                cm.sendOk(text); 
                cm.dispose(); 
                return;
            }
        }
    } 

    // ──────────────────────────
    // Status 2: EXECUTION/PAGE SELECTION
    // ──────────────────────────
    else if (status == 2) {
        var choice = selection;

        // --- EXEC: SQL Curator Page Setup ---
        if (selectionType == 99) {
            var browseCategory = choice; 
            selectionType = browseCategory; 
            var pool = [];
            if (browseCategory == 100) pool = commonMaleHairs; else if (browseCategory == 101) pool = commonFemaleHairs; else if (browseCategory == 102) pool = commonMaleFaces; else if (browseCategory == 103) pool = commonFemaleFaces; else if (browseCategory == 104) pool = premiumMaleHairs; else if (browseCategory == 105) pool = premiumFemaleHairs; else if (browseCategory == 106) pool = premiumMaleFaces; else if (browseCategory == 107) pool = premiumFemaleFaces;

            var isHair = (browseCategory == 100 || browseCategory == 101 || browseCategory == 104 || browseCategory == 105);
            var currentColor = getColor(isHair ? player.getHair() : player.getFace(), isHair);

            var styleMap = {}; var baseStyles = [];
            for (var i = 0; i < pool.length; i++) {
                var base = getBase(pool[i], isHair);
                if (!styleMap[base]) { styleMap[base] = []; baseStyles.push(base); }
                styleMap[base].push(pool[i]);
            }

            var uniqueStyles = [];
            for (var i = 0; i < baseStyles.length; i++) {
                var options = styleMap[baseStyles[i]];
                var matched = false; var fallbackIndex = 0;
                for (var j = 0; j < options.length; j++) { if (getColor(options[j], isHair) == currentColor) { uniqueStyles.push(options[j]); matched = true; break; } if (getColor(options[j], isHair) == 0) fallbackIndex = j; }
                if (!matched) uniqueStyles.push(options[fallbackIndex]);
            }
            mainStylesToUse = uniqueStyles;

            if (mainStylesToUse.length == 0) { 
                cm.sendOk("#rNo styles left to curate in this category!#k"); 
                cm.dispose(); 
                return; 
            }

            var text = "#e#r[ SQL PAGE SELECT ]#k#n\r\n\r\n";
            text += mainStylesToUse.length + " base styles detected. Please select a page:\r\n\r\n";
            var totalPages = Math.ceil(mainStylesToUse.length / 120);
            for (var i = 0; i < totalPages; i++) { text += "#b#L" + i + "#Preview Page " + (i + 1) + "#l\r\n"; }
            cm.sendSimple(text);
        }

        // --- EXEC: Bulk Exchange Confirmation ---
        else if (selectionType == 4) {
            exchangeQty = choice; 
            if (!cm.canHold(shardItemID, exchangeQty)) {
                 cm.sendOk("Your pockets are as cluttered as your hair! Clear out enough space in your #bETC inventory#k to hold #b" + exchangeQty + "#k shards before you dare ask for my help.");
                 cm.dispose();
                 return;
            }
            cm.sendYesNo("A sacrifice of #b" + exchangeQty + " Vote Points#k for #b" + exchangeQty + " Royal Style Shards#k... are you absolutely certain? There are no refunds in the pursuit of beauty!");
        }

        // --- EXEC: Gacha Roll vs Preview ---
        else if (selectionType == 0 || selectionType == 1) {
            var isHair = (selectionType == 0);
            
            if (choice == 10) {
                var previewArr = []; for (var i = 0; i < weeklyRotation.length; i++) { previewArr.push(weeklyRotation[i].id); }
                var msg = "Use the arrows to browse your potential looks!\r\n";
                msg += "The #e#d[S-TIER Style]#n#k is the very #eFIRST#n style shown.\r\n\r\n";
                msg += "#r(Clicking OK safely closes preview without rolling)#k";
                returnState = "GACHA_PREVIEW";
                cm.sendStyle(msg, previewArr);
            } 
            else if (choice == 11) {
                if (!cm.haveItem(shardItemID, 1)) { 
                    cm.sendOk("No tribute?! You dare approach my salon without a #i" + shardItemID + "# #bRoyal Style Shard#k?! Get out! Come back when you can afford my vision!"); 
                    cm.dispose(); 
                    return; 
                }

                var roll = Math.random(); 
                var chosenGachaId = -1; 
                var wonSTier = false;
                
                if (roll <= sTierDropRate) { 
                    for (var i = 0; i < weeklyRotation.length; i++) { 
                        if (weeklyRotation[i].isSTier) { chosenGachaId = weeklyRotation[i].id; wonSTier = true; break; } 
                    } 
                } else { 
                    var shiftedRoll = roll - sTierDropRate; 
                    var sliceIndex = Math.floor(shiftedRoll / ((1.0 - sTierDropRate) / 5)); 
                    var currentCommonIndex = 0; 
                    for (var i = 0; i < weeklyRotation.length; i++) { 
                        if (!weeklyRotation[i].isSTier) { if (currentCommonIndex == sliceIndex) { chosenGachaId = weeklyRotation[i].id; break; } currentCommonIndex++; } 
                    } 
                }
                
                cm.gainItem(shardItemID, -1); 
                if (isHair) cm.setHair(chosenGachaId); else cm.setFace(chosenGachaId);

                var text = wonSTier ? 
                    "#e#dMagnificent! Even I have out-done myself today! You have been blessed with my ultimate S-Tier Style,\r\n#b\"#t"+chosenGachaId+"#\"#d!#k#n\r\n\r\n" :
                    "Yes... YES! The #e#d\"#t"+chosenGachaId+"#\"#k#n! Wear my masterpiece with the reverence it deserves!\r\n\r\n";
                
                cm.sendOk(text); 
                cm.dispose();
            }
        }

        // --- EXEC: Pity Trade-In ---
        else if (selectionType == 2) {
            var pityIsHair = (choice == 20); 
            var rotation = generateWeeklyRotation(cm, pityIsHair); 
            var pityId = -1; 
            for (var i = 0; i < rotation.length; i++) { if (rotation[i].isSTier) { pityId = rotation[i].id; break; } }
            
            if (pityId != -1) {
                cm.gainItem(shardItemID, -pityShardCost);
                if (pityIsHair) cm.setHair(pityId); else cm.setFace(pityId);
                cm.sendOk("There! Witness true beauty! My hands... they've outdone themselves. Your new form is a masterpiece of pure #e#bperfection#n#k!"); 
                cm.dispose();
            } else { cm.sendOk("Error loading pity."); cm.dispose(); }
        }

        // --- EXEC: Color Scan ---
        else if (selectionType == 3) {
            var colorIsHair = (choice == 30); 
            var currentId = colorIsHair ? player.getHair() : player.getFace(); 
            var currentBase = getBase(currentId, colorIsHair);
            var scanPool = colorIsHair ? (isMale ? commonMaleHairs.concat(premiumMaleHairs) : commonFemaleHairs.concat(premiumFemaleHairs)) : (isMale ? commonMaleFaces.concat(premiumMaleFaces) : commonFemaleFaces.concat(premiumFemaleFaces));
            
            var options = []; 
            for (var i = 0; i < scanPool.length; i++) { 
                if (getBase(scanPool[i], colorIsHair) == currentBase && scanPool[i] != currentId) { 
                    options.push(scanPool[i]); 
                } 
            }
            
            if (options.length <= 1) { cm.sendOk("#bI'm sorry, but this style doesn't have other colors implemented yet!#k"); cm.dispose(); return; }

            mainStylesToUse = options; selectionType = choice; returnState = "COLOR_CHANGE";
            cm.sendStyle("Use the arrows to preview the unique shades!\r\n\r\n#e#b(OK to claim for 1 Shard)#k#n", mainStylesToUse);
        }
    } 

    // ──────────────────────────
    // Status 3: EXECUTION (COLOR / EXCHANGE) & PAGE (CURATOR)
    // ──────────────────────────
    else if (status == 3) {
        if (returnState == "GACHA_PREVIEW") { status = 0; action(1, 0, selectionType); return; } 
        
        // --- EXEC: VP Exchange Finalizer ---
        else if (selectionType == 4) {
             cm.getClient().useVotePoints(exchangeQty);
             cm.gainItem(shardItemID, exchangeQty);
             cm.sendOk("The transaction is complete. Use these #b" + exchangeQty + " shards#k wisely... or don't. It's your look on the line, not mine!");
             cm.dispose();
        }

        // --- PAGE: Curator Preview ---
        else if (selectionType >= 100 && selectionType <= 107) {
            var pageIndex = selection; 
            mainStylesToUse = mainStylesToUse.slice(pageIndex * 120, (pageIndex + 1) * 120); 
            returnState = "CURATOR_PREVIEW";
            var styleAction = (selectionType >= 104) ? "Demote style to Common pool" : "Promote style to Premium pool";
            cm.sendStyle("Select style and use arrows.\r\n\r\n#r#e[Warning] OK will instantly " + styleAction + " in live SQL database!#k#n", mainStylesToUse);
        }

        // --- EXEC: Color Change Finisher ---
        else if (returnState == "COLOR_CHANGE") {
           if (!cm.haveItem(shardItemID, 1)) { 
               cm.sendOk("You want me to mix my exquisite pigments for free?! Return when you have at least #i" + shardItemID + "# #e#d1 Royal Style Shard#k#n!"); 
                cm.dispose(); 
                return; 
            }
            
            var chosenColorId = mainStylesToUse[selection]; 
            cm.gainItem(shardItemID, -1);
            if (selectionType == 30) cm.setHair(chosenColorId); else cm.setFace(chosenColorId);
            cm.sendOk("Finally, a tolerable #e#dhue#k#n. Be gone, before I find another flaw to fixate on!"); 
            cm.dispose();
        }
    }

    // ──────────────────────────
    // Status 4: EXECUTION (CURATOR)
    // ──────────────────────────
    else if (status == 4) {
        if (returnState == "CURATOR_PREVIEW") {
            var chosenId = mainStylesToUse[selection]; var isPromoting = (selectionType < 104);
            var success = updateStyleInDB(chosenId, "PREMIUM", isPromoting);
            if (!success) { cm.sendOk("#rFailed to write to SQL database. Check server logs!#k"); cm.dispose(); return; }

            var targetPremiumArray = []; var targetCommonArray = [];
            if (selectionType == 100 || selectionType == 104) { targetPremiumArray = premiumMaleHairs; targetCommonArray = commonMaleHairs; } 
            else if (selectionType == 101 || selectionType == 105) { targetPremiumArray = premiumFemaleHairs; targetCommonArray = commonFemaleHairs; } 
            else if (selectionType == 102 || selectionType == 106) { targetPremiumArray = premiumMaleFaces; targetCommonArray = commonMaleFaces; } 
            else if (selectionType == 103 || selectionType == 107) { targetPremiumArray = premiumFemaleFaces; targetCommonArray = commonFemaleFaces; }

            if (isPromoting) { 
                if (targetPremiumArray.indexOf(chosenId) == -1) targetPremiumArray.push(chosenId); 
                var removalIndex = targetCommonArray.indexOf(chosenId); if (removalIndex !== -1) targetCommonArray.splice(removalIndex, 1); 
            } else { 
                var removalIndex = targetPremiumArray.indexOf(chosenId); if (removalIndex !== -1) targetPremiumArray.splice(removalIndex, 1); 
                if (targetCommonArray.indexOf(chosenId) == -1) targetCommonArray.push(chosenId); 
            }

            mainStylesToUse = mainStylesToUse.slice(selection + 1).concat(mainStylesToUse.slice(0, selection));
            if (mainStylesToUse.length == 0) { cm.sendOk("That is the end of my collection!"); cm.dispose(); return; }
            cm.sendStyle("Updated successfully!\r\n\r\n#r(Change is live instantly for players)#k", mainStylesToUse);
            status = 3; 
        }
    }
}