alter table itemCreators drop constraint itemCreators_ibfk_2;
DROP table if exists creators;
DROP table if exists itemCreators;

DROP trigger if exists fki_itemCreators_libraryID;
DROP trigger if exists fku_itemCreators_libraryID;

CREATE TABLE `itemCreators` (
  `creatorID` bigint unsigned NOT NULL,
  `itemID` bigint unsigned NOT NULL,
  `firstName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lastName` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fieldMode` tinyint(1) unsigned DEFAULT NULL,
  `creatorTypeID` smallint(5) unsigned NOT NULL,
  `orderIndex` smallint(5) unsigned NOT NULL,
  PRIMARY KEY (`creatorID`, `itemID`),
  KEY `creatorTypeID` (`creatorTypeID`),
  KEY `name` (`lastName`(7),`firstName`(6))
) ENGINE=InnoDB DEFAULT CHARSET=utf8;