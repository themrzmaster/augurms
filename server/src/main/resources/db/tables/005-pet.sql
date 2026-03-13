CREATE TABLE pets
(
    petid     INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name      VARCHAR(13)           DEFAULT NULL,
    level     INT UNSIGNED NOT NULL,
    closeness INT UNSIGNED NOT NULL,
    fullness  INT UNSIGNED NOT NULL,
    summoned  TINYINT      NOT NULL DEFAULT '0',
    flag      INT UNSIGNED NOT NULL DEFAULT '0',
    PRIMARY KEY (petid)
);

CREATE TABLE petignores
(
    id     INT UNSIGNED NOT NULL AUTO_INCREMENT,
    petid  INT UNSIGNED NOT NULL,
    itemid INT UNSIGNED NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_petignorepetid FOREIGN KEY (petid) REFERENCES pets (petid) ON DELETE CASCADE # thanks Optimist for noticing queries over petid taking too long, shavit for pointing out an improvement using foreign key
);