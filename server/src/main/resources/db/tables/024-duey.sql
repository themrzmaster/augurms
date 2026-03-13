CREATE TABLE dueypackages
(
    PackageId  INT UNSIGNED NOT NULL AUTO_INCREMENT,
    ReceiverId INT UNSIGNED NOT NULL,
    SenderName VARCHAR(13)  NOT NULL,
    Mesos      INT UNSIGNED          DEFAULT '0',
    TimeStamp  TIMESTAMP    NOT NULL DEFAULT '2015-01-01 05:00:00',
    Message    VARCHAR(200) NULL,
    Checked    TINYINT UNSIGNED      DEFAULT '1',
    Type       TINYINT UNSIGNED      DEFAULT '0',
    PRIMARY KEY (PackageId)
);

CREATE TABLE dueyitems
(
    id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
    PackageId       INT UNSIGNED NOT NULL DEFAULT '0',
    inventoryitemid INT UNSIGNED NOT NULL DEFAULT '0',
    PRIMARY KEY (id),
    KEY INVENTORYITEMID (inventoryitemid),
    KEY PackageId (PackageId),
    FOREIGN KEY (PackageId) REFERENCES dueypackages (PackageId) ON DELETE CASCADE
);