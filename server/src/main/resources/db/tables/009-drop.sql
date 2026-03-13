CREATE TABLE drop_data
(
    id               BIGINT NOT NULL AUTO_INCREMENT,
    dropperid        INT    NOT NULL,
    itemid           INT    NOT NULL DEFAULT '0',
    minimum_quantity INT    NOT NULL DEFAULT '1',
    maximum_quantity INT    NOT NULL DEFAULT '1',
    questid          INT    NOT NULL DEFAULT '0',
    chance           INT    NOT NULL DEFAULT '0',
    PRIMARY KEY (id),
    KEY mobid (dropperid),
    INDEX (dropperid, itemid)
);

CREATE TABLE drop_data_global
(
    id               BIGINT  NOT NULL AUTO_INCREMENT,
    continent        TINYINT NOT NULL DEFAULT '-1',
    itemid           INT     NOT NULL DEFAULT '0',
    minimum_quantity INT     NOT NULL DEFAULT '1',
    maximum_quantity INT     NOT NULL DEFAULT '1',
    questid          INT     NOT NULL DEFAULT '0',
    chance           INT     NOT NULL DEFAULT '0',
    comments         VARCHAR(45)      DEFAULT NULL,
    PRIMARY KEY (id),
    KEY mobid (continent) USING BTREE
);

CREATE TABLE reactordrops
(
    reactordropid INT UNSIGNED NOT NULL AUTO_INCREMENT,
    reactorid     INT          NOT NULL,
    itemid        INT          NOT NULL,
    chance        INT          NOT NULL,
    questid       INT          NOT NULL DEFAULT '-1',
    PRIMARY KEY (reactordropid),
    KEY reactorid (reactorid)
);