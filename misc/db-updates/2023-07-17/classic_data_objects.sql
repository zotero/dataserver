alter table itemCreators drop constraint itemCreators_ibfk_2;
DROP table creators;

DROP trigger if exists fki_itemCreators_libraryID;
DROP trigger if exists fku_itemCreators_libraryID;

CREATE TABLE `creators` (
  `creatorID` bigint unsigned NOT NULL AUTO_INCREMENT,
  `firstName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lastName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fieldMode` tinyint(1) unsigned DEFAULT NULL,
  PRIMARY KEY (`creatorID`),
  KEY `name` (`lastName`(7),`firstName`(6))
) ENGINE=InnoDB DEFAULT CHARSET=utf8;