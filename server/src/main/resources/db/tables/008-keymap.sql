CREATE TABLE keymap
(
    id          INT NOT NULL AUTO_INCREMENT,
    characterid INT NOT NULL DEFAULT '0',
    `key`       INT NOT NULL DEFAULT '0',
    type        INT NOT NULL DEFAULT '0',
    action      INT NOT NULL DEFAULT '0',
    PRIMARY KEY (id)
);

CREATE TABLE quickslotkeymapped
(
    accountid INT    NOT NULL,
    keymap    BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (accountid),
    FOREIGN KEY (accountid) REFERENCES accounts (id) ON DELETE CASCADE
);