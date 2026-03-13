CREATE TABLE makercreatedata
(
    id              TINYINT UNSIGNED NOT NULL,
    itemid          INT              NOT NULL,
    req_level       TINYINT UNSIGNED NOT NULL,
    req_maker_level TINYINT UNSIGNED NOT NULL,
    req_meso        INT              NOT NULL,
    req_item        INT              NOT NULL,
    req_equip       INT              NOT NULL,
    catalyst        INT              NOT NULL,
    quantity        SMALLINT         NOT NULL,
    tuc             TINYINT          NOT NULL,
    PRIMARY KEY (id, itemid)
);

CREATE TABLE makerrecipedata
(
    itemid   INT      NOT NULL,
    req_item INT      NOT NULL,
    count    SMALLINT NOT NULL,
    PRIMARY KEY (itemid, req_item)
);

CREATE TABLE makerrewarddata
(
    itemid   INT              NOT NULL,
    rewardid INT              NOT NULL,
    quantity SMALLINT         NOT NULL,
    prob     TINYINT UNSIGNED NOT NULL DEFAULT '100',
    PRIMARY KEY (itemid, rewardid)
);

CREATE TABLE makerreagentdata
(
    itemid INT         NOT NULL,
    stat   VARCHAR(20) NOT NULL,
    value  SMALLINT    NOT NULL,
    PRIMARY KEY (itemid)
);