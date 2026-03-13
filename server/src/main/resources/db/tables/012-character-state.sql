CREATE TABLE playerdiseases
(
    id         INT NOT NULL AUTO_INCREMENT,
    charid     INT NOT NULL,
    disease    INT NOT NULL,
    mobskillid INT NOT NULL,
    mobskilllv INT NOT NULL,
    length     INT NOT NULL DEFAULT '1',
    PRIMARY KEY (id)
);

CREATE TABLE buddies
(
    id          INT     NOT NULL AUTO_INCREMENT,
    characterid INT     NOT NULL,
    buddyid     INT     NOT NULL,
    pending     TINYINT NOT NULL DEFAULT '0',
    `group`     VARCHAR(17)      DEFAULT '0',
    PRIMARY KEY (id)
);

CREATE TABLE savedlocations
(
    id           INT                                                                                                                                      NOT NULL AUTO_INCREMENT,
    characterid  INT                                                                                                                                      NOT NULL,
    locationtype ENUM ('FREE_MARKET','WORLDTOUR','FLORINA','INTRO','SUNDAY_MARKET','MIRROR','EVENT','BOSSPQ','HAPPYVILLE','DEVELOPER','MONSTER_CARNIVAL') NOT NULL,
    map          INT                                                                                                                                      NOT NULL,
    portal       INT                                                                                                                                      NOT NULL,
    PRIMARY KEY (id)
);

CREATE TABLE famelog
(
    famelogid      INT       NOT NULL AUTO_INCREMENT,
    characterid    INT       NOT NULL DEFAULT '0',
    characterid_to INT       NOT NULL DEFAULT '0',
    `when`         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (famelogid),
    KEY characterid (characterid),
    FOREIGN KEY (characterid) REFERENCES characters (id) ON DELETE CASCADE
);

CREATE TABLE trocklocations
(
    trockid     INT NOT NULL AUTO_INCREMENT,
    characterid INT NOT NULL,
    mapid       INT NOT NULL,
    vip         INT NOT NULL,
    PRIMARY KEY (trockid)
);

CREATE TABLE characterexplogs
(
    id             BIGINT NOT NULL AUTO_INCREMENT,
    world_exp_rate INT,
    exp_coupon     INT,
    gained_exp     BIGINT,
    current_exp    INT,
    exp_gain_time  DATETIME,
    charid         INT    NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (charid) REFERENCES characters (id) ON DELETE CASCADE
)