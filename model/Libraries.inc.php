<?
/*
    ***** BEGIN LICENSE BLOCK *****
    
    This file is part of the Zotero Data Server.
    
    Copyright © 2010 Center for History and New Media
                     George Mason University, Fairfax, Virginia, USA
                     http://zotero.org
    
    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.
    
    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.
    
    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
    
    ***** END LICENSE BLOCK *****
*/

class Zotero_Libraries {
	private static $libraryTypeCache = array();
	private static $libraryJSONCache = [];
	private static $originalVersions = array();
	private static $updatedVersions = array();
	
	public static function add($type, $shardID) {
		if (!$shardID) {
			throw new Exception('$shardID not provided');
		}
		
		Zotero_DB::beginTransaction();
		
		$sql = "INSERT INTO libraries (libraryType, shardID) VALUES (?,?)";
		$libraryID = Zotero_DB::query($sql, array($type, $shardID));
		
		$sql = "INSERT INTO shardLibraries (libraryID, libraryType) VALUES (?,?)";
		Zotero_DB::query($sql, array($libraryID, $type), $shardID);
		
		Zotero_DB::commit();
		
		return $libraryID;
	}
	
	
	public static function exists($libraryID) {
		$sql = "SELECT COUNT(*) FROM libraries WHERE libraryID=?";
		return !!Zotero_DB::valueQuery($sql, $libraryID);
	}

	public static function countIndexableAttachments($libraryID) {
		$attachmentIds = Zotero_DB::columnQuery(
			"SELECT itemTypeID FROM itemTypes "
			. "WHERE itemTypeName IN ('attachment') "
		);
		$sql = "SELECT COUNT(*) as count FROM items INNER JOIN itemAttachments USING (itemID)" 
				. "WHERE NOT(linkMode='LINKED_URL') AND libraryID=? AND itemTypeID IN (" . implode(",", $attachmentIds) . ")";
		$count = Zotero_DB::query($sql, $libraryID, Zotero_Shards::getByLibraryID($libraryID));
		return $count[0]['count'];
	}

	public static function checkEsIndexStatus($libraryID) {
		$sql = "SELECT deindexed_from_es FROM libraries WHERE libraryID=?";
		$isDeleted = Zotero_DB::query($sql, $libraryID);
		return $isDeleted[0]['deindexed_from_es'] == 1;
	}

