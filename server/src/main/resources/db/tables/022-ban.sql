CREATE TABLE hwidaccounts
(
    accountid INT         NOT NULL DEFAULT '0',
    hwid      VARCHAR(40) NOT NULL DEFAULT '',
    relevance TINYINT     NOT NULL DEFAULT '0',
    expiresat TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (accountid, hwid)
);

CREATE TABLE hwidbans
(
    hwidbanid INT UNSIGNED NOT NULL AUTO_INCREMENT,
    hwid      VARCHAR(30)  NOT NULL,
    PRIMARY KEY (hwidbanid),
    UNIQUE KEY hwid_2 (hwid)
);

CREATE TABLE ipbans
(
    ipbanid INT UNSIGNED NOT NULL AUTO_INCREMENT,
    ip      VARCHAR(40)  NOT NULL DEFAULT '',
    aid     VARCHAR(40)           DEFAULT NULL,
    PRIMARY KEY (ipbanid)
);

CREATE TABLE macbans
(
    macbanid INT UNSIGNED NOT NULL AUTO_INCREMENT,
    mac      VARCHAR(30)  NOT NULL,
    aid      VARCHAR(40) DEFAULT NULL,
    PRIMARY KEY (macbanid),
    UNIQUE KEY mac_2 (mac)
);

CREATE TABLE macfilters
(
    macfilterid INT UNSIGNED NOT NULL AUTO_INCREMENT,
    filter      VARCHAR(30)  NOT NULL,
    PRIMARY KEY (macfilterid)
);

CREATE TABLE reports
(
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
    reporttime  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    reporterid  INT          NOT NULL,
    victimid    INT          NOT NULL,
    reason      TINYINT      NOT NULL,
    chatlog     TEXT         NOT NULL,
    description TEXT         NOT NULL,
    PRIMARY KEY (id)
);