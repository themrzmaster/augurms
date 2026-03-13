CREATE TABLE guilds
(
    guildid     INT UNSIGNED      NOT NULL AUTO_INCREMENT,
    leader      INT UNSIGNED      NOT NULL DEFAULT '0',
    GP          INT UNSIGNED      NOT NULL DEFAULT '0',
    logo        INT UNSIGNED               DEFAULT NULL,
    logoColor   SMALLINT UNSIGNED NOT NULL DEFAULT '0',
    name        VARCHAR(45)       NOT NULL,
    rank1title  VARCHAR(45)       NOT NULL DEFAULT 'Master',
    rank2title  VARCHAR(45)       NOT NULL DEFAULT 'Jr. Master',
    rank3title  VARCHAR(45)       NOT NULL DEFAULT 'Member',
    rank4title  VARCHAR(45)       NOT NULL DEFAULT 'Member',
    rank5title  VARCHAR(45)       NOT NULL DEFAULT 'Member',
    capacity    INT UNSIGNED      NOT NULL DEFAULT '10',
    logoBG      INT UNSIGNED               DEFAULT NULL,
    logoBGColor SMALLINT UNSIGNED NOT NULL DEFAULT '0',
    notice      VARCHAR(101)               DEFAULT NULL,
    signature   INT               NOT NULL DEFAULT '0',
    allianceId  INT UNSIGNED      NOT NULL DEFAULT '0',
    PRIMARY KEY (guildid),
    INDEX (guildid, name)
);

CREATE TABLE bbs_replies
(
    replyid   INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    threadid  INT UNSIGNED    NOT NULL,
    postercid INT UNSIGNED    NOT NULL,
    timestamp BIGINT UNSIGNED NOT NULL,
    content   VARCHAR(26)     NOT NULL DEFAULT '',
    PRIMARY KEY (replyid)
);

CREATE TABLE bbs_threads
(
    threadid      INT UNSIGNED      NOT NULL AUTO_INCREMENT,
    postercid     INT UNSIGNED      NOT NULL,
    name          VARCHAR(26)       NOT NULL DEFAULT '',
    timestamp     BIGINT UNSIGNED   NOT NULL,
    icon          SMALLINT UNSIGNED NOT NULL,
    replycount    SMALLINT UNSIGNED NOT NULL DEFAULT '0',
    startpost     TEXT              NOT NULL,
    guildid       INT UNSIGNED      NOT NULL,
    localthreadid INT UNSIGNED      NOT NULL,
    PRIMARY KEY (threadid)
);

CREATE TABLE alliance
(
    id       INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name     VARCHAR(13)  NOT NULL,
    capacity INT UNSIGNED NOT NULL DEFAULT '2',
    notice   VARCHAR(20)  NOT NULL DEFAULT '',
    rank1    VARCHAR(11)  NOT NULL DEFAULT 'Master',
    rank2    VARCHAR(11)  NOT NULL DEFAULT 'Jr. Master',
    rank3    VARCHAR(11)  NOT NULL DEFAULT 'Member',
    rank4    VARCHAR(11)  NOT NULL DEFAULT 'Member',
    rank5    VARCHAR(11)  NOT NULL DEFAULT 'Member',
    PRIMARY KEY (id),
    INDEX (name)
);

CREATE TABLE allianceguilds
(
    id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
    allianceid INT          NOT NULL DEFAULT '-1',
    guildid    INT          NOT NULL DEFAULT '-1',
    PRIMARY KEY (id)
)