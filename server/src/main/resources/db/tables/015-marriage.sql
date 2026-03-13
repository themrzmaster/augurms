CREATE TABLE marriages
(
    marriageid INT UNSIGNED NOT NULL AUTO_INCREMENT,
    husbandid  INT UNSIGNED NOT NULL DEFAULT '0',
    wifeid     INT UNSIGNED NOT NULL DEFAULT '0',
    PRIMARY KEY (marriageid)
);

CREATE TABLE rings
(
    id            INT          NOT NULL AUTO_INCREMENT,
    partnerRingId INT          NOT NULL DEFAULT '0',
    partnerChrId  INT          NOT NULL DEFAULT '0',
    itemid        INT          NOT NULL DEFAULT '0',
    partnername   VARCHAR(255) NOT NULL,
    PRIMARY KEY (id) USING BTREE
);