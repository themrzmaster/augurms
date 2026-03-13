CREATE TABLE shops
(
    shopid INT UNSIGNED NOT NULL AUTO_INCREMENT,
    npcid  INT          NOT NULL DEFAULT '0',
    PRIMARY KEY (shopid)
);

CREATE TABLE shopitems
(
    shopitemid INT UNSIGNED NOT NULL AUTO_INCREMENT,
    shopid     INT UNSIGNED NOT NULL,
    itemid     INT          NOT NULL,
    price      INT          NOT NULL,
    pitch      INT          NOT NULL DEFAULT '0',
    position   INT          NOT NULL COMMENT 'sort is an arbitrary field designed to give leeway when modifying shops. The lowest number is 104 and it increments by 4 for each item to allow decent space for swapping/inserting/removing items.',
    PRIMARY KEY (shopitemid)
)