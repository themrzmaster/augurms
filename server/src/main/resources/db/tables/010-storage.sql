CREATE TABLE storages
(
    storageid INT UNSIGNED NOT NULL AUTO_INCREMENT,
    accountid INT          NOT NULL DEFAULT '0',
    world     INT          NOT NULL,
    slots     INT          NOT NULL DEFAULT '0',
    meso      INT          NOT NULL DEFAULT '0',
    PRIMARY KEY (storageid)
);

CREATE TABLE fredstorage
(
    id        INT UNSIGNED NOT NULL AUTO_INCREMENT,
    cid       INT UNSIGNED NOT NULL,
    daynotes  INT UNSIGNED NOT NULL,
    timestamp TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY cid_2 (cid),
    PRIMARY KEY (id)
);