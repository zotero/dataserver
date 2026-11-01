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

class Zotero_Keys {
	/**
	 * Keys created automatically for Zotero clients -- legacy "Automatic Zotero Client Key",
	 * "Automatic Zotero iOS Client Key", and "Automatic Zotero Android Client Key", and
	 * login-session keys with a platform suffix (e.g., "Automatic Zotero Client Key (macOS)")
	 *
	 * Keep in sync with Models_KeysTable::isAutomaticClientKeyName() in www
	 */
	public static function isAutomaticClientKeyName($name) {
		return (bool) preg_match('/^Automatic Zotero (?:iOS |Android )?Client Key\b/', (string) $name);
	}
	
	public static function getByKey($key) {
		// Keep in sync with Zotero_Key::erase()
		$cacheKey = "keyIDByKey_" . $key;
		$keyID = Z_Core::$MC->get($cacheKey);
		if (!$keyID) {
			$sql = "SELECT keyID FROM `keys` WHERE `key`=?";
			$keyID = Zotero_DB::valueQuery($sql, $key);
			if ($keyID) {
				Z_Core::$MC->set($cacheKey, $keyID, 300);
			}
		}
		if (!$keyID) {
			return false;
		}
		$keyObj = new Zotero_Key;
		$keyObj->id = $keyID;
		return $keyObj;
	}
	
	
	public static function getUserKeys($userID) {
		$keys = array();
		$keyIDs = Zotero_DB::columnQuery(
			"SELECT `keys`.keyID FROM `keys` "
				. "LEFT JOIN keyAccessLog USING (keyID) "
				. "WHERE userID=? "
				. "GROUP BY `keys`.keyID "
				. "ORDER BY MAX(timestamp) DESC",
			$userID
		);
		if ($keyIDs) {
			foreach ($keyIDs as $keyID) {
				$keyObj = new Zotero_Key;
				$keyObj->id = $keyID;
				$keys[] = $keyObj;
			}
		}
		return $keys;
	}
	
	
	public static function getUserKeysWithLibrary($userID, $libraryID) {
		$libraryType = Zotero_Libraries::getType($libraryID);
		
		$sql = "SELECT keyID FROM `keys` JOIN keyPermissions USING (keyID) "
			. "WHERE userID=? AND (libraryID=?";
		// If group library, include keys with access to all groups
		if ($libraryType == 'group') {
			$sql .= " OR libraryID=0";
		}
		$sql .= ") AND permission='library' AND granted=1";
		$keyIDs = Zotero_DB::columnQuery($sql, [$userID, $libraryID]);
		$keys = [];
		if ($keyIDs) {
			foreach ($keyIDs as $keyID) {
				$keyObj = new Zotero_Key;
				$keyObj->id = $keyID;
				$keys[] = $keyObj;
			}
		}
		return $keys;
	}
	
	
	public static function authenticate($key) {
		$keyObj = self::getByKey($key);
		if (!$keyObj) {
			// TODO: log auth failure
			return false;
		}
		$keyObj->logAccess();
		return $keyObj;
	}
	
	
	public static function generate() {
		$tries = 5;
		while ($tries > 0) {
			$str = Zotero_Utilities::randomString(24, 'mixed');
			$sql = "SELECT COUNT(*) FROM `keys` WHERE `key`=?";
			if (Zotero_DB::valueQuery($sql, $str)) {
				$tries--;
				continue;
			}
			return $str;
		}
		throw new Exception("Unique key could not be generated");
	}
}
?>
