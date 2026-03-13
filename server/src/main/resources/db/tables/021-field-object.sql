CREATE TABLE playernpcs
(
    id           INT          NOT NULL AUTO_INCREMENT,
    name         VARCHAR(13)  NOT NULL,
    hair         INT          NOT NULL,
    face         INT          NOT NULL,
    skin         INT          NOT NULL,
    gender       INT          NOT NULL DEFAULT '0',
    x            INT          NOT NULL,
    cy           INT          NOT NULL DEFAULT '0',
    world        INT          NOT NULL DEFAULT '0',
    map          INT          NOT NULL DEFAULT '0',
    dir          INT          NOT NULL DEFAULT '0',
    scriptid     INT UNSIGNED NOT NULL DEFAULT '0',
    fh           INT          NOT NULL DEFAULT '0',
    rx0          INT          NOT NULL DEFAULT '0',
    rx1          INT          NOT NULL DEFAULT '0',
    worldrank    INT          NOT NULL DEFAULT '0',
    overallrank  INT          NOT NULL DEFAULT '0',
    worldjobrank INT          NOT NULL DEFAULT '0',
    job          INT          NOT NULL DEFAULT '0',
    PRIMARY KEY (id) USING BTREE
);

CREATE TABLE playernpcs_equip
(
    id       INT NOT NULL AUTO_INCREMENT,
    npcid    INT NOT NULL DEFAULT '0',
    equipid  INT NOT NULL,
    type     INT NOT NULL DEFAULT '0',
    equippos INT NOT NULL,
    PRIMARY KEY (id)
);

CREATE TABLE playernpcs_field
(
    id     INT      NOT NULL AUTO_INCREMENT,
    world  INT      NOT NULL,
    map    INT      NOT NULL,
    step   TINYINT  NOT NULL DEFAULT '0',
    podium SMALLINT NOT NULL DEFAULT '0',
    PRIMARY KEY (id)
);

CREATE TABLE plife
(
    id      INT UNSIGNED NOT NULL AUTO_INCREMENT,
    world   INT          NOT NULL DEFAULT '-1',
    map     INT          NOT NULL DEFAULT '0',
    life    INT          NOT NULL DEFAULT '0',
    type    VARCHAR(1)   NOT NULL DEFAULT 'n',
    cy      INT          NOT NULL DEFAULT '0',
    f       INT          NOT NULL DEFAULT '0',
    fh      INT          NOT NULL DEFAULT '0',
    rx0     INT          NOT NULL DEFAULT '0',
    rx1     INT          NOT NULL DEFAULT '0',
    x       INT          NOT NULL DEFAULT '0',
    y       INT          NOT NULL DEFAULT '0',
    hide    INT          NOT NULL DEFAULT '0',
    mobtime INT          NOT NULL DEFAULT '0',
    team    INT          NOT NULL DEFAULT '0',
    PRIMARY KEY (id)
);