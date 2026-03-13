CREATE TABLE questactions
(
    questactionid INT UNSIGNED NOT NULL AUTO_INCREMENT,
    questid       INT          NOT NULL DEFAULT '0',
    status        INT          NOT NULL DEFAULT '0',
    data          BLOB         NOT NULL,
    PRIMARY KEY (questactionid)
);

CREATE TABLE questprogress
(
    id            INT UNSIGNED                                               NOT NULL AUTO_INCREMENT,
    characterid   INT                                                        NOT NULL,
    queststatusid INT UNSIGNED                                               NOT NULL DEFAULT '0',
    progressid    INT                                                        NOT NULL DEFAULT '0',
    progress      VARCHAR(15) CHARACTER SET latin1 COLLATE latin1_german1_ci NOT NULL DEFAULT '',
    PRIMARY KEY (id)
);

CREATE TABLE questrequirements
(
    questrequirementid INT UNSIGNED NOT NULL AUTO_INCREMENT,
    questid            INT          NOT NULL DEFAULT '0',
    status             INT          NOT NULL DEFAULT '0',
    data               BLOB         NOT NULL,
    PRIMARY KEY (questrequirementid)
);

CREATE TABLE queststatus
(
    queststatusid INT UNSIGNED NOT NULL AUTO_INCREMENT,
    characterid   INT          NOT NULL DEFAULT '0',
    quest         INT          NOT NULL DEFAULT '0',
    status        INT          NOT NULL DEFAULT '0',
    time          INT          NOT NULL DEFAULT '0',
    expires       BIGINT       NOT NULL DEFAULT '0',
    forfeited     INT          NOT NULL DEFAULT '0',
    completed     INT          NOT NULL DEFAULT '0',
    info          TINYINT      NOT NULL DEFAULT '0',
    PRIMARY KEY (queststatusid)
);

CREATE TABLE area_info
(
    id     INT          NOT NULL AUTO_INCREMENT,
    charid INT          NOT NULL,
    area   INT          NOT NULL,
    info   VARCHAR(200) NOT NULL,
    PRIMARY KEY (id)
);

CREATE TABLE eventstats
(
    characterid INT UNSIGNED NOT NULL,
    name        VARCHAR(11)  NOT NULL DEFAULT '0' COMMENT '0',
    info        INT          NOT NULL,
    PRIMARY KEY (characterid)
);

CREATE TABLE medalmaps
(
    id            INT          NOT NULL AUTO_INCREMENT,
    characterid   INT          NOT NULL,
    queststatusid INT UNSIGNED NOT NULL,
    mapid         INT          NOT NULL,
    PRIMARY KEY (id),
    KEY queststatusid (queststatusid)
);