INSERT INTO accounts (`name`, password, pin, pic, birthday, nxcredit, maplepoint, nxprepaid, characterslots, gender,
                         tos)
VALUES ('admin', '$2y$12$aFD9BDeUocDMY1X4tDYDyeJw/HhkQwCQWs3KAY7gCaRG0cpqJcaL.', '0000', '000000',
        '2005-05-11', 1000000, 1000000, 1000000, 3, 0, 1);

INSERT INTO characters (accountid, world, `name`, level, exp,
                           str, dex, luk, `int`, hp, mp, maxhp, maxmp, meso, job, skincolor, gender,
                           hair, face, ap, map, spawnpoint, gm, equipslots, useslots,
                           setupslots, etcslots)
VALUES ((SELECT id FROM accounts WHERE `name` = 'admin'), 0, 'Admin', 1, 0,
        12, 5, 4, 4, 50, 5, 50, 5, 100000000, 0, 0, 0,
        30030, 20000, 500, 10000, 2, 6, 96, 96,
        96, 96);

INSERT INTO inventoryitems (type, characterid, itemid, inventorytype,
                               position, quantity, owner, flag, giftFrom)
VALUES (1, (SELECT id FROM characters WHERE `name` = 'Admin'), 4161001, 4,
        1, 1, '', 0, ''),
       (1, (SELECT id FROM characters WHERE `name` = 'Admin'), 1040002, -1,
        -5, 1, '', 0, ''),
       (1, (SELECT id FROM characters WHERE `name` = 'Admin'), 1060002, -1,
        -6, 1, '', 0, ''),
       (1, (SELECT id FROM characters WHERE `name` = 'Admin'), 1072001, -1,
        -7, 1, '', 0, ''),
       (1, (SELECT id FROM characters WHERE `name` = 'Admin'), 1302000, -1,
        -11, 1, '', 0, '');

INSERT INTO inventoryequipment (inventoryitemid, upgradeslots, watk, wdef)
VALUES ((SELECT inventoryitemid
         FROM inventoryitems ii
                  INNER JOIN characters chr ON chr.id = ii.characterid
         WHERE itemid = 1040002
           AND position = -5
           AND chr.`name` = 'Admin'), 7, 0, 3),
       ((SELECT inventoryitemid
         FROM inventoryitems ii
                  INNER JOIN characters chr ON chr.id = ii.characterid
         WHERE itemid = 1060002
           AND position = -6
           AND chr.`name` = 'Admin'), 7, 0, 2),
       ((SELECT inventoryitemid
         FROM inventoryitems ii
                  INNER JOIN characters chr ON chr.id = ii.characterid
         WHERE itemid = 1072001
           AND position = -7
           AND chr.`name` = 'Admin'), 5, 0, 2),
       ((SELECT inventoryitemid
         FROM inventoryitems ii
                  INNER JOIN characters chr ON chr.id = ii.characterid
         WHERE itemid = 1302000
           AND position = -11
           AND chr.`name` = 'Admin'), 7, 17, 0);

INSERT INTO keymap (characterid, `key`, type, action)
VALUES ((SELECT id FROM characters WHERE `name` = 'Admin'),18,4,0),
       ((SELECT id FROM characters WHERE `name` = 'Admin'),65,6,106),
       ((SELECT id FROM characters WHERE `name` = 'Admin'),2,4,10),
       ((SELECT id FROM characters WHERE `name` = 'Admin'),23,4,1),
       ((SELECT id FROM characters WHERE `name` = 'Admin'),3,4,12),
       ((SELECT id FROM characters WHERE `name` = 'Admin'),4,4,13),
       ((SELECT id FROM characters WHERE `name` = 'Admin'),5,4,18),
       ((SELECT id FROM characters WHERE `name` = 'Admin'),6,4,24),
       ((SELECT id FROM characters WHERE `name` = 'Admin'),16,4,8),
       ((SELECT id FROM characters WHERE `name` = 'Admin'),17,4,5),
       ((SELECT id FROM characters WHERE `name` = 'Admin'),19,4,4),
       ((SELECT id FROM characters WHERE `name` = 'Admin'),25,4,19),
       ((SELECT id FROM characters WHERE `name` = 'Admin'),26,4,14),
       ((SELECT id FROM characters WHERE `name` = 'Admin'),27,4,15),
       ((SELECT id FROM characters WHERE `name` = 'Admin'),31,4,2),
       ((SELECT id FROM characters WHERE `name` = 'Admin'),34,4,17),
       ((SELECT id FROM characters WHERE `name` = 'Admin'),35,4,11),
       ((SELECT id FROM characters WHERE `name` = 'Admin'),37,4,3),
       ((SELECT id FROM characters WHERE `name` = 'Admin'),38,4,20),
       ((SELECT id FROM characters WHERE `name` = 'Admin'),40,4,16),
       ((SELECT id FROM characters WHERE `name` = 'Admin'),43,4,9),
       ((SELECT id FROM characters WHERE `name` = 'Admin'),44,5,50),
       ((SELECT id FROM characters WHERE `name` = 'Admin'),45,5,51),
       ((SELECT id FROM characters WHERE `name` = 'Admin'),46,4,6),
       ((SELECT id FROM characters WHERE `name` = 'Admin'),50,4,7),
       ((SELECT id FROM characters WHERE `name` = 'Admin'),56,5,53),
       ((SELECT id FROM characters WHERE `name` = 'Admin'),59,6,100),
       ((SELECT id FROM characters WHERE `name` = 'Admin'),60,6,101),
       ((SELECT id FROM characters WHERE `name` = 'Admin'),61,6,102),
       ((SELECT id FROM characters WHERE `name` = 'Admin'),62,6,103),
       ((SELECT id FROM characters WHERE `name` = 'Admin'),63,6,104),
       ((SELECT id FROM characters WHERE `name` = 'Admin'),64,6,105),
       ((SELECT id FROM characters WHERE `name` = 'Admin'),57,5,54),
       ((SELECT id FROM characters WHERE `name` = 'Admin'),48,4,22),
       ((SELECT id FROM characters WHERE `name` = 'Admin'),29,5,52),
       ((SELECT id FROM characters WHERE `name` = 'Admin'),7,4,21),
       ((SELECT id FROM characters WHERE `name` = 'Admin'),24,4,25),
       ((SELECT id FROM characters WHERE `name` = 'Admin'),33,4,26),
       ((SELECT id FROM characters WHERE `name` = 'Admin'),41,4,23),
       ((SELECT id FROM characters WHERE `name` = 'Admin'),39,4,27);

INSERT INTO storages (accountid, world, slots, meso)
VALUES ((SELECT id FROM accounts WHERE `name` = 'admin'),0, 24,1000000000);