	public static function setEsIndexStatus($libraryID, $deindexed) {
		$sql = "UPDATE libraries SET deindexed_from_es=? WHERE libraryID=?";
		Zotero_DB::query($sql, [$deindexed, $libraryID]);
	}
	
	
	public static function getName($libraryID) {
		$type = self::getType($libraryID);
		switch ($type) {
			case 'user':
				$userID = Zotero_Users::getUserIDFromLibraryID($libraryID);
				return Zotero_Users::getName($userID);
			
			case 'publications':
				$userID = Zotero_Users::getUserIDFromLibraryID($libraryID);
				return Zotero_Users::getName($userID) . "’s Publications";
			
			case 'group':
				$groupID = Zotero_Groups::getGroupIDFromLibraryID($libraryID);
				$group = Zotero_Groups::get($groupID);
				return $group->name;
			
			default:
				throw new Exception("Invalid library type '$libraryType'");
		}
	}
	
	
	/**
	 * Get the type-specific id (userID or groupID) of the library
	 */
	public static function getLibraryTypeID($libraryID) {
		$type = self::getType($libraryID);
		switch ($type) {
			case 'user':
				return Zotero_Users::getUserIDFromLibraryID($libraryID);
			
			case 'publications':
				throw new Exception("Cannot get library type id of publications library");
			
			case 'group':
				return Zotero_Groups::getGroupIDFromLibraryID($libraryID);
			
			default:
				throw new Exception("Invalid library type '$libraryType'");
		}
	}
	
	
	public static function getType($libraryID) {
		if (!$libraryID) {
			throw new Exception("Library not provided");
		}
		
		if (isset(self::$libraryTypeCache[$libraryID])) {
			return self::$libraryTypeCache[$libraryID];
		}
		
		$cacheKey = 'libraryType_' . $libraryID;
		$libraryType = Z_Core::$MC->get($cacheKey);
		if ($libraryType) {
			self::$libraryTypeCache[$libraryID] = $libraryType;
			return $libraryType;
		}
		$sql = "SELECT libraryType FROM libraries WHERE libraryID=?";
		$libraryType = Zotero_DB::valueQuery($sql, $libraryID);
		if (!$libraryType) {
			throw new Exception("Library $libraryID does not exist");
		}
		
		self::$libraryTypeCache[$libraryID] = $libraryType;
		Z_Core::$MC->set($cacheKey, $libraryType);
		
		return $libraryType;
	}
	
	
	public static function getOwner($libraryID) {
		return Zotero_Users::getUserIDFromLibraryID($libraryID);
	}
	
	
	public static function getUserLibraries($userID) {
		return array_merge(
			array(Zotero_Users::getLibraryIDFromUserID($userID)),
			Zotero_Groups::getUserGroupLibraries($userID)
		);
	}
	
	
	public static function getTimestamp($libraryID) {
		$sql = "SELECT lastUpdated FROM shardLibraries WHERE libraryID=?";
		return Zotero_DB::valueQuery(
			$sql, $libraryID, Zotero_Shards::getByLibraryID($libraryID)
		);
	}
	
	
	public static function setTimestampLock($libraryIDs, $timestamp) {
		$fail = false;
		
		for ($i=0, $len=sizeOf($libraryIDs); $i<$len; $i++) {
			$libraryID = $libraryIDs[$i];
			if (!Z_Core::$MC->add("libraryTimestampLock_" . $libraryID . "_" . $timestamp, 1, 60)) {
				$fail = true;
				break;
			}
		}
		
		if ($fail) {
			if ($i > 0) {
				for ($j=$i-1; $j>=0; $j--) {
					$libraryID = $libraryIDs[$i];
					Z_Core::$MC->delete("libraryTimestampLock_" . $libraryID . "_" . $timestamp);
				}
			}
			return false;
		}
		
		return true;
	}
	
	
	/**
	 * Get library version from the database
	 */
	public static function getVersion($libraryID) {
		// Default empty library
		if ($libraryID === 0) return 0;
		
		$sql = "SELECT version FROM shardLibraries WHERE libraryID=?";
		$version = Zotero_DB::valueQuery(
			$sql, $libraryID, Zotero_Shards::getByLibraryID($libraryID)
		);
		
		// Store original version for use by getOriginalVersion()
		if (!isset(self::$originalVersions[$libraryID])) {
			self::$originalVersions[$libraryID] = $version;
		}
		return $version;
	}
	
	
	/**
	 * Get the first library version retrieved during this request, or the
	 * database version if none
	 *
	 * Since the library version is updated at the start of a request,
	 * but write operations may cache data before making changes, the
	 * original, pre-update version has to be used in cache keys.
	 * Otherwise a subsequent request for the new library version might
	 * omit data that was written with that version. (The new data can't
	 * just be written with the same version because a cache write
	 * could fail.)
	 */
	public static function getOriginalVersion($libraryID) {
		if (isset(self::$originalVersions[$libraryID])) {
			return self::$originalVersions[$libraryID];
		}
		$version = self::getVersion($libraryID);
		self::$originalVersions[$libraryID] = $version;
		return $version;
	}
	
	
	/**
	 * Get the latest library version set during this request, or the original
	 * version if none
	 */
	public static function getUpdatedVersion($libraryID) {
		if (isset(self::$updatedVersions[$libraryID])) {
			return self::$updatedVersions[$libraryID];
		}
		return self::getOriginalVersion($libraryID);
	}
	
	
	public static function updateVersionAndTimestamp($libraryID) {
		if (!is_numeric($libraryID)) {
			throw new Exception("Invalid library ID");
		}
		
		$shardID = Zotero_Shards::getByLibraryID($libraryID);
		
		$originalVersion = self::getOriginalVersion($libraryID);
		$sql = "UPDATE shardLibraries SET version=LAST_INSERT_ID(version+1), lastUpdated=NOW() "
			. "WHERE libraryID=?";
		Zotero_DB::query($sql, $libraryID, $shardID);
		$version = Zotero_DB::valueQuery("SELECT LAST_INSERT_ID()", false, $shardID);
		// Store new version for use by getUpdatedVersion()
		self::$updatedVersions[$libraryID] = $version;
		
		$sql = "SELECT UNIX_TIMESTAMP(lastUpdated) FROM shardLibraries WHERE libraryID=?";
		$timestamp = Zotero_DB::valueQuery($sql, $libraryID, $shardID);
		
		// If library has never been written to before, mark it as having data
		if (!$originalVersion || $originalVersion == 1) {
			$sql = "UPDATE libraries SET hasData=1 WHERE libraryID=?";
			Zotero_DB::query($sql, $libraryID);
		}
		
		Zotero_DB::registerTransactionTimestamp($timestamp);
	}
	
	
	public static function isLocked($libraryID) {
		// TODO
		throw new Exception("Use last modified timestamp?");
	}
	
	
	public static function userCanEdit($libraryID, $userID, $obj=null) {
		$libraryType = Zotero_Libraries::getType($libraryID);
		switch ($libraryType) {
			case 'user':
			case 'publications':
				return $userID == Zotero_Users::getUserIDFromLibraryID($libraryID);
			
			case 'group':
				$groupID = Zotero_Groups::getGroupIDFromLibraryID($libraryID);
				$group = Zotero_Groups::get($groupID);
				if (!$group->hasUser($userID) || !$group->userCanEdit($userID)) {
					return false;
				}
				
				if ($obj && $obj instanceof Zotero_Item
						&& $obj->isStoredFileAttachment()
						&& !$group->userCanEditFiles($userID)) {
					return false;
				}
				return true;
			
			default:
				throw new Exception("Unsupported library type '$libraryType'");
		}
	}
	
	
	public static function getLastStorageSync($libraryID) {
		$sql = "SELECT UNIX_TIMESTAMP(serverDateModified) AS time FROM items
				JOIN storageFileItems USING (itemID) WHERE libraryID=?
				ORDER BY time DESC LIMIT 1";
		return Zotero_DB::valueQuery(
			$sql, $libraryID, Zotero_Shards::getByLibraryID($libraryID)
		);
	}
	
	
	public static function toJSON($libraryID) {
		if (isset(self::$libraryJSONCache[$libraryID])) {
			return self::$libraryJSONCache[$libraryID];
		}
		
		$cacheVersion = 1;
		$cacheKey = "libraryJSON_" . md5($libraryID . '_' . $cacheVersion);
		$cached = Z_Core::$MC->get($cacheKey);
		if ($cached) {
			self::$libraryJSONCache[$libraryID] = $cached;
			return $cached;
		}
		
		$libraryType = Zotero_Libraries::getType($libraryID);
		if ($libraryType == 'user') {
			$objectUserID = Zotero_Users::getUserIDFromLibraryID($libraryID);
			$json = [
				'type' => $libraryType,
				'id' => $objectUserID,
				'name' => self::getName($libraryID),
				'links' => [
					'alternate' => [
						'href' => Zotero_URI::getUserURI($objectUserID, true),
						'type' => 'text/html'
					]
				]
			];
		}
		else if ($libraryType == 'publications') {
			$objectUserID = Zotero_Users::getUserIDFromLibraryID($libraryID);
			$json = [
				'type' => $libraryType,
				'id' => $objectUserID,
				'name' => self::getName($libraryID),
				'links' => [
					'alternate' => [
						'href' => Zotero_URI::getUserURI($objectUserID, true) . "/publications",
						'type' => 'text/html'
					]
				]
			];
		}
		else if ($libraryType == 'group') {
			$objectGroupID = Zotero_Groups::getGroupIDFromLibraryID($libraryID);
			$group = Zotero_Groups::get($objectGroupID);
			$json = [
				'type' => $libraryType,
				'id' => $objectGroupID,
				'name' => self::getName($libraryID),
				'links' => [
					'alternate' => [
						'href' => Zotero_URI::getGroupURI($group, true),
						'type' => 'text/html'
					]
				]
			];
		}
		else {
			throw new Exception("Invalid library type '$libraryType'");
		}
		
		self::$libraryJSONCache[$libraryID] = $json;
		Z_Core::$MC->set($cacheKey, $json, 60);
		
		return $json;
	}
	
	
	public static function clearAllData($libraryID) {
		if (empty($libraryID)) {
			throw new Exception("libraryID not provided");
		}
		
		Zotero_DB::beginTransaction();
		
		$tables = array(
			'collections', 'creators', 'items', 'relations', 'savedSearches', 'tags',
			'syncDeleteLogIDs', 'syncDeleteLogKeys', 'settings'
		);
		
		$shardID = Zotero_Shards::getByLibraryID($libraryID);
		
		self::deleteCachedData($libraryID);
		
		// Because of the foreign key constraint on the itemID, delete MySQL full-text rows
		// first, and then clear from Elasticsearch below
		Zotero_FullText::deleteByLibraryMySQL($libraryID);
		
		foreach ($tables as $table) {
			// For items, delete annotations first, then notes and attachments, then items after
			if ($table == 'items') {
				$itemTypeIDs = Zotero_DB::columnQuery(
					"SELECT itemTypeID FROM itemTypes "
					. "WHERE itemTypeName IN ('note', 'attachment', 'annotation') "
					. "ORDER BY itemTypeName = 'annotation' DESC"
				);
				$sql = "DELETE FROM $table "
					. "WHERE libraryID=? AND itemTypeID IN (" . implode(",", $itemTypeIDs) . ") "
					. "ORDER BY itemTypeID = {$itemTypeIDs[0]} DESC";
				Zotero_DB::query($sql, $libraryID, $shardID);
			}
			
			try {
				$sql = "DELETE FROM $table WHERE libraryID=?";
				Zotero_DB::query($sql, $libraryID, $shardID);
			}
			catch (Exception $e) {
				// ON DELETE CASCADE will only go 15 levels deep, so if we get an FK error, try
				// deleting subcollections first, starting with the most recent, which isn't foolproof
				// but will probably almost always do the trick.
				if ($table == 'collections'
						// Newer MySQL
						&& (strpos($e->getMessage(), "Foreign key cascade delete/update exceeds max depth")
						// Older MySQL
						|| strpos($e->getMessage(), "Cannot delete or update a parent row") !== false)) {
					$sql = "DELETE FROM collections WHERE libraryID=? "
						. "ORDER BY parentCollectionID IS NULL, collectionID DESC";
					Zotero_DB::query($sql, $libraryID, $shardID);
				}
				else {
					throw $e;
				}
			}
		}
		
		Zotero_FullText::deleteByLibrary($libraryID);
		
		self::updateVersionAndTimestamp($libraryID);
		
		Zotero_Notifier::trigger("clear", "library", $libraryID);
		
		Zotero_DB::commit();
	}
	
	
	
	/**
	 * Delete data from memcached
	 */
	public static function deleteCachedData($libraryID) {
		$shardID = Zotero_Shards::getByLibraryID($libraryID);
		
		// Clear itemID-specific memcache values
		$sql = "SELECT itemID FROM items WHERE libraryID=?";
		$itemIDs = Zotero_DB::columnQuery($sql, $libraryID, $shardID);
		if ($itemIDs) {
			$cacheKeys = array(
				"itemCreators",
				"itemIsDeleted",
				"itemRelated",
				"itemUsedFieldIDs",
				"itemUsedFieldNames"
			);
			foreach ($itemIDs as $itemID) {
				foreach ($cacheKeys as $key) {
					Z_Core::$MC->delete($key . '_' . $itemID);
				}
			}
		}
		
		/*foreach (Zotero_DataObjects::$objectTypes as $type=>$arr) {
			$className = "Zotero_" . $arr['plural'];
			call_user_func(array($className, "clearPrimaryDataCache"), $libraryID);
		}*/
	}
}
?>
