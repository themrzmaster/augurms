CREATE TABLE namechanges
(
    id             INT         NOT NULL AUTO_INCREMENT,
    characterid    INT         NOT NULL,
    old            VARCHAR(13) NOT NULL,
    new            VARCHAR(13) NOT NULL,
    requestTime    TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completionTime TIMESTAMP   NULL,
    PRIMARY KEY (id),
    INDEX (characterid)
);

CREATE TABLE worldtransfers
(
    id             INT       NOT NULL AUTO_INCREMENT,
    characterid    INT       NOT NULL,
    `from`         TINYINT   NOT NULL,
    `to`           TINYINT   NOT NULL,
    requestTime    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completionTime TIMESTAMP NULL,
    PRIMARY KEY (id),
    INDEX (characterid)
);