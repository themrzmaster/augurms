CREATE TABLE bosslog_daily
(
    id          INT                                                       NOT NULL AUTO_INCREMENT,
    characterid INT                                                       NOT NULL,
    bosstype    ENUM ('ZAKUM','HORNTAIL','PINKBEAN','SCARGA','PAPULATUS') NOT NULL,
    attempttime TIMESTAMP                                                 NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);

CREATE TABLE bosslog_weekly
(
    id          INT                                                       NOT NULL AUTO_INCREMENT,
    characterid INT                                                       NOT NULL,
    bosstype    ENUM ('ZAKUM','HORNTAIL','PINKBEAN','SCARGA','PAPULATUS') NOT NULL,
    attempttime TIMESTAMP                                                 NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
);