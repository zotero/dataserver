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

class Zotero_Permissions {
	private $super = false;
	private $anonymous = false;
	private $userID = null;
	private $permissions = array();
	private $userPrivacy = array();
	private $groupPrivacy = array();
	
	
	public function __construct($userID=null) {
		$this->userID = $userID;
	}
	
	
	public function canAccess($libraryID, $permission='library') {
		if ($this->super) {
			return true;
		}
		
		if (!$libraryID) {
			throw new Exception('libraryID not provided');
		}
		
		// TEMP: necessary?
		$libraryID = (int) $libraryID;
		
		// If requested permission is explicitly set
		//
		// This assumes that permissions can't be incorrectly set
		// (e.g., are properly removed when a user loses group access)
		if (!empty($this->permissions[$libraryID][$permission])) {
			return true;
		}
		
		$libraryType = Zotero_Libraries::getType($libraryID);
		switch ($libraryType) {
			case 'user':
				$userID = Zotero_Users::getUserIDFromLibraryID($libraryID);
				$privacy = $this->getUserPrivacy($userID);
				break;
			
			case 'group':
				$groupID = Zotero_Groups::getGroupIDFromLibraryID($libraryID);
				
				// If key has access to all groups, grant access if user
				// has read access to group
				if (!empty($this->permissions[0]['library'])) {
					$group = Zotero_Groups::get($groupID);
					
					// Only members have file access
					if ($permission == 'files') {
						return !!$group->getUserRole($this->userID);
					}
					
					if ($group->userCanRead($this->userID)) {
						return true;
					}
				}
				
				$privacy = $this->getGroupPrivacy($groupID);
				break;
			
			default:
				throw new Exception("Unsupported library type '$libraryType'");
		}
		
		switch ($permission) {
			case 'library':
				return $privacy['publishLibrary'];
			
			case 'notes':
				return $privacy['publishNotes'];
			
			default:
				return false;
		}
	}
	
	
	/**
	 * This should be called after canAccess()
	 */
	public function canWrite($libraryID) {
		if ($this->super) {
			return true;
		}
		
		if (!$libraryID) {
			throw new Exception('libraryID not provided');
		}
		
		if (!empty($this->permissions[$libraryID]['write'])) {
			return true;
		}
		
		$libraryType = Zotero_Libraries::getType($libraryID);
		switch ($libraryType) {
			case 'user':
				return false;
			
			case 'group':
				$groupID = Zotero_Groups::getGroupIDFromLibraryID($libraryID);
				
				// If key has write access to all groups, grant access if user
				// has write access to group
				if (!empty($this->permissions[0]['write'])) {
					$group = Zotero_Groups::get($groupID);
					return $group->userCanEdit($this->userID);
				}
				
				return false;
			
			default:
				throw new Exception("Unsupported library type '$libraryType'");
		}
	}
	
	
	public function setPermission($libraryID, $permission, $enabled) {
		if ($this->super) {
			throw new Exception("Super-user permissions already set");
		}
		
		switch ($permission) {
			case 'library':
			case 'notes':
			case 'files':
			case 'write':
				break;
			
			default:
				throw new Exception("Invalid permission '$permission'");
		}
		
		$this->permissions[$libraryID][$permission] = $enabled;
	}
	
	
	public function setAnonymous() {
		$this->anonymous = true;
	}
	
	public function setUser($userID) {
		$this->userID = $userID;
	}
	
	public function setSuper() {
		$this->super = true;
	}
	
	public function isSuper() {
		return $this->super;
	}
	
	
	private function getUserPrivacy($userID) {
		if (isset($this->userPrivacy[$userID])) {
			return $this->userPrivacy[$userID];
		}
		
		if (Z_ENV_DEV_SITE) {
			// Hard-coded test values
			$privacy = array();
			
			switch ($userID) {
				case 1:
					$privacy['publishLibrary'] = true;
					$privacy['publishNotes'] = true;
					break;
					
				case 2:
					$privacy['publishLibrary'] = false;
					$privacy['publishNotes'] = false;
					break;
				
				default:
					throw new Exception("External requests disabled on dev site");
			}
			
			$this->userPrivacy[$userID] = $privacy;
			return $privacy;
		}
		
		$sql = "SELECT metaKey, metaValue FROM users_meta WHERE userID=? AND metaKey LIKE 'privacy_%'";
		try {
			$rows = Zotero_WWW_DB_2::query($sql, $userID);
		}
		catch (Exception $e) {
			Z_Core::logError("WARNING: $e -- retrying on primary");
			$rows = Zotero_WWW_DB_1::query($sql, $userID);
		}
		
		$privacy = array(
			'publishLibrary' => false,
			'publishNotes' => false
		);
		foreach ($rows as $row) {
			$privacy[substr($row['metaKey'], 8)] = (bool) (int) $row['metaValue'];
		}
		$this->userPrivacy[$userID] = $privacy;
		
		return $privacy;
	}
	
	
	private function getGroupPrivacy($groupID) {
		if (isset($this->groupPrivacy[$groupID])) {
			return $this->groupPrivacy[$groupID];
		}
		
		$group = Zotero_Groups::get($groupID);
		if (!$group) {
			throw new Exception("Group $groupID doesn't exist");
		}
		$privacy = array();
		if ($group->isPublic()) {
			$privacy['publishLibrary'] = true;
			$privacy['publishNotes'] = true;
		}
		else {
			$privacy['publishLibrary'] = false;
			$privacy['publishNotes'] = false;
		}
		
		$this->groupPrivacy[$groupID] = $privacy;
		
		return $privacy;
	}
	
	
	public function hasPermission($object, $userID=false) {
		return false;
	}
}
?>
