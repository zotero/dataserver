--  ***** BEGIN LICENSE BLOCK *****
--  
--  This file is part of the Zotero Data Server.
--  
--  Copyright © 2010 Center for History and New Media
--                   George Mason University, Fairfax, Virginia, USA
--                   http://zotero.org
--  
--  This program is free software: you can redistribute it and/or modify
--  it under the terms of the GNU Affero General Public License as published by
--  the Free Software Foundation, either version 3 of the License, or
--  (at your option) any later version.
--  
--  This program is distributed in the hope that it will be useful,
--  but WITHOUT ANY WARRANTY; without even the implied warranty of
--  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
--  GNU Affero General Public License for more details.
--  
--  You should have received a copy of the GNU Affero General Public License
--  along with this program.  If not, see <http://www.gnu.org/licenses/>.
--  
--  ***** END LICENSE BLOCK *****

CREATE TABLE `abstractCreators` (
  `creatorID` int(10) unsigned NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;



CREATE TABLE `abstractItems` (
  `itemID` int(10) unsigned NOT NULL AUTO_INCREMENT,
  PRIMARY KEY (`itemID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;



CREATE TABLE `baseFieldMappings` (
  `itemTypeID` smallint(5) unsigned NOT NULL,
  `baseFieldID` smallint(5) unsigned NOT NULL,
  `fieldID` smallint(5) unsigned NOT NULL,
  PRIMARY KEY (`itemTypeID`,`baseFieldID`,`fieldID`),
  KEY `baseFieldID` (`baseFieldID`),
  KEY `fieldID` (`fieldID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;



CREATE TABLE `charsets` (
  `charsetID` tinyint(3) unsigned NOT NULL,
  `charset` varchar(50) NOT NULL,
  PRIMARY KEY (`charsetID`),
  KEY `charset` (`charset`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;



CREATE TABLE `creatorTypes` (
  `creatorTypeID` smallint(5) unsigned NOT NULL,
  `creatorTypeName` varchar(50) NOT NULL,
  `custom` tinyint(1) unsigned NOT NULL,
  PRIMARY KEY (`creatorTypeID`),
  UNIQUE KEY `creatorTypeName` (`creatorTypeName`),
  KEY `custom` (`custom`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;



CREATE TABLE `fields` (
  `fieldID` smallint(5) unsigned NOT NULL,
  `fieldName` varchar(50) NOT NULL,
  `fieldFormatID` tinyint(3) unsigned DEFAULT NULL,
  `custom` tinyint(1) unsigned NOT NULL,
  PRIMARY KEY (`fieldID`),
  UNIQUE KEY `fieldName` (`fieldName`),
  KEY `custom` (`custom`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;



CREATE TABLE `groups` (
  `groupID` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `libraryID` int(10) unsigned NOT NULL,
  `name` varchar(255) NOT NULL,
  `slug` varchar(255) DEFAULT NULL,
  `type` enum('PublicOpen','PublicClosed','Private') NOT NULL DEFAULT 'Private',
  `libraryEditing` enum('admins','members') NOT NULL DEFAULT 'admins',
  `libraryReading` enum('members','all') NOT NULL DEFAULT 'all',
  `fileEditing` enum('none','admins','members') NOT NULL DEFAULT 'admins',
  `description` text NOT NULL,
  `url` varchar(255) NOT NULL,
  `hasImage` tinyint(1) unsigned NOT NULL DEFAULT '0',
  `dateAdded` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `dateModified` timestamp NOT NULL DEFAULT '0000-00-00 00:00:00',
  `version` mediumint(8) unsigned NOT NULL DEFAULT '1',
  PRIMARY KEY (`groupID`),
  UNIQUE KEY `libraryID` (`libraryID`),
  UNIQUE KEY `slug` (`slug`),
  FULLTEXT KEY `name` (`name`)
) ENGINE=InnoDB  DEFAULT CHARSET=utf8;



CREATE TABLE `groupUsers` (
  `groupID` int(10) unsigned NOT NULL,
  `userID` int(10) unsigned NOT NULL,
  `role` enum('owner','admin','member') NOT NULL DEFAULT 'member',
  `joined` timestamp NOT NULL DEFAULT '0000-00-00 00:00:00',
  `lastUpdated` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`groupID`,`userID`),
  KEY `userID` (`userID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;



CREATE TABLE `itemTypeCreatorTypes` (
  `itemTypeID` smallint(5) unsigned NOT NULL,
  `creatorTypeID` smallint(5) unsigned NOT NULL,
  `primaryField` tinyint(1) unsigned NOT NULL,
  PRIMARY KEY (`itemTypeID`,`creatorTypeID`),
  KEY `creatorTypeID` (`creatorTypeID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;



CREATE TABLE `itemTypeFields` (
  `itemTypeID` smallint(5) unsigned NOT NULL,
  `fieldID` smallint(5) unsigned NOT NULL,
  `hide` tinyint(3) unsigned NOT NULL DEFAULT '0',
  `orderIndex` tinyint(3) unsigned NOT NULL,
  PRIMARY KEY (`itemTypeID`,`fieldID`),
  KEY `fieldID` (`fieldID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;



CREATE TABLE `itemTypes` (
  `itemTypeID` smallint(5) unsigned NOT NULL,
  `itemTypeName` varchar(50) NOT NULL,
  `custom` tinyint(1) unsigned NOT NULL,
  PRIMARY KEY (`itemTypeID`),
  UNIQUE KEY `itemTypeName` (`itemTypeName`),
  KEY `custom` (`custom`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;



CREATE TABLE IF NOT EXISTS `keyAccessLog` (
  `keyID` int(10) unsigned NOT NULL,
  `ipAddress` int(10) unsigned NOT NULL DEFAULT '0',
  `timestamp` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`keyID`,`ipAddress`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;




CREATE TABLE `keyPermissions` (
  `keyID` int(10) unsigned NOT NULL,
  `libraryID` int(10) unsigned NOT NULL,
  `permission` enum('library','notes','write') NOT NULL,
  `granted` tinyint(1) unsigned NOT NULL,
  PRIMARY KEY (`keyID`,`libraryID`,`permission`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;



CREATE TABLE `keys` (
  `keyID` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `key` char(24) CHARACTER SET utf8 COLLATE utf8_bin NOT NULL,
  `userID` int(10) unsigned NOT NULL,
  `name` varchar(255) CHARACTER SET utf8 COLLATE utf8_bin NOT NULL,
  `dateAdded` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `lastUsed` timestamp NOT NULL DEFAULT '0000-00-00 00:00:00',
  PRIMARY KEY (`keyID`),
  UNIQUE KEY `key` (`key`),
  KEY `userID` (`userID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;



CREATE TABLE `libraries` (
  `libraryID` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `libraryType` enum('user','group','publications') NOT NULL,
  `lastUpdated` timestamp NOT NULL DEFAULT '0000-00-00 00:00:00',
  `version` int(10) unsigned NOT NULL DEFAULT '0',
  `shardID` smallint(5) unsigned NOT NULL,
  PRIMARY KEY (`libraryID`),
  KEY `shardID` (`shardID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;



CREATE TABLE `settings` (
  `name` varchar(100) NOT NULL,
  `value` varchar(255) NOT NULL,
  PRIMARY KEY (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE `shardHostReplicas` (
  `shardHostID` tinyint(3) unsigned NOT NULL,
  `address` varchar(75) NOT NULL,
  `port` smallint(5) unsigned NOT NULL DEFAULT '3306',
  `secure` int(1) unsigned NOT NULL DEFAULT '0',
  `state` enum('up','down') NOT NULL,
  PRIMARY KEY (`shardHostID`,`address`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;


CREATE TABLE `shardHosts` (
  `shardHostID` tinyint(3) unsigned NOT NULL,
  `address` varchar(15) NOT NULL,
  `port` smallint(5) unsigned NOT NULL DEFAULT 3306,
  `state` enum('up','readonly','down') NOT NULL,
  PRIMARY KEY (`shardHostID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;



CREATE TABLE `shards` (
  `shardID` smallint(5) unsigned NOT NULL,
  `shardHostID` tinyint(3) unsigned NOT NULL,
  `db` varchar(20) NOT NULL,
  `state` enum('up','readonly','down') NOT NULL,
  `items` mediumint(8) unsigned NOT NULL DEFAULT '0',
  PRIMARY KEY (`shardID`),
  KEY `shardHostID` (`shardHostID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;



CREATE TABLE `storageAccounts` (
  `userID` int(10) unsigned NOT NULL,
  `quota` mediumint(8) unsigned NOT NULL,
  `expiration` timestamp NULL DEFAULT '0000-00-00 00:00:00',
  PRIMARY KEY (`userID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;



CREATE TABLE `storageDownloadLog` (
  `ownerUserID` int(10) unsigned NOT NULL,
  `downloadUserID` int(10) unsigned DEFAULT NULL,
  `ipAddress` int(10) unsigned NULL,
  `storageFileID` int(10) unsigned NOT NULL,
  `filename` varchar(1024) NOT NULL,
  `size` int(10) unsigned NOT NULL,
  `time` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8;



CREATE TABLE `storageFiles` (
  `storageFileID` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `hash` char(32) NOT NULL,
  `filename` varchar(255) NOT NULL,
  `size` int(10) unsigned NOT NULL,
  `zip` tinyint(1) unsigned NOT NULL,
  `lastAdded` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`storageFileID`),
  UNIQUE KEY `hash` (`hash`,`filename`,`zip`)
) ENGINE=InnoDB  DEFAULT CHARSET=utf8;



CREATE TABLE `storageFileLibraries` (
  `storageFileID` int(10) unsigned NOT NULL,
  `libraryID` int(10) unsigned NOT NULL,
  PRIMARY KEY (`storageFileID`,`libraryID`),
  KEY `libraryID` (`libraryID`)
) ENGINE=InnoDB  DEFAULT CHARSET=utf8;



CREATE TABLE `storageFilesExisting` (
  `storageFileID` int(10) unsigned NOT NULL,
  PRIMARY KEY (`storageFileID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;



CREATE TABLE `storageLastSync` (
  `userID` int(10) unsigned NOT NULL,
  `time` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`userID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;



CREATE TABLE `storageUploadLog` (
  `ownerUserID` int(10) unsigned NOT NULL,
  `uploadUserID` int(10) unsigned NOT NULL,
  `ipAddress` int(10) unsigned NULL,
  `storageFileID` int(10) unsigned NOT NULL,
  `filename` varchar(1024) NOT NULL,
  `size` int(10) unsigned NOT NULL,
  `time` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8;



CREATE TABLE `storageUploadQueue` (
  `uploadKey` char(32) NOT NULL,
  `userID` int(10) unsigned NOT NULL,
  `hash` char(32) NOT NULL,
  `filename` varchar(1024) NOT NULL,
  `zip` tinyint(1) unsigned NOT NULL,
  `itemHash` varchar(32) NOT NULL,
  `itemFilename` varchar(1024) NOT NULL,
  `size` int(10) unsigned NOT NULL,
  `mtime` bigint(13) unsigned NOT NULL,
  `contentType` varchar(75) DEFAULT NULL,
  `charset` varchar(25) DEFAULT NULL,
  `time` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`uploadKey`),
  KEY `userID` (`userID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;



CREATE TABLE `users` (
  `userID` int(10) unsigned NOT NULL,
  `libraryID` int(10) unsigned NOT NULL,
  `username` varchar(255) NOT NULL,
  `joined` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `lastSyncTime` timestamp NOT NULL DEFAULT '0000-00-00 00:00:00',
  PRIMARY KEY (`userID`),
  UNIQUE KEY `libraryID` (`libraryID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;



CREATE TABLE `userPublications` (
  `userID` int(10) unsigned NOT NULL,
  `libraryID` int(10) unsigned NOT NULL,
  PRIMARY KEY (`userID`),
  UNIQUE KEY `libraryID` (`libraryID`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;



ALTER TABLE `baseFieldMappings`
  ADD CONSTRAINT `baseFieldMappings_ibfk_1` FOREIGN KEY (`itemTypeID`) REFERENCES `itemTypes` (`itemTypeID`),
  ADD CONSTRAINT `baseFieldMappings_ibfk_2` FOREIGN KEY (`baseFieldID`) REFERENCES `fields` (`fieldID`),
  ADD CONSTRAINT `baseFieldMappings_ibfk_3` FOREIGN KEY (`fieldID`) REFERENCES `fields` (`fieldID`);

ALTER TABLE `groups`
  ADD CONSTRAINT `groups_ibfk_1` FOREIGN KEY (`libraryID`) REFERENCES `libraries` (`libraryID`) ON DELETE CASCADE;

ALTER TABLE `groupUsers`
  ADD CONSTRAINT `groupUsers_ibfk_1` FOREIGN KEY (`groupID`) REFERENCES `groups` (`groupID`) ON DELETE CASCADE,
  ADD CONSTRAINT `groupUsers_ibfk_2` FOREIGN KEY (`userID`) REFERENCES `users` (`userID`) ON DELETE CASCADE,
  ADD CONSTRAINT `groupUsers_ibfk_3` FOREIGN KEY (`groupID`) REFERENCES `groups` (`groupID`) ON DELETE CASCADE,
  ADD CONSTRAINT `groupUsers_ibfk_4` FOREIGN KEY (`userID`) REFERENCES `users` (`userID`) ON DELETE CASCADE;

ALTER TABLE `itemTypeCreatorTypes`
  ADD CONSTRAINT `itemTypeCreatorTypes_ibfk_1` FOREIGN KEY (`itemTypeID`) REFERENCES `itemTypes` (`itemTypeID`),
  ADD CONSTRAINT `itemTypeCreatorTypes_ibfk_2` FOREIGN KEY (`creatorTypeID`) REFERENCES `creatorTypes` (`creatorTypeID`);

ALTER TABLE `itemTypeFields`
  ADD CONSTRAINT `itemTypeFields_ibfk_1` FOREIGN KEY (`itemTypeID`) REFERENCES `itemTypes` (`itemTypeID`),
  ADD CONSTRAINT `itemTypeFields_ibfk_2` FOREIGN KEY (`fieldID`) REFERENCES `fields` (`fieldID`);

ALTER TABLE `keys`
  ADD CONSTRAINT `keys_ibfk_1` FOREIGN KEY (`userID`) REFERENCES `users` (`userID`) ON DELETE CASCADE;

ALTER TABLE `keyPermissions`
  ADD CONSTRAINT `keyPermissions_ibfk_1` FOREIGN KEY (`keyID`) REFERENCES `keys` (`keyID`) ON DELETE CASCADE;

ALTER TABLE `libraries`
  ADD CONSTRAINT `libraries_ibfk_1` FOREIGN KEY (`shardID`) REFERENCES `shards` (`shardID`);

ALTER TABLE `shardHostReplicas`
  ADD CONSTRAINT `shardHostReplicas_ibfk_1` FOREIGN KEY (`shardHostID`) REFERENCES `shardHosts` (`shardHostID`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `shards`
  ADD CONSTRAINT `shards_ibfk_1` FOREIGN KEY (`shardHostID`) REFERENCES `shardHosts` (`shardHostID`);

ALTER TABLE `storageAccounts`
  ADD CONSTRAINT `storageAccounts_ibfk_1` FOREIGN KEY (`userID`) REFERENCES `users` (`userID`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `storageFileLibraries`
  ADD CONSTRAINT `storageFileLibraries_ibfk_1` FOREIGN KEY (`storageFileID`) REFERENCES `storageFiles` (`storageFileID`),
  ADD CONSTRAINT `storageFileLibraries_ibfk_2` FOREIGN KEY (`libraryID`) REFERENCES `libraries` (`libraryID`) ON DELETE CASCADE;

ALTER TABLE `storageLastSync`
  ADD CONSTRAINT `storageLastSync_ibfk_1` FOREIGN KEY (`userID`) REFERENCES `users` (`userID`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `storageUploadQueue`
  ADD CONSTRAINT `storageUploadQueue_ibfk_1` FOREIGN KEY (`userID`) REFERENCES `users` (`userID`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `userPublications`
  ADD CONSTRAINT `userPublications_ibfk_1` FOREIGN KEY (`userID`) REFERENCES `users` (`userID`) ON DELETE CASCADE,
  ADD CONSTRAINT `userPublications_ibfk_2` FOREIGN KEY (`libraryID`) REFERENCES `libraries` (`libraryID`) ON DELETE CASCADE;

ALTER TABLE `users`
  ADD CONSTRAINT `users_ibfk_1` FOREIGN KEY (`libraryID`) REFERENCES `libraries` (`libraryID`) ON DELETE CASCADE;
