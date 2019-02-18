<?php
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

class Zotero_Key {
	private $id;
	private $key;
	private $userID;
	private $name;
	private $dateAdded;
	private $lastUsed;
	private $permissions = array();
	
	private $loaded = false;
	private $changed = array();
	private $erased = false;
	
	
	public function __get($field) {
		if ($this->erased) {
			throw new Exception("Cannot access field '$field' of deleted key $this->id");
		}
		
		if (($this->id || $this->key) && !$this->loaded) {
			$this->load();
		}
		
		switch ($field) {
			case 'id':
			case 'key':
			case 'userID':
			case 'name':
			case 'dateAdded':
				break;
			
			default:
				throw new Exception("Invalid key field '$field'");
		}
		
		return $this->$field;
	}
	
	
	public function __set($field, $value) {
		switch ($field) {
			// Set id and libraryID without loading
			case 'id':
			case 'key':
				if ($this->loaded) {
					throw new Exception("Cannot set $field after key is already loaded");
				}
				$this->$field = $value;
				return;
			
			case 'userID':
			case 'name':
				break;
			
			default:
				throw new Exception("Invalid key field '$field'");
		}
		
		if ($this->id || $this->key) {
			if (!$this->loaded) {
				$this->load();
			}
		}
		else {
			$this->loaded = true;
		}
		
		if ($this->$field == $value) {
			Z_Core::debug("Key $this->id $field value ($value) has not changed", 4);
			return;
		}
		$this->$field = $value;
		$this->changed[$field] = true;
	}
	
	
	public function getPermissions() {
		if ($this->erased) {
			throw new Exception("Cannot access permissions of deleted key $this->id");
		}
		
		if (($this->id || $this->key) && !$this->loaded) {
			$this->load();
		}
		
		$permissions = new Zotero_Permissions($this->userID);
		foreach ($this->permissions as $libraryID=>$p) {
			foreach ($p as $key=>$val) {
				$permissions->setPermission($libraryID, $key, $val);
			}
		}
		return $permissions;
	}
	
	
	/*public function getPermission($libraryID, $permission) {
		if ($this->erased) {
			throw new Exception("Cannot access permission of deleted key $this->id");
		}
		
		if (($this->id || $this->key) && !$this->loaded) {
			$this->load();
		}
		
		return $this->permissions[$libraryID][$permission];
	}*/
	
	
	/**
	 * Examples:
	 *
	 * $keyObj->setPermission(12345, 'library', true);
	 * $keyObj->setPermission(12345, 'notes', true);
	 * $keyObj->setPermission(12345, 'files', true);
	 * $keyObj->setPermission(12345, 'write', true);
	 * $keyObj->setPermission(0, 'group', true);
	 * $keyObj->setPermission(0, 'write', true);
	 */
	public function setPermission($libraryID, $permission, $enabled) {
		if ($this->id || $this->key) {
			if (!$this->loaded) {
				$this->load();
			}
		}
		else {
			$this->loaded = true;
		}
		
		$enabled = !!$enabled;
		
		// libraryID=0 is a special case for all-group access
		if ($libraryID === 0) {
			// Convert 'group' to 'library'
			if ($permission == 'group') {
				$permission = 'library';
			}
			else if ($permission == 'write') {}
			else {
				throw new Exception("libraryID 0 is valid only with permission 'group'");
			}
		}
		else if ($permission == 'group') {
			throw new Exception("'group' permission is valid only with libraryID 0");
		}
		else if (!$libraryID) {
			throw new Exception("libraryID not set");
		}
		
		switch ($permission) {
			case 'library':
			case 'notes':
			case 'files':
			case 'write':
				break;
			
			default:
				throw new Exception("Invalid key permissions field '$permission'");
		}
		
		$this->permissions[$libraryID][$permission] = $enabled;
		$this->changed['permissions'][$libraryID][$permission] = true;
	}
	
	
	
