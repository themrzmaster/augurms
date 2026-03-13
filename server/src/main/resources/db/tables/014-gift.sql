CREATE TABLE gifts
(
    id      INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `to`    INT          NOT NULL,
    `from`  VARCHAR(13)  NOT NULL,
    message TINYTEXT     NOT NULL,
    sn      INT UNSIGNED NOT NULL,
    ringid  INT          NOT NULL,
    PRIMARY KEY (id)
);

CREATE TABLE notes
(
    id        INT             NOT NULL AUTO_INCREMENT,
    `to`      VARCHAR(13)     NOT NULL DEFAULT '',
    `from`    VARCHAR(13)     NOT NULL DEFAULT '',
    message   TEXT            NOT NULL,
    timestamp BIGINT UNSIGNED NOT NULL,
    fame      INT             NOT NULL DEFAULT '0',
    deleted   INT             NOT NULL DEFAULT '0',
    PRIMARY KEY (id)
);

CREATE TABLE newyear
(
    id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    senderid        INT             NOT NULL DEFAULT '-1',
    sendername      VARCHAR(13)              DEFAULT '',
    receiverid      INT             NOT NULL DEFAULT '-1',
    receivername    VARCHAR(13)              DEFAULT '',
    message         VARCHAR(120)             DEFAULT '',
    senderdiscard   TINYINT         NOT NULL DEFAULT '0',
    receiverdiscard TINYINT         NOT NULL DEFAULT '0',
    received        TINYINT         NOT NULL DEFAULT '0',
    timesent        BIGINT UNSIGNED NOT NULL,
    timereceived    BIGINT UNSIGNED NOT NULL,
    PRIMARY KEY (id)
);