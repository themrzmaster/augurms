CREATE TABLE skills
(
    id          INT    NOT NULL AUTO_INCREMENT,
    skillid     INT    NOT NULL DEFAULT '0',
    characterid INT    NOT NULL DEFAULT '0',
    skilllevel  INT    NOT NULL DEFAULT '0',
    masterlevel INT    NOT NULL DEFAULT '0',
    expiration  BIGINT NOT NULL DEFAULT '-1',
    PRIMARY KEY (id),
    UNIQUE INDEX skillpair (skillid, characterid),
    FOREIGN KEY (characterid) REFERENCES characters (id) ON DELETE CASCADE
);

CREATE TABLE cooldowns
(
    id        INT             NOT NULL AUTO_INCREMENT,
    charid    INT             NOT NULL,
    SkillID   INT             NOT NULL,
    length    BIGINT UNSIGNED NOT NULL,
    StartTime BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (id)
);

CREATE TABLE skillmacros
(
    id          INT     NOT NULL AUTO_INCREMENT,
    characterid INT     NOT NULL DEFAULT '0',
    position    TINYINT NOT NULL DEFAULT '0',
    skill1      INT     NOT NULL DEFAULT '0',
    skill2      INT     NOT NULL DEFAULT '0',
    skill3      INT     NOT NULL DEFAULT '0',
    name        VARCHAR(13)      DEFAULT NULL,
    shout       TINYINT NOT NULL DEFAULT '0',
    PRIMARY KEY (id)
);