	public function save() {
		if (!$this->loaded) {
			Z_Core::debug("Not saving unloaded key $this->id");
			return;
		}
		
		if (!$this->userID) {
			throw new Exception("Cannot save key without userID");
		}
		
		if (!$this->name) {
			throw new Exception("Cannot save key without name");
		}
		
		if (strlen($this->name) > 255) {
			throw new Exception("Key name too long", Z_ERROR_KEY_NAME_TOO_LONG);
		}
		
		Zotero_DB::beginTransaction();
		
		if (!$this->key) {
			$isNew = true;
			$this->key = Zotero_Keys::generate();
		}
		else {
			$isNew = false;
		}
		
		$fields = array(
			'key',
			'userID',
			'name'
		);
		
		$sql = "INSERT INTO `keys` (keyID, `key`, userID, name) VALUES (?, ?, ?, ?)";
		$params = array($this->id);
		foreach ($fields as $field) {
			$params[] = $this->$field;
		}
		$sql .= " ON DUPLICATE KEY UPDATE ";
		$q = array();
		foreach ($fields as $field) {
			$q[] = "`$field`=?";
			$params[] = $this->$field;
		}
		$sql .= implode(", ", $q);
		$insertID = Zotero_DB::query($sql, $params);
		
		if (!$this->id) {
			if (!$insertID) {
				throw new Exception("Key id not available after INSERT");
			}
			$this->id = $insertID;
		}
		
		if (!$insertID) {
			$sql = "SELECT * FROM keyPermissions WHERE keyID=?";
			$oldRows = Zotero_DB::query($sql, $this->id);
		}
		$oldPermissions = [];
		$newPermissions = [];
		$librariesToAdd = [];
		$librariesToRemove = [];
		
		// Massage rows into permissions format
		if (!$isNew && isset($oldRows)) {
			foreach ($oldRows as $row) {
				$oldPermissions[$row['libraryID']][$row['permission']] = !!$row['granted'];
			}
		}
		
		// Delete existing permissions
		$sql = "DELETE FROM keyPermissions WHERE keyID=?";
		Zotero_DB::query($sql, $this->id);
		
		if (isset($this->changed['permissions'])) {
			foreach ($this->changed['permissions'] as $libraryID=>$p) {
				foreach ($p as $permission=>$changed) {
					$enabled = $this->permissions[$libraryID][$permission];
					if (!$enabled) {
						continue;
					}
					
					$sql = "INSERT INTO keyPermissions VALUES (?, ?, ?, ?)";
					// TODO: support negative permissions
					Zotero_DB::query($sql, array($this->id, $libraryID, $permission, 1));
					
					$newPermissions[$libraryID][$permission] = true;
				}
			}
		}
		
		$this->permissions = $newPermissions;
		
		// Send notifications for added and removed API key – library pairs
		if (!$isNew) {
			$librariesToAdd = $this->permissionsDiff(
				$oldPermissions, $newPermissions, $this->userID
			);
			$librariesToRemove = $this->permissionsDiff(
				$newPermissions, $oldPermissions, $this->userID
			);
			if ($librariesToAdd) {
				Zotero_Notifier::trigger(
					'add',
					'apikey-library',
					array_map(function ($libraryID) {
						return $this->id . "-" . $libraryID;
					}, array_unique($librariesToAdd))
				);
			}
			if ($librariesToRemove) {
				Zotero_Notifier::trigger(
					'remove',
					'apikey-library',
					array_map(function ($libraryID) {
						return $this->id . "-" . $libraryID;
					}, array_unique($librariesToRemove))
				);
			}
		}
		
		Zotero_DB::commit();
		
		$this->load();
		
		return $this->id;
	}
	
	
	/**
	 * Calculate the difference between two sets of permissions,
	 * taking all-group access into account
	 */
	private function permissionsDiff($permissions1, $permissions2, $userID) {
		$diff = [];
		$userGroupLibraries = Zotero_Groups::getUserGroupLibraries($userID);
		foreach ($permissions2 as $libraryID => $libraryPermissions) {
			if (!$libraryPermissions['library']) {
				continue;
			}
			if (empty($permissions1[$libraryID]['library'])) {
				// If second set has a 0 (all-group access), diff is user's groups not
				// explicitly listed in first set
				if ($libraryID === 0) {
					$diff = array_merge(
						$diff,
						array_filter(
							$userGroupLibraries,
							function ($libraryID) use ($permissions1) {
								return empty($permissions1[$libraryID]['library']);
							}
						)
					);
				}
				else {
					$libraryType = Zotero_Libraries::getType($libraryID);
					if ($libraryType == 'user'
							|| ($libraryType == 'group' && empty($permissions1[0]['library']))) {
						$diff[] = $libraryID;
					}
				}
			}
		}
		return $diff;
	}
	
	
	public function erase() {
		if (($this->id || $this->key) && !$this->loaded) {
			$this->load();
		}
		
		Zotero_DB::beginTransaction();
		
		$sql = "DELETE FROM `keys` WHERE keyID=?";
		$deleted = Zotero_DB::query($sql, $this->id);
		if (!$deleted) {
			throw new Exception("Key not deleted");
		}
		
		Zotero_DB::commit();
		
		$this->erased = true;
	}
	
	
	/**
	 * Converts key to a SimpleXMLElement item
	 *
	 * @return	SimpleXMLElement				Key data as SimpleXML element
	 */
	public function toXML() {
		if (($this->id || $this->key) && !$this->loaded) {
			$this->load();
		}
		
		$xml = '<key/>';
		$xml = new SimpleXMLElement($xml);
		
		$xml['key'] = $this->key;
		$xml['dateAdded'] = $this->dateAdded;
		if ($this->lastUsed != '0000-00-00 00:00:00') {
			$xml['lastUsed'] =  $this->lastUsed;
		}
		$xml->name = $this->name;
		
		if ($this->permissions) {
			foreach ($this->permissions as $libraryID=>$p) {
				$access = $xml->addChild('access');
				
				// group="all" is stored as libraryID 0
				if ($libraryID === 0) {
					$access['group'] = 'all';
					if (!empty($p['write'])) {
						$access['write'] = 1;
					}
					continue;
				}
				
				$type = Zotero_Libraries::getType($libraryID);
				switch ($type) {
					case 'user':
						foreach ($p as $permission=>$granted) {
							$access[$permission] = (int) $granted;
						}
						break;
						
					case 'group':
						$access['group'] = Zotero_Groups::getGroupIDFromLibraryID($libraryID);
						if (!empty($p['write'])) {
							$access['write'] = 1;
						}
						break;
				}
			}
		}
		
		$ips = $this->getRecentIPs();
		if ($ips) {
			$xml->recentIPs = implode(' ', $ips);
		}
		
		return $xml;
	}
	
	
	public function toJSON() {
		if (($this->id || $this->key) && !$this->loaded) {
			$this->load();
		}
		
		$json = [];
		if (!empty($_GET['showid'])) {
			$json['id'] = $this->id;
		}
		$json['key'] = $this->key;
		$json['userID'] = $this->userID;
		$json['username'] = Zotero_Users::getUsername($this->userID);
		$json['name'] = $this->name;
		
		if ($this->permissions) {
			$json['access'] = [
				'user' => [],
				'groups' => []
			];
			
			foreach ($this->permissions as $libraryID=>$p) {
				// group="all" is stored as libraryID 0
				if ($libraryID === 0) {
					$json['access']['groups']['all']['library'] = true;
					$json['access']['groups']['all']['write'] = !empty($p['write']);
				}
				else {
					$type = Zotero_Libraries::getType($libraryID);
					switch ($type) {
						case 'user':
							$json['access']['user']['library'] = true;
							foreach ($p as $permission=>$granted) {
								if ($permission == 'library') {
									continue;
								}
								$json['access']['user'][$permission] = (bool) $granted;
							}
							break;
							
						case 'group':
							$groupID = Zotero_Groups::getGroupIDFromLibraryID($libraryID);
							$json['access']['groups'][$groupID]['library'] = true;
							$json['access']['groups'][$groupID]['write'] = !empty($p['write']);
							break;
					}
				}
			}
			if (sizeOf($json['access']['user']) === 0) {
				unset($json['access']['user']);
			}
			if (sizeOf($json['access']['groups']) === 0) {
				unset($json['access']['groups']);
			}
		}
		
		$json['dateAdded'] = Zotero_Date::sqlToISO8601($this->dateAdded);
		if ($this->lastUsed != '0000-00-00 00:00:00') {
			$json['lastUsed'] =  Zotero_Date::sqlToISO8601($this->lastUsed);
		}
		
		$ips = $this->getRecentIPs();
		if ($ips) {
			$json['recentIPs'] = $ips;
		}
		
		return $json;
	}
	
	
	public function loadFromRow($row) {
		foreach ($row as $field=>$val) {
			switch ($field) {
				case 'keyID':
					$this->id = $val;
					break;
					
				default:
					$this->$field = $val;
			}
		}
		
		$this->loaded = true;
		$this->changed = array();
		$this->permissions = array();
	}
	
	
	public function logAccess() {
		if (!$this->id) {
			throw new Exception("Key not loaded");
		}
		
		$ip = IPAddress::getIP();
		
		// If we already logged access by this key from this IP address
		// in the last minute, don't do it again
		$cacheKey = "keyAccessLogged_" . $this->id . "_" . md5($ip);
		if (Z_Core::$MC->get($cacheKey)) {
			return;
		}
		
		try {
			$sql = "UPDATE `keys` SET lastUsed=NOW() WHERE keyID=?";
			Zotero_DB::query($sql, $this->id, 0, [ 'writeInReadMode' => true ]);
			if ($ip) {
				$sql = "REPLACE INTO keyAccessLog (keyID, ipAddress) VALUES (?, INET_ATON(?))";
				Zotero_DB::query($sql, [$this->id, $ip], 0, [ 'writeInReadMode' => true ]);
			}
		}
		catch (Exception $e) {
			error_log("WARNING: " . $e);
		}
		
		Z_Core::$MC->set($cacheKey, "1", 600);
	}
	
	
	private function load() {
		if ($this->id) {
			$sql = "SELECT * FROM `keys` WHERE keyID=?";
			$row = Zotero_DB::rowQuery($sql, $this->id);
		}
		else if ($this->key) {
			$sql = "SELECT * FROM `keys` WHERE `key`=?";
			$row = Zotero_DB::rowQuery($sql, $this->key);
		}
		if (!$row) {
			return false;
		}
		
		$this->loadFromRow($row);
		
		$sql = "SELECT * FROM keyPermissions WHERE keyID=?";
		$rows = Zotero_DB::query($sql, $this->id);
		foreach ($rows as $row) {
			$this->permissions[$row['libraryID']][$row['permission']] = !!$row['granted'];
			
			if ($row['permission'] == 'library') {
				// Key-based access to library provides file access as well
				$this->permissions[$row['libraryID']]['files'] = !!$row['granted'];
				
				if ($row['libraryID'] === 0 || Zotero_Libraries::getType($row['libraryID']) == 'group') {
					// Key-based access to group libraries implies view and note access
					$this->permissions[$row['libraryID']]['view'] = !!$row['granted'];
					$this->permissions[$row['libraryID']]['notes'] = !!$row['granted'];
				}
			}
		}
	}
	
	
	private function getRecentIPs() {
		$sql = "SELECT INET_NTOA(ipAddress) FROM keyAccessLog WHERE keyID=?
				ORDER BY timestamp DESC LIMIT 5";
		$ips = Zotero_DB::columnQuery($sql, $this->id);
		if (!$ips) {
			return array();
		}
		return $ips;
	}
}
?>
