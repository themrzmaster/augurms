CREATE TABLE IF NOT EXISTS `killlog` (
    `id` INT NOT NULL AUTO_INCREMENT,
    `characterid` INT NOT NULL,
    `charactername` VARCHAR(13) NOT NULL,
    `mobid` INT NOT NULL,
    `mobname` VARCHAR(50) NOT NULL DEFAULT '',
    `mapid` INT NOT NULL DEFAULT 0,
    `killedtime` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id`),
    KEY `idx_killlog_time` (`killedtime`),
    KEY `idx_killlog_mob` (`mobid`, `killedtime`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
