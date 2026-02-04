CREATE TABLE `loginSessions` (
	`sessionToken` char(32) CHARACTER SET utf8 COLLATE utf8_bin NOT NULL,
	`userID` int(10) unsigned DEFAULT NULL,
	`keyID` int(10) unsigned DEFAULT NULL,
	`clientType` enum('mac','windows','linux','ios','android','unknown') NOT NULL,
	`status` enum('pending','completed','expired','cancelled') NOT NULL DEFAULT 'pending',
	`dateCreated` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`dateExpires` timestamp NOT NULL,
	`dateCompleted` timestamp NULL DEFAULT NULL,
	PRIMARY KEY (`sessionToken`),
	KEY `userID` (`userID`),
	KEY `keyID` (`keyID`),
	KEY `dateExpires` (`dateExpires`),
	CONSTRAINT `loginSessions_ibfk_1` FOREIGN KEY (`userID`) REFERENCES `users` (`userID`) ON DELETE CASCADE,
	CONSTRAINT `loginSessions_ibfk_2` FOREIGN KEY (`keyID`) REFERENCES `keys` (`keyID`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
