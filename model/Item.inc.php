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

class Zotero_Item {
	private $id;
	private $libraryID;
	private $key;
	private $itemTypeID;
	private $dateAdded;
	private $dateModified;
	private $serverDateModified;
	private $version;
	
	private $itemData = array();
	private $creators = array();
	private $creatorSummary;
	
	private $sourceItem;
	private $noteTitle = null;
	private $noteText = null;
	private $noteTextSanitized = null;
	
	private $deleted = null;
	
	private $attachmentData = array(
		'linkMode' => null,
		'mimeType' => null,
		'charset' => null,
		'storageModTime' => null,
		'storageHash' => null,
		'path' => null,
		'filename' => null
	);
	
	private $numNotes;
	private $numAttachments;
	
	private $collections = [];
	private $tags = [];
	private $relations = [];
	
	// Populated by init()
	private $loaded = array();
	private $changed = array();
	private $cacheEnabled = false;
	private $previousData = array();
	private $reload = false;
	
	public function __construct($itemTypeOrID=false) {
		$numArgs = func_num_args();
		if ($numArgs > 1) {
			throw new Exception("Constructor can take only one parameter");
		}
		
		$this->init();
		
		if ($itemTypeOrID) {
			$this->setField("itemTypeID", Zotero_ItemTypes::getID($itemTypeOrID));
		}
	}
	
	
	private function init($reload=false) {
		$this->loaded = array();
		$props = array(
			'primaryData',
			'itemData',
			'creators',
			'collections',
			'relations',
			'tags'
		);
		foreach ($props as $prop) {
			$this->loaded[$prop] = false;
		}
		
		$this->changed = array();
		// Array
		$props = array(
			'primaryData',
			'itemData',
			'creators',
			'attachmentData'
		);
		foreach ($props as $prop) {
			$this->changed[$prop] = array();
		}
		// Boolean
		$props = array(
			'deleted',
			'note',
			'source',
			'collections',
			'relations',
			'version' // for updating version/serverDateModified without changing data
		);
		foreach ($props as $prop) {
			$this->changed[$prop] = false;
		}
		
		$this->previousData = array();
		
		if ($reload) {
			$this->reload = true;
		}
	}
	
	
	public function __get($field) {
		// Inline libraryID, id, and key for performance
		if ($field == 'libraryID') {
			return $this->libraryID;
		}
		if ($field == 'id') {
			if (!$this->id && $this->key && !$this->loaded['primaryData']) {
				$this->loadPrimaryData(true);
			}
			return $this->id;
		}
		if ($field == 'key') {
			if (!$this->key && $this->id && !$this->loaded['primaryData']) {
				$this->loadPrimaryData(true);
			}
			return $this->key;
		}
		
		if (isset(Zotero_Items::$primaryFields[$field])) {
			if (!property_exists('Zotero_Item', $field)) {
				trigger_error("Zotero_Item property '$field' doesn't exist", E_USER_ERROR);
			}
			return $this->getField($field);
		}
		
		switch ($field) {
			case 'libraryKey':
				return $this->libraryID . "/" . $this->key;
			
			case 'creatorSummary':
				return $this->getCreatorSummary();
				
			case 'deleted':
				return $this->getDeleted();
			
			case 'createdByUserID':
				return $this->getCreatedByUserID();
			
			case 'lastModifiedByUserID':
				return $this->getLastModifiedByUserID();
			
			case 'attachmentLinkMode':
				return $this->getAttachmentLinkMode();
				
			case 'attachmentContentType':
				return $this->getAttachmentMIMEType();
			
			// Deprecated
			case 'attachmentMIMEType':
				return $this->getAttachmentMIMEType();
				
			case 'attachmentCharset':
				return $this->getAttachmentCharset();
			
			case 'attachmentPath':
				return $this->getAttachmentPath();
			
			case 'attachmentFilename':
				return $this->getAttachmentFilename();
			
			case 'attachmentStorageModTime':
				return $this->getAttachmentStorageModTime();
			
			case 'attachmentStorageHash':
				return $this->getAttachmentStorageHash();
			
			case 'relatedItems':
				return $this->getRelatedItems();
			
			case 'etag':
				return $this->getETag();
		}
		
		throw new Exception("'$field' is not a primary or attachment field");
	}
	
	
	public function __set($field, $val) {
		//Z_Core::debug("Setting field $field to '$val'");
		
		if ($field == 'id' || isset(Zotero_Items::$primaryFields[$field])) {
			if (!property_exists('Zotero_Item', $field)) {
				throw new Exception("Zotero_Item property '$field' doesn't exist");
			}
			return $this->setField($field, $val);
		}
		
		switch ($field) {
			case 'deleted':
				return $this->setDeleted($val);
			
			case 'attachmentLinkMode':
			case 'attachmentCharset':
			case 'attachmentStorageModTime':
			case 'attachmentStorageHash':
			case 'attachmentPath':
			case 'attachmentFilename':
				$field = substr($field, 10);
				$field[0] = strtolower($field[0]);
				$this->setAttachmentField($field, $val);
				return;
			
			case 'attachmentContentType':
			// Deprecated
			case 'attachmentMIMEType':
				$this->setAttachmentField('mimeType', $val);
				return;
			
			case 'relatedItems':
				$this->setRelatedItems($val);
				return;
		}
		
		throw new Exception("'$field' is not a valid Zotero_Item property");
	}
	
	
	public function getField($field, $unformatted=false, $includeBaseMapped=false, $skipValidation=false) {
		//Z_Core::debug("Requesting field '$field' for item $this->id", 4);
		
		if (($this->id || $this->key) && !$this->loaded['primaryData']) {
			$this->loadPrimaryData(true);
		}
		
		if ($field == 'id' || isset(Zotero_Items::$primaryFields[$field])) {
			//Z_Core::debug("Returning '{$this->$field}' for field $field", 4);
			
			return $this->$field;
		}
		
		if ($this->isNote()) {
			switch ($field) {
				case 'title':
					return $this->getNoteTitle();
				
				default:
					return '';
			}
		}
		
		if ($includeBaseMapped) {
			$fieldID = Zotero_ItemFields::getFieldIDFromTypeAndBase(
				$this->itemTypeID, $field
			);
		}
		
		if (empty($fieldID)) {
			$fieldID = Zotero_ItemFields::getID($field);
		}
		
		// If field is not valid for this (non-custom) type, return empty string
		if (!Zotero_ItemTypes::isCustomType($this->itemTypeID)
				&& !Zotero_ItemFields::isCustomField($fieldID)
				&& !array_key_exists($fieldID, $this->itemData)) {
			$msg = "Field '$field' doesn't exist for item $this->id of type {$this->itemTypeID}";
			if (!$skipValidation) {
				throw new Exception($msg);
			}
			Z_Core::debug($msg . " -- returning ''", 4);
			return '';
		}
		
		if ($this->id && is_null($this->itemData[$fieldID]) && !$this->loaded['itemData']) {
			$this->loadItemData();
		}
		
		$value = $this->itemData[$fieldID] !== false ? $this->itemData[$fieldID] : '';
		
        if (!$unformatted) {
			// Multipart date fields
			if (Zotero_ItemFields::isFieldOfBase($fieldID, 'date')) {
				$value = Zotero_Date::multipartToStr($value);
			}
		}
		
		//Z_Core::debug("Returning '$value' for field $field", 4);
		return $value;
	}
	
	
	public function getDisplayTitle($includeAuthorAndDate=false) {
		$title = $this->getField('title', false, true);
		$itemTypeID = $this->itemTypeID;
		
		if (!$title && ($itemTypeID == 8 || $itemTypeID == 10)) { // 'letter' and 'interview' itemTypeIDs
			$creators = $this->getCreators();
			$authors = array();
			$participants = array();
			if ($creators) {
				foreach ($creators as $creator) {
					if (($itemTypeID == 8 && $creator['creatorTypeID'] == 16) || // 'letter'/'recipient'
							($itemTypeID == 10 && $creator['creatorTypeID'] == 7)) { // 'interview'/'interviewer'
						$participants[] = $creator;
					}
					else if (($itemTypeID == 8 && $creator['creatorTypeID'] == 1) ||   // 'letter'/'author'
							($itemTypeID == 10 && $creator['creatorTypeID'] == 6)) { // 'interview'/'interviewee'
						$authors[] = $creator;
					}
				}
			}
			
			$strParts = array();
			
			if ($includeAuthorAndDate) {
				$names = array();
				foreach($authors as $author) {
					$names[] = $author['ref']->lastName;
				}
				
				// TODO: Use same logic as getFirstCreatorSQL() (including "et al.")
				if ($names) {
					// TODO: was localeJoin() in client
					$strParts[] = implode(', ', $names);
				}
			}
			
			if ($participants) {
				$names = array();
				foreach ($participants as $participant) {
					$names[] = $participant['ref']->lastName;
				}
				switch (sizeOf($names)) {
					case 1:
						//$str = 'oneParticipant';
						$nameStr = $names[0];
						break;
						
					case 2:
						//$str = 'twoParticipants';
						$nameStr = "{$names[0]} and {$names[1]}";
						break;
						
					case 3:
						//$str = 'threeParticipants';
						$nameStr = "{$names[0]}, {$names[1]}, and {$names[2]}";
						break;
						
					default:
						//$str = 'manyParticipants';
						$nameStr = "{$names[0]} et al.";
				}
				
				/*
				pane.items.letter.oneParticipant		= Letter to %S
				pane.items.letter.twoParticipants		= Letter to %S and %S
				pane.items.letter.threeParticipants	= Letter to %S, %S, and %S
				pane.items.letter.manyParticipants		= Letter to %S et al.
				pane.items.interview.oneParticipant	= Interview by %S
				pane.items.interview.twoParticipants	= Interview by %S and %S
				pane.items.interview.threeParticipants	= Interview by %S, %S, and %S
				pane.items.interview.manyParticipants	= Interview by %S et al.
				*/
				
				//$strParts[] = Zotero.getString('pane.items.' + itemTypeName + '.' + str, names);
				
				$loc = Zotero_ItemTypes::getLocalizedString($itemTypeID);
				// Letter
				if ($itemTypeID == 8) {
					$loc .= ' to ';
				}
				// Interview
				else {
					$loc .= ' by ';
				}
				$strParts[] = $loc . $nameStr;
				
			}
			else {
				$strParts[] = Zotero_ItemTypes::getLocalizedString($itemTypeID);
			}
			
			if ($includeAuthorAndDate) {
				$d = $this->getField('date');
				if ($d) {
					$strParts[] = $d;
				}
			}
			
			$title = '[';
			$title .= join('; ', $strParts);
			$title .= ']';
		}
		else if ($itemTypeID == 17) { // 'case' itemTypeID
			if ($title) {
				$reporter = $this->getField('reporter');
				if ($reporter) {
					$title = $title . ' (' . $reporter . ')';
				}
			}
			else { // civil law cases have only shortTitle as case name
				$strParts = array();
				$caseinfo = "";
				
				$part = $this->getField('court');
				if ($part) {
					$strParts[] = $part;
				}
				
				$part = Zotero_Date::multipartToSQL($this->getField('date', true, true));
				if ($part) {
					$strParts[] = $part;
				}
				
				$creators = $this->getCreators();
				if ($creators && $creators[0]['creatorTypeID'] === 1) {
					$strParts[] = $creators[0]['ref']->lastName;
				}
				
				$title = '[' . implode(', ', $strParts) . ']';
			}
		}
		
		return $title;
	}
	
	
	/**
	 * Returns all fields used in item
	 *
	 * @param	bool		$asNames		Return as field names
	 * @return	array				Array of field ids or names
	 */
	public function getUsedFields($asNames=false) {
		if (!$this->id) {
			return array();
		}
		
		$sql = "SELECT fieldID FROM itemData WHERE itemID=?";
		$stmt = Zotero_DB::getStatement($sql, true, Zotero_Shards::getByLibraryID($this->libraryID));
		$fields = Zotero_DB::columnQueryFromStatement($stmt, $this->id);
		if (!$fields) {
			$fields = array();
		}
		
		if ($asNames) {
			$fieldNames = array();
			foreach ($fields as $field) {
				$fieldNames[] = Zotero_ItemFields::getName($field);
			}
			$fields = $fieldNames;
		}
		
		return $fields;
	}
	
	
	/**
	 * Check if item exists in the database
	 *
	 * @return	bool			TRUE if the item exists, FALSE if not
	 */
	public function exists() {
		if (!$this->id) {
			throw new Exception('$this->id not set');
		}
		
		$sql = "SELECT COUNT(*) FROM items WHERE itemID=?";
		return !!Zotero_DB::valueQuery($sql, $this->id, Zotero_Shards::getByLibraryID($this->libraryID));
	}
	
	
	private function load($allowFail=false) {
		$this->loadPrimaryData($allowFail);
		$this->loadItemData();
		$this->loadCreators();
	}
	
	
	private function loadPrimaryData($allowFail=false) {
		Z_Core::debug("Loading primary data for item $this->libraryID/$this->key");
		
		if ($this->loaded['primaryData']) {
			throw new Exception("Primary data already loaded for item $this->libraryID/$this->key");
		}
		
		$libraryID = $this->libraryID;
		$id = $this->id;
		$key = $this->key;
		
		if (!$libraryID) {
			throw new Exception("Library ID not set");
		}
		
		if (!$id && !$key) {
			throw new Exception("ID or key not set");
		}
		
		if ($id) {
			Z_Core::debug("Loading data for item $libraryID/$id");
			$row = Zotero_Items::getPrimaryDataByID($libraryID, $id);
		}
		else {
			Z_Core::debug("Loading data for item $libraryID/$key");
			$row = Zotero_Items::getPrimaryDataByKey($libraryID, $key);
		}
		
		$this->reload = false;
		$this->loaded['primaryData'] = true;
		
		if (!$row) {
			if ($allowFail) {
				return false;
			}
			throw new Exception("Item " . ($id ? $id : "$libraryID/$key") . " not found");
		}
		
		if ($row['libraryID'] != $libraryID) {
			throw new Exception("libraryID {$row['libraryID']} != $this->libraryID");
		}
		
		$this->loadFromRow($row);
		
		return true;
	}
	
	
	public function loadFromRow($row, $reload=false) {
		if ($reload) {
			$this->init();
		}
		
		// If necessary or reloading, set the type and reinitialize $this->itemData
		if ($reload || (!$this->itemTypeID && $row['itemTypeID'])) {
			$this->setType($row['itemTypeID'], true);
		}
		
		foreach ($row as $field => $val) {
			if (!isset(Zotero_Items::$primaryFields[$field])) {
				Z_Core::debug("'$field' is not a valid primary field", 1);
			}
			
			//Z_Core::debug("Setting field '$field' to '$val' for item " . $this->id);
			switch ($field) {
				case 'itemTypeID':
					$this->setType($val, true);
					break;
				
				default:
					$this->$field = $val;
			}
		}
		
		$this->loaded['primaryData'] = true;
	}
	
	
	/**
	 * @param {Integer} $itemTypeID  itemTypeID to change to
	 * @param {Boolean} [$loadIn=false]  Internal call, so don't flag field as changed
	 */
	private function setType($itemTypeID, $loadIn=false) {
		if ($this->itemTypeID == $itemTypeID) {
			return false;
		}
		
		// TODO: block switching to/from note or attachment
		
		if (!Zotero_ItemTypes::getID($itemTypeID)) {
			throw new Exception("Invalid itemTypeID", Z_ERROR_INVALID_INPUT);
		}
		
		$copiedFields = array();
		
		$oldItemTypeID = $this->itemTypeID;
		
		if ($oldItemTypeID) {
			if ($loadIn) {
				throw new Exception('Cannot change type in loadIn mode');
			}
			if (!$this->loaded['itemData'] && $this->id) {
				$this->loadItemData();
			}
			
			$obsoleteFields = $this->getFieldsNotInType($itemTypeID);
			if ($obsoleteFields) {
				foreach($obsoleteFields as $oldFieldID) {
					// Try to get a base type for this field
					$baseFieldID =
						Zotero_ItemFields::getBaseIDFromTypeAndField($this->itemTypeID, $oldFieldID);
					
					if ($baseFieldID) {
						$newFieldID =
							Zotero_ItemFields::getFieldIDFromTypeAndBase($itemTypeID, $baseFieldID);
						
						// If so, save value to copy to new field
						if ($newFieldID) {
							$copiedFields[] = array($newFieldID, $this->getField($oldFieldID));
						}
					}
					
					// Clear old field
					$this->setField($oldFieldID, false);
				}
			}
			
			foreach ($this->itemData as $fieldID => $value) {
				if (!is_null($this->itemData[$fieldID]) &&
						(!$obsoleteFields || !in_array($fieldID, $obsoleteFields))) {
					$copiedFields[] = array($fieldID, $this->getField($fieldID));
				}
			}
		}
		
		$this->itemTypeID = $itemTypeID;
		
		if ($oldItemTypeID) {
			// Reset custom creator types to the default
			$creators = $this->getCreators();
			if ($creators) {
				foreach ($creators as $orderIndex=>$creator) {
					if (Zotero_CreatorTypes::isCustomType($creator['creatorTypeID'])) {
						continue;
					}
					if (!Zotero_CreatorTypes::isValidForItemType($creator['creatorTypeID'], $itemTypeID)) {
						// TODO: port
						
						// Reset to contributor (creatorTypeID 2), which exists in all
						$this->setCreator($orderIndex, $creator['ref'], 2);
					}
				}
			}
			
		}
		
		// If not custom item type, initialize $this->itemData with type-specific fields
		$this->itemData = array();
		if (!Zotero_ItemTypes::isCustomType($itemTypeID)) {
			$fields = Zotero_ItemFields::getItemTypeFields($itemTypeID);
			foreach($fields as $fieldID) {
				$this->itemData[$fieldID] = null;
			}
		}
		
		if ($copiedFields) {
			foreach($copiedFields as $copiedField) {
				$this->setField($copiedField[0], $copiedField[1]);
			}
		}
		
		if ($loadIn) {
			$this->loaded['itemData'] = false;
		}
		else {
			$this->changed['primaryData']['itemTypeID'] = true;
		}
		
		return true;
	}
	
	
	/*
	 * Find existing fields from current type that aren't in another
	 *
	 * If _allowBaseConversion_, don't return fields that can be converted
	 * via base fields (e.g. label => publisher => studio)
	 */
	private function getFieldsNotInType($itemTypeID, $allowBaseConversion=false) {
		$fieldIDs = array();
		
		foreach ($this->itemData as $fieldID => $val) {
			if (!is_null($val)) {
				if (Zotero_ItemFields::isValidForType($fieldID, $itemTypeID)) {
					continue;
				}
				
				if ($allowBaseConversion) {
					$baseID = Zotero_ItemFields::getBaseIDFromTypeAndField($this->itemTypeID, $fieldID);
					if ($baseID) {
						$newFieldID = Zotero_ItemFields::getFieldIDFromTypeAndBase($itemTypeID, $baseID);
						if ($newFieldID) {
							continue;
						}
					}
				}
				$fieldIDs[] = $fieldID;
			}
		}
		
		if (!$fieldIDs) {
			return false;
		}
		
		return $fieldIDs;
	}
	
	
	
	/**
	 * @param 	string|int	$field				Field name or ID
	 * @param	mixed		$value				Field value
	 * @param	bool		$loadIn				Populate the data fields without marking as changed
	 */
	public function setField($field, $value, $loadIn=false) {
		if (empty($field)) {
			throw new Exception("Field not specified");
		}
		
		// Set id, libraryID, and key without loading data first
		switch ($field) {
			case 'id':
			case 'libraryID':
			case 'key':
				// Allow libraryID to be set if empty, even if primary data is loaded,
				// which happens if an item type is set in the constructor
				if ($field == 'libraryID' && !$this->$field) {}
				else if ($this->loaded['primaryData']) {
					throw new Exception("Cannot set $field after item is already loaded");
				}
				//this._checkValue(field, val);
				$this->$field = $value;
				return;
		}
		
		if ($this->id || $this->key) {
			if (!$this->loaded['primaryData']) {
				$this->loadPrimaryData(true);
			}
		}
		else {
			$this->loaded['primaryData'] = true;
		}
		
		if ($field == 'dateAdded' || $field == 'dateModified' || $field == 'accessDate') {
			if (Zotero_Date::isISO8601($value)) {
				$value = Zotero_Date::iso8601ToSQL($value);
			}
		}
		
		// Primary field
		if (isset(Zotero_Items::$primaryFields[$field])) {
			if ($loadIn) {
				throw new Exception("Cannot set primary field $field in loadIn mode");
			}
			
			switch ($field) {
				case 'id':
				case 'version':
					trigger_error("Primary field '$field' cannot be changed through setField()", E_USER_ERROR);
			}
			
			if (!Zotero_ItemFields::validate($field, $value)) {
				trigger_error("Value '$value' of type " . gettype($value) . " does not validate for field '$field'", E_USER_ERROR);
			}
			
			if ($this->$field == $value) {
				return false;
			}
			
			Z_Core::debug("Field $field has changed from {$this->$field} to $value", 4);
			
			if ($field == 'itemTypeID') {
				$this->setType($value, $loadIn);
			}
			else {
				$this->$field = $value;
				$this->changed['primaryData'][$field] = true;
			}
			
			return true;
		}
		
		//
		// itemData field
		//
		
		if (!$this->itemTypeID) {
			trigger_error('Item type must be set before setting field data', E_USER_ERROR);
		}
		
		// If existing item, load field data first unless we're already in
		// the middle of a load
		if ($this->id) {
			if (!$loadIn && !$this->loaded['itemData']) {
				$this->loadItemData();
			}
		}
		else {
			$this->loaded['itemData'] = true;
		}
		
		$fieldID = Zotero_ItemFields::getID($field);
		
		if (!$fieldID) {
			throw new Exception("'$field' is not a valid itemData field.", Z_ERROR_INVALID_INPUT);
		}
		
		if ($value === "") {
			$value = false;
		}
		
		if ($value !== false && !Zotero_ItemFields::isValidForType($fieldID, $this->itemTypeID)) {
			throw new Exception("'$field' is not a valid field for type '"
				. Zotero_ItemTypes::getName($this->itemTypeID) . "'", Z_ERROR_INVALID_INPUT);
		}
		
		if (!$loadIn) {
			// Save date field as multipart date
			if (Zotero_ItemFields::isFieldOfBase($fieldID, 'date') &&
					!Zotero_Date::isMultipart($value)) {
				$value = Zotero_Date::strToMultipart($value);
				if ($value === "") {
					$value = false;
				}
			}
			// Validate access date
			else if ($fieldID == Zotero_ItemFields::getID('accessDate')) {
				if ($value && (!Zotero_Date::isSQLDate($value) &&
						!Zotero_Date::isSQLDateTime($value) &&
						$value != 'CURRENT_TIMESTAMP')) {
					Z_Core::debug("Discarding invalid accessDate '" . $value . "'");
					return false;
				}
			}
			
			// If existing value, make sure it's actually changing
			if ((!isset($this->itemData[$fieldID]) && $value === false) ||
					(isset($this->itemData[$fieldID]) && $this->itemData[$fieldID] === $value)) {
				return false;
			}
			
			//Z_Core::debug("Field $field has changed from {$this->itemData[$fieldID]} to $value", 4);
			
			// TODO: Save a copy of the object before modifying?
		}
		
		$this->itemData[$fieldID] = $value;
		
		if (!$loadIn) {
			$this->changed['itemData'][$fieldID] = true;
		}
		return true;
	}
	
	
	public function isNote() {
		return Zotero_ItemTypes::getName($this->getField('itemTypeID')) == 'note';
	}
	
	
	public function isAttachment() {
		return Zotero_ItemTypes::getName($this->getField('itemTypeID')) == 'attachment';
	}
	
	
	public function isImportedAttachment() {
		if (!$this->isAttachment()) {
			return false;
		}
		$name = Zotero_Attachments::linkModeNumberToName($this->attachmentLinkMode);
		return $name == "IMPORTED_FILE" || $name == "IMPORTED_URL";
	}
	
	
	public function hasChanged() {
		foreach ($this->changed as $key => $changed) {
			if ($changed) {
				Z_Core::debug("$key has changed for item {$this->libraryID}/{$this->key}");
				return true;
			}
		}
		return false;
	}
	
	
	private function getCreatorSummary() {
		if ($this->creatorSummary !== null) {
			return $this->creatorSummary;
		}
		
		if ($this->cacheEnabled) {
			$cacheVersion = 1;
			$cacheKey = $this->getCacheKey("creatorSummary", $cacheVersion);
			if ($cacheKey) {
				$creatorSummary = Z_Core::$MC->get($cacheKey);
				if ($creatorSummary !== false) {
					$this->creatorSummary = $creatorSummary;
					return $creatorSummary;
				}
			}
		}
		
		$itemTypeID = $this->getField('itemTypeID');
		$creators = $this->getCreators();
		
		$creatorTypeIDsToTry = array(
			// First try for primary creator types
			Zotero_CreatorTypes::getPrimaryIDForType($itemTypeID),
			// Then try editors
			Zotero_CreatorTypes::getID('editor'),
			// Then try contributors
			Zotero_CreatorTypes::getID('contributor')
		);
		
		$localizedAnd = " and ";
		$etAl = " et al.";
		
		$creatorSummary = '';
		foreach ($creatorTypeIDsToTry as $creatorTypeID) {
			$loc = array();
			foreach ($creators as $orderIndex=>$creator) {
				if ($creator['creatorTypeID'] == $creatorTypeID) {
					$loc[] = $orderIndex;
					
					if (sizeOf($loc) == 3) {
						break;
					}
				}
			}
			
			switch (sizeOf($loc)) {
				case 0:
					continue 2;
				
				case 1:
					$creatorSummary = $creators[$loc[0]]['ref']->lastName;
					break;
				
				case 2:
					$creatorSummary = $creators[$loc[0]]['ref']->lastName
							. $localizedAnd
							. $creators[$loc[1]]['ref']->lastName;
					break;
				
				case 3:
					$creatorSummary = $creators[$loc[0]]['ref']->lastName . $etAl;
					break;
			}
			
			break;
		}
		
		if ($this->cacheEnabled && $cacheKey) {
			Z_Core::$MC->set($cacheKey, $creatorSummary);
		}
		
		$this->creatorSummary = $creatorSummary;
		return $creatorSummary;
	}
	
	
	private function getDeleted() {
		if ($this->deleted !== null) {
			return $this->deleted;
		}
		
		if (!$this->__get('id')) {
			return false;
		}
		
		if (!is_numeric($this->id)) {
			throw new Exception("Invalid itemID");
		}
		
		if ($this->cacheEnabled) {
			$cacheVersion = 1;
			$cacheKey = $this->getCacheKey("itemIsDeleted", $cacheVersion);
			$deleted = Z_Core::$MC->get($cacheKey);
		}
		else {
			$deleted = false;
		}
		if ($deleted === false) {
			$sql = "SELECT COUNT(*) FROM deletedItems WHERE itemID=?";
			$stmt = Zotero_DB::getStatement($sql, true, Zotero_Shards::getByLibraryID($this->libraryID));
			$deleted = !!Zotero_DB::valueQueryFromStatement($stmt, $this->id);
			
			// Memcache returns false for empty keys, so use integer
			if ($this->cacheEnabled) {
				Z_Core::$MC->set($cacheKey, $deleted ? 1 : 0);
			}
		}
		
		$this->deleted = $deleted;
		
		return $deleted;
	}
	
	
	private function setDeleted($val) {
		$deleted = !!$val;
		
		if ($this->getDeleted() == $deleted) {
			Z_Core::debug("Deleted state ($deleted) hasn't changed for item $this->id");
			return;
		}
		
		if (!$this->changed['deleted']) {
			$this->changed['deleted'] = true;
		}
		$this->deleted = $deleted;
	}
	
	
	private function getCreatedByUserID() {
		$sql = "SELECT createdByUserID FROM groupItems WHERE itemID=?";
		return Zotero_DB::valueQuery($sql, $this->id, Zotero_Shards::getByLibraryID($this->libraryID));
	}
	
	
	private function getLastModifiedByUserID() {
		$sql = "SELECT lastModifiedByUserID FROM groupItems WHERE itemID=?";
		return Zotero_DB::valueQuery($sql, $this->id, Zotero_Shards::getByLibraryID($this->libraryID));
	}
	
	
	public function save($userID=false) {
		if (!$this->libraryID) {
			trigger_error("Library ID must be set before saving", E_USER_ERROR);
		}
		
		Zotero_Items::editCheck($this, $userID);
		
		if (!$this->hasChanged()) {
			Z_Core::debug("Item $this->id has not changed");
			return false;
		}
		
		$this->cacheEnabled = false;
		
		// Make sure there are no gaps in the creator indexes
		$creators = $this->getCreators();
		$lastPos = -1;
		foreach ($creators as $pos=>$creator) {
			if ($pos != $lastPos + 1) {
				trigger_error("Creator index $pos out of sequence for item $this->id", E_USER_ERROR);
			}
			$lastPos++;
		}
		
		$shardID = Zotero_Shards::getByLibraryID($this->libraryID);
		
		Zotero_DB::beginTransaction();
		
		try {
			//
			// New item, insert and return id
			//
			if (!$this->id || (!$this->changed['version'] && !$this->exists())) {
				Z_Core::debug('Saving data for new item to database');
				
				$isNew = true;
				$sqlColumns = array();
				$sqlValues = array();
				
				//
				// Primary fields
				//
				$itemID = $this->id ? $this->id : Zotero_ID::get('items');
				if ($this->key) {
					$key = $this->key;
				}
				else {
					$key = $this->key = Zotero_ID::getKey();
				}
				
				$sqlColumns = array(
					'itemID',
					'itemTypeID',
					'libraryID',
					'key',
					'dateAdded',
					'dateModified',
					'serverDateModified',
					'version'
				);
				$timestamp = Zotero_DB::getTransactionTimestamp();
				$dateAdded = $this->dateAdded ? $this->dateAdded : $timestamp;
				$dateModified = $this->dateModified ? $this->dateModified : $timestamp;
				$version = Zotero_Libraries::getUpdatedVersion($this->libraryID);
				$sqlValues = array(
					$itemID,
					$this->itemTypeID,
					$this->libraryID,
					$key,
					$dateAdded,
					$dateModified,
					$timestamp,
					$version
				);
				
				$primaryDataCache = array(
					'id' => $itemID,
					'libraryID' => $this->libraryID,
					'key' => $key,
					'itemTypeID' => $this->itemTypeID,
					'dateAdded' => $dateAdded,
					'dateModified' => $dateModified,
					'serverDateModified' => $timestamp,
					'version' => $version
				);
				
				$sql = 'INSERT INTO items (`' . implode('`, `', $sqlColumns) . '`) VALUES (';
				// Insert placeholders for bind parameters
				for ($i=0; $i<sizeOf($sqlValues); $i++) {
					$sql .= '?, ';
				}
				$sql = substr($sql, 0, -2) . ')';
				
				// Save basic data to items table
				try {
					$insertID = Zotero_DB::query($sql, $sqlValues, $shardID);
				}
				catch (Exception $e) {
					if (strpos($e->getMessage(), "Incorrect datetime value") !== false) {
						preg_match("/Incorrect datetime value: '([^']+)'/", $e->getMessage(), $matches);
						throw new Exception("=Invalid date value '{$matches[1]}' for item $key", Z_ERROR_INVALID_INPUT);
					}
					throw $e;
				}
				if (!$this->id) {
					if (!$insertID) {
						throw new Exception("Item id not available after INSERT");
					}
					$itemID = $insertID;
					
					$this->serverDateModified = $timestamp;
				}
				
				// Group item data
				if (Zotero_Libraries::getType($this->libraryID) == 'group' && $userID) {
					$sql = "INSERT INTO groupItems VALUES (?, ?, ?)";
					Zotero_DB::query($sql, array($itemID, $userID, $userID), $shardID);
				}
				
				//
				// ItemData
				//
				if ($this->changed['itemData']) {
					// Use manual bound parameters to speed things up
					$origInsertSQL = "INSERT INTO itemData (itemID, fieldID, value) VALUES ";
					$insertSQL = $origInsertSQL;
					$insertParams = array();
					$insertCounter = 0;
					$maxInsertGroups = 40;
					
					$max = Zotero_Items::$maxDataValueLength;
					
					$fieldIDs = array_keys($this->changed['itemData']);
					
					foreach ($fieldIDs as $fieldID) {
						$value = $this->getField($fieldID, true, false, true);
						
						if ($value == 'CURRENT_TIMESTAMP'
								&& Zotero_ItemFields::getID('accessDate') == $fieldID) {
							$value = Zotero_DB::getTransactionTimestamp();
						}
						
						// Check length
						if (strlen($value) > $max) {
							$fieldName = Zotero_ItemFields::getLocalizedString(
								$this->itemTypeID, $fieldID
							);
							$msg = "=$fieldName field value " .
								 "'" . mb_substr($value, 0, 50) . "...' too long";
							if ($this->key) {
								$msg .= " for item '" . $this->libraryID . "/" . $key . "'";
							}
							throw new Exception($msg, Z_ERROR_FIELD_TOO_LONG);
						}
						
						if ($insertCounter < $maxInsertGroups) {
							$insertSQL .= "(?,?,?),";
							$insertParams = array_merge(
								$insertParams,
								array($itemID, $fieldID, $value)
							);
						}
						
						if ($insertCounter == $maxInsertGroups - 1) {
							$insertSQL = substr($insertSQL, 0, -1);
							$stmt = Zotero_DB::getStatement($insertSQL, true, $shardID);
							Zotero_DB::queryFromStatement($stmt, $insertParams);
							$insertSQL = $origInsertSQL;
							$insertParams = array();
							$insertCounter = -1;
						}
						
						$insertCounter++;
					}
					
					if ($insertCounter > 0 && $insertCounter < $maxInsertGroups) {
						$insertSQL = substr($insertSQL, 0, -1);
						$stmt = Zotero_DB::getStatement($insertSQL, true, $shardID);
						Zotero_DB::queryFromStatement($stmt, $insertParams);
					}
				}
				
				//
				// Creators
				//
				if ($this->changed['creators']) {
					$indexes = array_keys($this->changed['creators']);
					
					// TODO: group queries
					
					$sql = "INSERT INTO itemCreators
								(itemID, creatorID, creatorTypeID, orderIndex) VALUES ";
					$placeholders = array();
					$sqlValues = array();
					
					$cacheRows = array();
					
					foreach ($indexes as $orderIndex) {
						Z_Core::debug('Adding creator in position ' . $orderIndex, 4);
						$creator = $this->getCreator($orderIndex);
						
						if (!$creator) {
							continue;
						}
						
						if ($creator['ref']->hasChanged()) {
							Z_Core::debug("Auto-saving changed creator {$creator['ref']->id}");
							try {
								$creator['ref']->save();
							}
							catch (Exception $e) {
								// TODO: Provide the item in question
								/*if (strpos($e->getCode() == Z_ERROR_CREATOR_TOO_LONG)) {
									$msg = $e->getMessage();
									$msg = str_replace(
										"with this name and shorten it.",
										"with this name, or paste '$key' into the quick search bar "
										. "in the Zotero toolbar, and shorten the name."
									);
									throw new Exception($msg, Z_ERROR_CREATOR_TOO_LONG);
								}*/
								throw $e;
							}
						}
						
						$placeholders[] = "(?, ?, ?, ?)";
						array_push(
							$sqlValues,
							$itemID,
							$creator['ref']->id,
							$creator['creatorTypeID'],
							$orderIndex
						);
						
						$cacheRows[] = array(
							'creatorID' => $creator['ref']->id,
							'creatorTypeID' => $creator['creatorTypeID'],
							'orderIndex' => $orderIndex
						);
					}
					
					if ($sqlValues) {
						$sql = $sql . implode(',', $placeholders);
						Zotero_DB::query($sql, $sqlValues, $shardID);
					}
				}
				
				
				// Deleted item
				if ($this->changed['deleted']) {
					$deleted = $this->getDeleted();
					if ($deleted) {
						$sql = "REPLACE INTO deletedItems (itemID) VALUES (?)";
					}
					else {
						$sql = "DELETE FROM deletedItems WHERE itemID=?";
					}
					Zotero_DB::query($sql, $itemID, $shardID);
				}
				
				
				// Note
				if ($this->isNote() || $this->changed['note']) {
					if (!is_string($this->noteText)) {
						$this->noteText = '';
					}
					// If we don't have a sanitized note, generate one
					if (is_null($this->noteTextSanitized)) {
						$noteTextSanitized = Zotero_Notes::sanitize($this->noteText);
						
						// But if note is sanitized already, store empty string
						if ($this->noteText === $noteTextSanitized) {
							$this->noteTextSanitized = '';
						}
						else {
							$this->noteTextSanitized = $noteTextSanitized;
						}
					}
					
					$this->noteTitle = Zotero_Notes::noteToTitle(
						$this->noteTextSanitized === '' ? $this->noteText : $this->noteTextSanitized
					);
					
					$sql = "INSERT INTO itemNotes
							(itemID, sourceItemID, note, noteSanitized, title, hash)
							VALUES (?,?,?,?,?,?)";
					$parent = $this->isNote() ? $this->getSource() : null;
					
					$hash = $this->noteText ? md5($this->noteText) : '';
					$bindParams = array(
						$itemID,
						$parent ? $parent : null,
						$this->noteText !== null ? $this->noteText : '',
						$this->noteTextSanitized,
						$this->noteTitle,
						$hash
					);
					
					try {
						Zotero_DB::query($sql, $bindParams, $shardID);
					}
					catch (Exception $e) {
						if (strpos($e->getMessage(), "Incorrect string value") !== false) {
							throw new Exception("=Invalid character in note '" . Zotero_Utilities::ellipsize($title, 70) . "'", Z_ERROR_INVALID_INPUT);
						}
						throw ($e);
					}
					Zotero_Notes::updateNoteCache($this->libraryID, $itemID, $this->noteText);
					Zotero_Notes::updateHash($this->libraryID, $itemID, $hash);
				}
				
				
				// Attachment
				if ($this->isAttachment()) {
					$sql = "INSERT INTO itemAttachments
							(itemID, sourceItemID, linkMode, mimeType, charsetID, path, storageModTime, storageHash)
							VALUES (?,?,?,?,?,?,?,?)";
					$parent = $this->getSource();
					if ($parent) {
						$parentItem = Zotero_Items::get($this->libraryID, $parent);
						if (!$parentItem) {
							throw new Exception("Parent item $parent not found");
						}
						if ($parentItem->getSource()) {
							$parentKey = $parentItem->key;
							throw new Exception("=Parent item $parentKey cannot be a child attachment", Z_ERROR_INVALID_INPUT);
						}
					}
					
					$linkMode = $this->attachmentLinkMode;
					$charsetID = Zotero_CharacterSets::getID($this->attachmentCharset);
					$path = $this->attachmentPath;
					$storageModTime = $this->attachmentStorageModTime;
					$storageHash = $this->attachmentStorageHash;
					
					$bindParams = array(
						$itemID,
						$parent ? $parent : null,
						$linkMode + 1,
						$this->attachmentMIMEType,
						$charsetID ? $charsetID : null,
						$path ? $path : '',
						$storageModTime ? $storageModTime : null,
						$storageHash ? $storageHash : null
					);
					Zotero_DB::query($sql, $bindParams, $shardID);
				}
				
				// Sort fields
				$sortTitle = Zotero_Items::getSortTitle($this->getDisplayTitle(true));
				if (mb_substr($sortTitle, 0, 5) == mb_substr($this->getField('title', false, true), 0, 5)) {
					$sortTitle = null;
				}
				$creatorSummary = $this->isRegularItem()
					? mb_strcut($this->getCreatorSummary(true), 0, Zotero_Creators::$creatorSummarySortLength)
					: '';
				$sql = "INSERT INTO itemSortFields (itemID, sortTitle, creatorSummary) VALUES (?, ?, ?)";
				Zotero_DB::query($sql, array($itemID, $sortTitle, $creatorSummary), $shardID);
				
				//
				// Source item id
				//
				if ($sourceItemID = $this->getSource()) {
					$newSourceItem = Zotero_Items::get($this->libraryID, $sourceItemID);
					if (!$newSourceItem) {
						throw new Exception("Cannot set source to invalid item");
					}
					
					switch (Zotero_ItemTypes::getName($this->itemTypeID)) {
						case 'note':
							$newSourceItem->incrementNoteCount();
							break;
						case 'attachment':
							$newSourceItem->incrementAttachmentCount();
							break;
					}
				}
				
				// Collections
				if (!empty($this->changed['collections'])) {
					foreach ($this->collections as $collectionKey) {
						$collection = Zotero_Collections::getByLibraryAndKey($this->libraryID, $collectionKey);
						if (!$collection) {
							throw new Exception("Collection with key '$collectionKey' not found", Z_ERROR_COLLECTION_NOT_FOUND);
						}
						$collection->addItem($itemID);
						$collection->save();
					}
				}
				
				// Tags
				if (!empty($this->changed['tags'])) {
					foreach ($this->tags as $tag) {
						$tagID = Zotero_Tags::getID($this->libraryID, $tag->tag, $tag->type);
						if ($tagID) {
							$tagObj = Zotero_Tags::get($this->libraryID, $tagID);
						}
						else {
							$tagObj = new Zotero_Tag;
							$tagObj->libraryID = $this->libraryID;
							$tagObj->name = $tag->tag;
							$tagObj->type = (int) $tag->type ? $tag->type : 0;
						}
						$tagObj->addItem($this->key);
						$tagObj->save();
					}
				}
 				
				// Related items
				if (!empty($this->changed['relations'])) {
					$uri = Zotero_URI::getItemURI($this);
					
					$sql = "INSERT IGNORE INTO relations "
						 . "(relationID, libraryID, `key`, subject, predicate, object) "
						 . "VALUES (?, ?, ?, ?, ?, ?)";
					$insertStatement = Zotero_DB::getStatement($sql, false, $shardID);
					foreach ($this->relations as $rel) {
						$insertStatement->execute(
							array(
								Zotero_ID::get('relations'),
								$this->libraryID,
								Zotero_Relations::makeKey($uri, $rel[0], $rel[1]),
								$uri,
								$rel[0],
								$rel[1]
							)
						);
					}
				}
				
				// Remove from delete log if it's there
				$sql = "DELETE FROM syncDeleteLogKeys WHERE libraryID=? AND objectType='item' AND `key`=?";
				Zotero_DB::query($sql, array($this->libraryID, $key), $shardID);
			}
			
			//
			// Existing item, update
			//
			else {
				Z_Core::debug('Updating database with new item data for item '
					. $this->libraryID . '/' . $this->key, 4);
				
				$isNew = false;
				
				//
				// Primary fields
				//
				$sql = "UPDATE items SET ";
				$sqlValues = array();
				
				$timestamp = Zotero_DB::getTransactionTimestamp();
				$version = Zotero_Libraries::getUpdatedVersion($this->libraryID);
				
				$primaryDataCache = array(
					'id' => $this->id,
					'libraryID' => $this->libraryID,
					'key' => $this->key,
					'itemTypeID' => $this->itemTypeID,
					'dateAdded' => $this->dateAdded,
					'dateModified' => $this->dateModified,
					'serverDateModified' => $timestamp,
					'version' => $version
				);
				
				$updateFields = array(
					'itemTypeID',
					'libraryID',
					'key',
					'dateAdded',
					'dateModified'
				);
				
				foreach ($updateFields as $updateField) {
					if (in_array($updateField, $this->changed['primaryData'])) {
						$sql .= "`$updateField`=?, ";
						$sqlValues[] = $this->$updateField;
					}
				}
				
				$sql .= "serverDateModified=?, version=? WHERE itemID=?";
				array_push(
					$sqlValues,
					$timestamp,
					$version,
					$this->id
				);
				
				Zotero_DB::query($sql, $sqlValues, $shardID);
				
				$this->serverDateModified = $timestamp;
				
				// Group item data
				if (Zotero_Libraries::getType($this->libraryID) == 'group' && $userID) {
					$sql = "INSERT INTO groupItems VALUES (?, ?, ?)
								ON DUPLICATE KEY UPDATE lastModifiedByUserID=?";
					Zotero_DB::query($sql, array($this->id, null, $userID, $userID), $shardID);
				}
				
				
				//
				// ItemData
				//
				if ($this->changed['itemData']) {
					$del = array();
					
					$origReplaceSQL = "REPLACE INTO itemData (itemID, fieldID, value) VALUES ";
					$replaceSQL = $origReplaceSQL;
					$replaceParams = array();
					$replaceCounter = 0;
					$maxReplaceGroups = 40;
					
					$max = Zotero_Items::$maxDataValueLength;
					
					$fieldIDs = array_keys($this->changed['itemData']);
					
					foreach ($fieldIDs as $fieldID) {
						$value = $this->getField($fieldID, true, false, true);
						
						// If field changed and is empty, mark row for deletion
						if ($value === "") {
							$del[] = $fieldID;
							continue;
						}
						
						if ($value == 'CURRENT_TIMESTAMP'
								&& Zotero_ItemFields::getID('accessDate') == $fieldID) {
							$value = Zotero_DB::getTransactionTimestamp();
						}
						
						// Check length
						if (strlen($value) > $max) {
							$fieldName = Zotero_ItemFields::getLocalizedString(
								$this->itemTypeID, $fieldID
							);
							$msg = "=$fieldName field value " .
								 "'" . mb_substr($value, 0, 50) . "...' too long";
							if ($this->key) {
								$msg .= " for item '" . $this->libraryID
									. "/" . $this->key . "'";
							}
							throw new Exception($msg, Z_ERROR_FIELD_TOO_LONG);
						}
						
						if ($replaceCounter < $maxReplaceGroups) {
							$replaceSQL .= "(?,?,?),";
							$replaceParams = array_merge($replaceParams,
								array($this->id, $fieldID, $value)
							);
						}
						
						if ($replaceCounter == $maxReplaceGroups - 1) {
							$replaceSQL = substr($replaceSQL, 0, -1);
							$stmt = Zotero_DB::getStatement($replaceSQL, true, $shardID);
							Zotero_DB::queryFromStatement($stmt, $replaceParams);
							$replaceSQL = $origReplaceSQL;
							$replaceParams = array();
							$replaceCounter = -1;
						}
						$replaceCounter++;
					}
					
					if ($replaceCounter > 0 && $replaceCounter < $maxReplaceGroups) {
						$replaceSQL = substr($replaceSQL, 0, -1);
						$stmt = Zotero_DB::getStatement($replaceSQL, true, $shardID);
						Zotero_DB::queryFromStatement($stmt, $replaceParams);
					}
					
					// Update memcached with used fields
					$fids = array();
					foreach ($this->itemData as $fieldID=>$value) {
						if ($value !== false && $value !== null) {
							$fids[] = $fieldID;
						}
					}
					
					// Delete blank fields
					if ($del) {
						$sql = 'DELETE from itemData WHERE itemID=? AND fieldID IN (';
						$sqlParams = array($this->id);
						foreach ($del as $d) {
							$sql .= '?, ';
							$sqlParams[] = $d;
						}
						$sql = substr($sql, 0, -2) . ')';
						
						Zotero_DB::query($sql, $sqlParams, $shardID);
					}
				}
				
				//
				// Creators
				//
				if ($this->changed['creators']) {
					$indexes = array_keys($this->changed['creators']);
					
					$sql = "INSERT INTO itemCreators
								(itemID, creatorID, creatorTypeID, orderIndex) VALUES ";
					$placeholders = array();
					$sqlValues = array();
					
					$cacheRows = array();
					
					foreach ($indexes as $orderIndex) {
						Z_Core::debug('Creator in position ' . $orderIndex . ' has changed', 4);
						$creator = $this->getCreator($orderIndex);
						
						$sql2 = 'DELETE FROM itemCreators WHERE itemID=? AND orderIndex=?';
						Zotero_DB::query($sql2, array($this->id, $orderIndex), $shardID);
						
						if (!$creator) {
							continue;
						}
						
						if ($creator['ref']->hasChanged()) {
							Z_Core::debug("Auto-saving changed creator {$creator['ref']->id}");
							$creator['ref']->save();
						}
						
						
						$placeholders[] = "(?, ?, ?, ?)";
						array_push(
							$sqlValues,
							$this->id,
							$creator['ref']->id,
							$creator['creatorTypeID'],
							$orderIndex
						);
					}
					
					if ($sqlValues) {
						$sql = $sql . implode(',', $placeholders);
						Zotero_DB::query($sql, $sqlValues, $shardID);
					}
				}
				
				// Deleted item
				if ($this->changed['deleted']) {
					$deleted = $this->getDeleted();
					if ($deleted) {
						$sql = "REPLACE INTO deletedItems (itemID) VALUES (?)";
					}
					else {
						$sql = "DELETE FROM deletedItems WHERE itemID=?";
					}
					Zotero_DB::query($sql, $this->id, $shardID);
				}
				
				
				// In case this was previously a standalone item,
				// delete from any collections it may have been in
				if ($this->changed['source'] && $this->getSource()) {
					$sql = "DELETE FROM collectionItems WHERE itemID=?";
					Zotero_DB::query($sql, $this->id, $shardID);
				}
				
				//
				// Note or attachment note
				//
				if ($this->changed['note']) {
					// If we don't have a sanitized note, generate one
					if (is_null($this->noteTextSanitized)) {
						$noteTextSanitized = Zotero_Notes::sanitize($this->noteText);
						// But if note is sanitized already, store empty string
						if ($this->noteText == $noteTextSanitized) {
							$this->noteTextSanitized = '';
						}
						else {
							$this->noteTextSanitized = $noteTextSanitized;
						}
					}
					
					$this->noteTitle = Zotero_Notes::noteToTitle(
						$this->noteTextSanitized === '' ? $this->noteText : $this->noteTextSanitized
					);
					
					// Only record sourceItemID in itemNotes for notes
					if ($this->isNote()) {
						$sourceItemID = $this->getSource();
					}
					$sourceItemID = !empty($sourceItemID) ? $sourceItemID : null;
					$hash = $this->noteText ? md5($this->noteText) : '';
					$sql = "INSERT INTO itemNotes
							(itemID, sourceItemID, note, noteSanitized, title, hash)
							VALUES (?,?,?,?,?,?)
							ON DUPLICATE KEY UPDATE sourceItemID=?, note=?, noteSanitized=?, title=?, hash=?";
					$bindParams = array(
						$this->id,
						$sourceItemID, $this->noteText, $this->noteTextSanitized, $this->noteTitle, $hash,
						$sourceItemID, $this->noteText, $this->noteTextSanitized, $this->noteTitle, $hash
					);
					Zotero_DB::query($sql, $bindParams, $shardID);
					Zotero_Notes::updateNoteCache($this->libraryID, $this->id, $this->noteText);
					Zotero_Notes::updateHash($this->libraryID, $this->id, $hash);
					
					// TODO: handle changed source?
				}
				
				
				// Attachment
				if ($this->changed['attachmentData']) {
					$sql = "INSERT INTO itemAttachments
						(itemID, sourceItemID, linkMode, mimeType, charsetID, path, storageModTime, storageHash)
						VALUES (?,?,?,?,?,?,?,?)
						ON DUPLICATE KEY UPDATE
							sourceItemID=VALUES(sourceItemID),
							linkMode=VALUES(linkMode),
							mimeType=VALUES(mimeType),
							charsetID=VALUES(charsetID),
							path=VALUES(path),
							storageModTime=VALUES(storageModTime),
							storageHash=VALUES(storageHash)";
					$parent = $this->getSource();
					if ($parent) {
						$parentItem = Zotero_Items::get($this->libraryID, $parent);
						if (!$parentItem) {
							throw new Exception("Parent item $parent not found");
						}
						if ($parentItem->getSource()) {
							$parentKey = $parentItem->key;
							throw new Exception("=Parent item $parentKey cannot be a child attachment", Z_ERROR_INVALID_INPUT);
						}
					}
					
					$linkMode = $this->attachmentLinkMode;
					$charsetID = Zotero_CharacterSets::getID($this->attachmentCharset);
					$path = $this->attachmentPath;
					$storageModTime = $this->attachmentStorageModTime;
					$storageHash = $this->attachmentStorageHash;
					
					$bindParams = array(
						$this->id,
						$parent ? $parent : null,
						$linkMode + 1,
						$this->attachmentMIMEType,
						$charsetID ? $charsetID : null,
						$path ? $path : '',
						$storageModTime ? $storageModTime : null,
						$storageHash ? $storageHash : null
					);
					Zotero_DB::query($sql, $bindParams, $shardID);
				}
				
				// Sort fields
				if (!empty($this->changed['primaryData']['itemTypeID']) || $this->changed['itemData'] || $this->changed['creators']) {
					$sql = "UPDATE itemSortFields SET sortTitle=?";
					$params = array();
					
					$sortTitle = Zotero_Items::getSortTitle($this->getDisplayTitle(true));
					if (mb_substr($sortTitle, 0, 5) == mb_substr($this->getField('title', false, true), 0, 5)) {
						$sortTitle = null;
					}
					$params[] = $sortTitle;
					
					if ($this->changed['creators']) {
						$creatorSummary = mb_strcut($this->getCreatorSummary(true), 0, Zotero_Creators::$creatorSummarySortLength);
						$sql .= ", creatorSummary=?";
						$params[] = $creatorSummary;
					}
					
					$sql .= " WHERE itemID=?";
					$params[] = $this->id;
					
					Zotero_DB::query($sql, $params, $shardID);
				}
				
				//
				// Source item id
				//
				if ($this->changed['source']) {
					$type = Zotero_ItemTypes::getName($this->itemTypeID);
					$Type = ucwords($type);
					
					// Update DB, if not a note or attachment we already changed above
					if (!$this->changed['attachmentData'] && (!$this->changed['note'] || !$this->isNote())) {
						$sql = "UPDATE item" . $Type . "s SET sourceItemID=? WHERE itemID=?";
						$parent = $this->getSource();
						$bindParams = array(
							$parent ? $parent : null,
							$this->id
						);
						Zotero_DB::query($sql, $bindParams, $shardID);
					}
				}
				
				
				if (false && $this->changed['source']) {
					trigger_error("Unimplemented", E_USER_ERROR);
					
					$newItem = Zotero_Items::get($this->libraryID, $sourceItemID);
					// FK check
					if ($newItem) {
						if ($sourceItemID) {
						}
						else {
							trigger_error("Cannot set $type source to invalid item $sourceItemID", E_USER_ERROR);
						}
					}
					
					$oldSourceItemID = $this->getSource();
					
					if ($oldSourceItemID == $sourceItemID) {
						Z_Core::debug("$Type source hasn't changed", 4);
					}
					else {
						$oldItem = Zotero_Items::get($this->libraryID, $oldSourceItemID);
						if ($oldSourceItemID && $oldItem) {
						}
						else {
							//$oldItemNotifierData = null;
							Z_Core::debug("Old source item $oldSourceItemID didn't exist in setSource()", 2);
						}
						
						// If this was an independent item, remove from any collections where it
						// existed previously and add source instead if there is one
						if (!$oldSourceItemID) {
							$sql = "SELECT collectionID FROM collectionItems WHERE itemID=?";
							$changedCollections = Zotero_DB::query($sql, $itemID, $shardID);
							if ($changedCollections) {
								trigger_error("Unimplemented", E_USER_ERROR);
								if ($sourceItemID) {
									$sql = "UPDATE OR REPLACE collectionItems "
										. "SET itemID=? WHERE itemID=?";
									Zotero_DB::query($sql, array($sourceItemID, $this->id), $shardID);
								}
								else {
									$sql = "DELETE FROM collectionItems WHERE itemID=?";
									Zotero_DB::query($sql, $this->id, $shardID);
								}
							}
						}
						
						$sql = "UPDATE item{$Type}s SET sourceItemID=?
								WHERE itemID=?";
						$bindParams = array(
							$sourceItemID ? $sourceItemID : null,
							$itemID
						);
						Zotero_DB::query($sql, $bindParams, $shardID);
						
						//Zotero.Notifier.trigger('modify', 'item', $this->id, notifierData);
						
						// Update the counts of the previous and new sources
						if ($oldItem) {
							/*
							switch ($type) {
								case 'note':
									$oldItem->decrementNoteCount();
									break;
								case 'attachment':
									$oldItem->decrementAttachmentCount();
									break;
							}
							*/
							//Zotero.Notifier.trigger('modify', 'item', oldSourceItemID, oldItemNotifierData);
						}
						
						if ($newItem) {
							/*
							switch ($type) {
								case 'note':
									$newItem->incrementNoteCount();
									break;
								case 'attachment':
									$newItem->incrementAttachmentCount();
									break;
							}
							*/
							//Zotero.Notifier.trigger('modify', 'item', sourceItemID, newItemNotifierData);
						}
					}
				}
				
				// Collections
				if (!empty($this->changed['collections'])) {
					$oldCollections = $this->previousData['collections'];
					$newCollections = $this->collections;
					
					$toAdd = array_diff($newCollections, $oldCollections);
					$toRemove = array_diff($oldCollections, $newCollections);
					
					foreach ($toAdd as $collectionKey) {
						$collection = Zotero_Collections::getByLibraryAndKey($this->libraryID, $collectionKey);
						if (!$collection) {
							throw new Exception("Collection with key '$collectionKey' not found", Z_ERROR_COLLECTION_NOT_FOUND);
						}
						$collection->addItem($this->id);
						$collection->save();
					}
					
					foreach ($toRemove as $collectionKey) {
						$collection = Zotero_Collections::getByLibraryAndKey($this->libraryID, $collectionKey);
						$collection->removeItem($this->id);
						$collection->save();
					}
				}
				
				if (!empty($this->changed['tags'])) {
					$oldTags = $this->previousData['tags'];
					$newTags = $this->tags;
					
					$toAdd = [];
					$toRemove = [];
					
					// Get new tags not in existing
					for ($i=0, $len=sizeOf($newTags); $i<$len; $i++) {
						if (!isset($newTags[$i]->type)) {
							$newTags[$i]->type = 0;
						}
						
						$name = trim($newTags[$i]->tag);
						$type = $newTags[$i]->type;
						
						foreach ($oldTags as $tag) {
							// Do a case-insensitive comparison, to match the client
							if (strtolower($tag->name) == strtolower($name) && $tag->type == $type) {
								continue 2;
							}
						}
						
						$toAdd[] = $newTags[$i];
					}
					
					// Get existing tags not in new
					for ($i=0, $len=sizeOf($oldTags); $i<$len; $i++) {
						$name = $oldTags[$i]->name;
						$type = $oldTags[$i]->type;
						
						foreach ($newTags as $tag) {
							if (strtolower($tag->tag) == strtolower($name) && $tag->type == $type) {
								continue 2;
							}
						}
						
						$toRemove[] = $oldTags[$i];
					}
					
					foreach ($toAdd as $tag) {
						$name = $tag->tag;
						$type = $tag->type;
						
						$tagID = Zotero_Tags::getID($this->libraryID, $name, $type, true);
						if (!$tagID) {
							$tag = new Zotero_Tag;
							$tag->libraryID = $this->libraryID;
							$tag->name = $name;
							$tag->type = $type;
							$tagID = $tag->save();
						}
						
						$tag = Zotero_Tags::get($this->libraryID, $tagID);
						$tag->addItem($this->key);
						$tag->save();
					}
					
					foreach ($toRemove as $tag) {
						$tag->removeItem($this->key);
						$tag->save();
					}
				}
				
				// Related items
				if (!empty($this->changed['relations'])) {
					$removed = [];
					$new = [];
					$current = $this->relations;
					
					// TEMP
					// Convert old-style related items into relations
					$sql = "SELECT `key` FROM itemRelated IR "
						 . "JOIN items I ON (IR.linkedItemID=I.itemID) "
						 . "WHERE IR.itemID=?";
					$toMigrate = Zotero_DB::columnQuery($sql, $this->id, $shardID);
					if ($toMigrate) {
						$prefix = Zotero_URI::getLibraryURI($this->libraryID) . "/items/";
						$new = array_map(function ($key) use ($prefix) {
							return [
								Zotero_Relations::$relatedItemPredicate,
								$prefix . $key
							];
						}, $toMigrate);
						$sql = "DELETE FROM itemRelated WHERE itemID=?";
						Zotero_DB::query($sql, $this->id, $shardID);
					}
					
					foreach ($this->previousData['relations'] as $rel) {
						if (array_search($rel, $current) === false) {
							$removed[] = $rel;
						}
					}
					
					foreach ($current as $rel) {
						if (array_search($rel, $this->previousData['relations']) !== false) {
							continue;
						}
						$new[] = $rel;
					}
					
					$uri = Zotero_URI::getItemURI($this);
					
					if ($removed) {
						$sql = "DELETE FROM relations WHERE libraryID=? AND `key`=?";
						$deleteStatement = Zotero_DB::getStatement($sql, false, $shardID);
						
						foreach ($removed as $rel) {
							$params = [
								$this->libraryID,
								Zotero_Relations::makeKey($uri, $rel[0], $rel[1])
							];
							$deleteStatement->execute($params);
							
							// TEMP
							// For owl:sameAs, delete reverse as well, since the client
							// can save that way
							if ($rel[0] == Zotero_Relations::$linkedObjectPredicate) {
								$params = [
									$this->libraryID,
									Zotero_Relations::makeKey($rel[1], $rel[0], $uri)
								];
								$deleteStatement->execute($params);
							}
						}
					}
					
					if ($new) {
						$sql = "INSERT IGNORE INTO relations "
						     . "(relationID, libraryID, `key`, subject, predicate, object) "
						     . "VALUES (?, ?, ?, ?, ?, ?)";
						$insertStatement = Zotero_DB::getStatement($sql, false, $shardID);
						
						foreach ($new as $rel) {
							$insertStatement->execute(
								array(
									Zotero_ID::get('relations'),
									$this->libraryID,
									Zotero_Relations::makeKey($uri, $rel[0], $rel[1]),
									$uri,
									$rel[0],
									$rel[1]
								)
							);
							
							// If adding a related item, the version on that item has to be
							// updated as well (if it exists). Otherwise, requests for that
							// item will return cached data without the new relation.
							if ($rel[0] == Zotero_Relations::$relatedItemPredicate) {
								$relatedItem = Zotero_URI::getURIItem($rel[1]);
								if (!$relatedItem) {
									Z_Core::debug("Related item " . $rel[1] . " does not exist "
										. "for item " . $this->libraryKey);
									continue;
								}
								// If item has already changed, assume something else is taking
								// care of saving it and don't do so now, to avoid endless loops
								// with circular relations
								if ($relatedItem->hasChanged()) {
									continue;
								}
								$relatedItem->updateVersion($userID);
							}
						}
					}
				}
			}
			
			Zotero_DB::commit();
			
			Zotero_Items::cachePrimaryData($primaryDataCache);
		}
		
		catch (Exception $e) {
			Zotero_DB::rollback();
			throw ($e);
		}
		
		if (!$this->id) {
			$this->id = $itemID;
		}
		
		$this->cacheEnabled = false;
		
		if ($isNew) {
			Zotero_Items::cache($this);
		}
		
		$this->reload();
		
		if ($isNew) {
			Zotero_Notifier::trigger('add', 'item', $this->libraryID . "/" . $this->key);
			return $this->id;
		}
		
		Zotero_Notifier::trigger('modify', 'item', $this->libraryID . "/" . $this->key);
		return true;
	}
	
	
	/**
	 * Reinitialize item so that existing instances get reloaded
	 *
	 * This is called from save() and doesn't need to be called directly
	 * unless the database is modified directly outside of this class.
	 */
	public function reload() {
		$this->init(true);
	}
	
	
	/**
	 * Update the item's version without changing any data
	 */
	public function updateVersion($userID) {
		$this->changed['version'] = true;
		$this->save($userID);
	}
	
	
	/*
	 * Returns the number of creators for this item
	 */
	public function numCreators() {
		if ($this->id && !$this->loaded['creators']) {
			$this->loadCreators();
		}
		return sizeOf($this->creators);
	}
	
	
	/**
	 * @param	int
	 * @return	Zotero_Creator
	 */
	public function getCreator($orderIndex) {
		if ($this->id && !$this->loaded['creators']) {
			$this->loadCreators();
		}
		
		return isset($this->creators[$orderIndex])
			? $this->creators[$orderIndex] : false;
	}
	
	
	/**
	 * Gets the creators in this object
	 *
	 * @return	array				Array of Zotero_Creator objects
	 */
	public function getCreators() {
		if ($this->id && !$this->loaded['creators']) {
			$this->loadCreators();
		}
		
		return $this->creators;
	}
	
	
	public function setCreator($orderIndex, Zotero_Creator $creator, $creatorTypeID) {
		if ($this->id && !$this->loaded['creators']) {
			$this->loadCreators();
		}
		
		if (!is_integer($orderIndex)) {
			throw new Exception("orderIndex must be an integer");
		}
		if (!($creator instanceof Zotero_Creator)) {
			throw new Exception("creator must be a Zotero_Creator object");
		}
		if (!is_integer($creatorTypeID)) {
			throw new Exception("creatorTypeID must be an integer");
		}
		if (!Zotero_CreatorTypes::getID($creatorTypeID)) {
			throw new Exception("Invalid creatorTypeID '$creatorTypeID'");
		}
		if ($this->libraryID != $creator->libraryID) {
			throw new Exception("Creator library IDs don't match");
		}
		
		// If creatorTypeID isn't valid for this type, use the primary type
		if (!Zotero_CreatorTypes::isValidForItemType($creatorTypeID, $this->itemTypeID)) {
			$msg = "Invalid creator type $creatorTypeID for item type " . $this->itemTypeID
					. " -- changing to primary creator";
			Z_Core::debug($msg);
			$creatorTypeID = Zotero_CreatorTypes::getPrimaryIDForType($this->itemTypeID);
		}
		
		// If creator already exists at this position, cancel
		if (isset($this->creators[$orderIndex])
				&& $this->creators[$orderIndex]['ref']->id == $creator->id
				&& $this->creators[$orderIndex]['creatorTypeID'] == $creatorTypeID
				&& !$creator->hasChanged()) {
			Z_Core::debug("Creator in position $orderIndex hasn't changed", 4);
			return false;
		}
		
		$this->creators[$orderIndex]['ref'] = $creator;
		$this->creators[$orderIndex]['creatorTypeID'] = $creatorTypeID;
		$this->changed['creators'][$orderIndex] = true;
		return true;
	}
	
	
	/*
	* Remove a creator and shift others down
	*/
	public function removeCreator($orderIndex) {
		if ($this->id && !$this->loaded['creators']) {
			$this->loadCreators();
		}
		
		if (!isset($this->creators[$orderIndex])) {
			trigger_error("No creator exists at position $orderIndex", E_USER_ERROR);
		}
		
		$this->creators[$orderIndex] = false;
		array_splice($this->creators, $orderIndex, 1);
		for ($i=$orderIndex, $max=sizeOf($this->creators)+1; $i<$max; $i++) {
			$this->changed['creators'][$i] = true;
		}
		return true;
	}
	
	
	public function isRegularItem() {
		return !($this->isNote() || $this->isAttachment());
	}
	
	
	public function isTopLevelItem() {
		return $this->isRegularItem() || !$this->getSourceKey();
	}
	
	
	public function numChildren($includeTrashed=false) {
		return $this->numNotes($includeTrashed) + $this->numAttachments($includeTrashed);
	}
	
	
	//
	//
	// Child item methods
	//
	//
	/**
	* Get the itemID of the source item for a note or file
	**/
	public function getSource() {
		if (isset($this->sourceItem)) {
			if (!$this->sourceItem) {
				return false;
			}
			if (is_int($this->sourceItem)) {
				return $this->sourceItem;
			}
			$sourceItem = Zotero_Items::getByLibraryAndKey($this->libraryID, $this->sourceItem);
			if (!$sourceItem) {
				throw new Exception("Source item $this->libraryID/$this->sourceItem for keyed source doesn't exist", Z_ERROR_ITEM_NOT_FOUND);
			}
			// Replace stored key with id
			$this->sourceItem = $sourceItem->id;
			return $sourceItem->id;
		}
		
		if (!$this->id) {
			return false;
		}
		
		if ($this->isNote()) {
			$Type = 'Note';
		}
		else if ($this->isAttachment()) {
			$Type = 'Attachment';
		}
		else {
			return false;
		}
		
		if ($this->cacheEnabled) {
			$cacheVersion = 1;
			$cacheKey = $this->getCacheKey("itemSource", $cacheVersion);
			$sourceItemID = Z_Core::$MC->get($cacheKey);
		}
		else {
			$sourceItemID = false;
		}
		if ($sourceItemID === false) {
			$sql = "SELECT sourceItemID FROM item{$Type}s WHERE itemID=?";
			$stmt = Zotero_DB::getStatement($sql, true, Zotero_Shards::getByLibraryID($this->libraryID));
			$sourceItemID = Zotero_DB::valueQueryFromStatement($stmt, $this->id);
			
			if ($this->cacheEnabled) {
				Z_Core::$MC->set($cacheKey, $sourceItemID ? $sourceItemID : 0);
			}
		}
		
		if (!$sourceItemID) {
			$sourceItemID = false;
		}
		$this->sourceItem = $sourceItemID;
		return $sourceItemID;
	}
	
	
	/**
	 * Get the key of the source item for a note or file
	 * @return	{String}
	 */
	public function getSourceKey() {
		if (isset($this->sourceItem)) {
			if (is_int($this->sourceItem)) {
				$sourceItem = Zotero_Items::get($this->libraryID, $this->sourceItem);
				return $sourceItem->key;
			}
			return $this->sourceItem;
		}
		
		if (!$this->id) {
			return false;
		}
		
		if ($this->isNote()) {
			$Type = 'Note';
		}
		else if ($this->isAttachment()) {
			$Type = 'Attachment';
		}
		else {
			return false;
		}
		
		$sql = "SELECT `key` FROM item{$Type}s A JOIN items B ON (A.sourceItemID=B.itemID) WHERE A.itemID=?";
		$key = Zotero_DB::valueQuery($sql, $this->id, Zotero_Shards::getByLibraryID($this->libraryID));
		if (!$key) {
			$key = false;
		}
		$this->sourceItem = $key;
		return $key;
	}
	
	
	public function setSource($sourceItemID) {
		if ($this->isNote()) {
			$type = 'note';
			$Type = 'Note';
		}
		else if ($this->isAttachment()) {
			$type = 'attachment';
			$Type = 'Attachment';
		}
		else {
			throw new Exception("setSource() can be called only on notes and attachments");
		}
		
		$this->sourceItem = $sourceItemID;
		$this->changed['source'] = true;
	}
	
	
	public function setSourceKey($sourceItemKey) {
		if ($this->isNote()) {
			$type = 'note';
			$Type = 'Note';
		}
		else if ($this->isAttachment()) {
			$type = 'attachment';
			$Type = 'Attachment';
		}
		else {
			throw new Exception("setSourceKey() can be called only on notes and attachments");
		}
		
		$oldSourceItemID = $this->getSource();
		if ($oldSourceItemID) {
			$sourceItem = Zotero_Items::get($this->libraryID, $oldSourceItemID);
			$oldSourceItemKey = $sourceItem->key;
		}
		else {
			$oldSourceItemKey = null;
		}
		if ($oldSourceItemKey == $sourceItemKey) {
			Z_Core::debug("Source item has not changed in Zotero_Item->setSourceKey()");
			return false;
		}
		
		$this->sourceItem = $sourceItemKey ? $sourceItemKey : false;
		$this->changed['source'] = true;
		
		return true;
	}
	
	
	/**
	 * Returns number of child attachments of item
	 *
	 * @param	{Boolean}	includeTrashed		Include trashed child items in count
	 * @return	{Integer}
	 */
	public function numAttachments($includeTrashed=false) {
		if (!$this->isRegularItem()) {
			trigger_error("numAttachments() can only be called on regular items", E_USER_ERROR);
		}
		
		if (!$this->id) {
			return 0;
		}
		
		if (!isset($this->numAttachments)) {
			$sql = "SELECT COUNT(*) FROM itemAttachments WHERE sourceItemID=?";
			$this->numAttachments = (int) Zotero_DB::valueQuery(
				$sql, $this->id, Zotero_Shards::getByLibraryID($this->libraryID)
			);
		}
		
		$deleted = 0;
		if ($includeTrashed) {
			$sql = "SELECT COUNT(*) FROM itemAttachments JOIN deletedItems USING (itemID)
					WHERE sourceItemID=?";
			$deleted = (int) Zotero_DB::valueQuery(
				$sql, $this->id, Zotero_Shards::getByLibraryID($this->libraryID)
			);
		}
		
		return $this->numAttachments + $deleted;
	}
	
	
	public function incrementAttachmentCount() {
		$this->numAttachments++;
	}
	
	
	public function decrementAttachmentCount() {
		$this->numAttachments--;
	}
	
	
	//
	//
	// Note methods
	//
	//
	/**
	 * Get the first line of the note for display in the items list
	 *
	 * Note: Note titles can also come from Zotero.Items.cacheFields()!
	 *
	 * @return	{String}
	 */
	public function getNoteTitle() {
		if (!$this->isNote() && !$this->isAttachment()) {
			throw ("getNoteTitle() can only be called on notes and attachments");
		}
		
		if ($this->noteTitle !== null) {
			return $this->noteTitle;
		}
		
		if (!$this->id) {
			return '';
		}
		
		$sql = "SELECT title FROM itemNotes WHERE itemID=?";
		$title = Zotero_DB::valueQuery($sql, $this->id, Zotero_Shards::getByLibraryID($this->libraryID));
		
		$this->noteTitle = $title ? $title : '';
		return $this->noteTitle;
	}

	
	
	/**
	* Get the text of an item note
	**/
	public function getNote($sanitized=false, $htmlspecialchars=false) {
		if (!$this->isNote() && !$this->isAttachment()) {
			throw new Exception("getNote() can only be called on notes and attachments");
		}
		
		if (!$this->id) {
			return '';
		}
		
		// Store access time for later garbage collection
		//$this->noteAccessTime = new Date();
		
		if ($sanitized) {
			if ($htmlspecialchars) {
				throw new Exception('$sanitized and $htmlspecialchars cannot currently be used together');
			}
			
			if (is_null($this->noteText)) {
				$sql = "SELECT note, noteSanitized FROM itemNotes WHERE itemID=?";
				$row = Zotero_DB::rowQuery($sql, $this->id, Zotero_Shards::getByLibraryID($this->libraryID));
				if (!$row) {
					$row = array('note' => '', 'noteSanitized' => '');
				}
				$this->noteText = $row['note'];
				$this->noteTextSanitized = $row['noteSanitized'];
			}
			// Empty string means the original note is sanitized
			return $this->noteTextSanitized === '' ? $this->noteText : $this->noteTextSanitized;
		}
		
		if (is_null($this->noteText)) {
			$note = Zotero_Notes::getCachedNote($this->libraryID, $this->id);
			if ($note === false) {
				$sql = "SELECT note FROM itemNotes WHERE itemID=?";
				$note = Zotero_DB::valueQuery($sql, $this->id, Zotero_Shards::getByLibraryID($this->libraryID));
			}
			$this->noteText = $note !== false ? $note : '';
		}
		
		if ($this->noteText !== '' && $htmlspecialchars) {
			$noteHash = $this->getNoteHash();
			if (!$noteHash) {
				throw new Exception("Note hash is empty");
			}
			$cacheKey = "htmlspecialcharsNote_$noteHash";
			$note = Z_Core::$MC->get($cacheKey);
			if ($note === false) {
				$note = htmlspecialchars($this->noteText);
				Z_Core::$MC->set($cacheKey, $note);
			}
			return $note;
		}
		
		return $this->noteText;
	}
	
	
	/**
	* Set an item note
	*
	* Note: This can only be called on notes and attachments
	**/
	public function setNote($text) {
		if (!$this->isNote() && !$this->isAttachment()) {
			trigger_error("setNote() can only be called on notes and attachments", E_USER_ERROR);
		}
		
		if (!is_string($text)) {
			$text = '';
		}
		
		if (mb_strlen($text) > Zotero_Notes::$MAX_NOTE_LENGTH) {
			// UTF-8 &nbsp; (0xC2 0xA0) isn't trimmed by default
			$whitespace = chr(0x20) . chr(0x09) . chr(0x0A) . chr(0x0D)
							. chr(0x00) . chr(0x0B) . chr(0xC2) . chr(0xA0);
			$excerpt = iconv(
				"UTF-8",
				"UTF-8//IGNORE",
				Zotero_Notes::noteToTitle(trim($text), true)
			);
			$excerpt = trim($excerpt, $whitespace);
			// If tag-stripped version is empty, just return raw HTML
			if ($excerpt == '') {
				$excerpt = iconv(
					"UTF-8",
					"UTF-8//IGNORE",
					preg_replace(
						'/\s+/',
						' ',
						mb_substr(trim($text), 0, Zotero_Notes::$MAX_TITLE_LENGTH)
					)
				);
				$excerpt = html_entity_decode($excerpt);
				$excerpt = trim($excerpt, $whitespace);
			}
			
			$msg = "=Note '" . $excerpt . "...' too long";
			if ($this->key) {
				$msg .= " for item '" . $this->libraryID . "/" . $this->key . "'";
			}
			throw new Exception($msg, Z_ERROR_NOTE_TOO_LONG);
		}
		
		$sanitizedText = Zotero_Notes::sanitize($text);
		
		if ($sanitizedText === $this->getNote(true)) {
			Z_Core::debug("Note text hasn't changed in setNote()");
			return;
		}
		
		$this->noteText = $text;
		// If sanitized version is the same as original, store empty string
		if ($text === $sanitizedText) {
			$this->noteTextSanitized = '';
		}
		else {
			$this->noteTextSanitized = $sanitizedText;
		}
		$this->changed['note'] = true;
	}
	
	
	/**
	 * Returns number of child notes of item
	 *
	 * @param	{Boolean}	includeTrashed		Include trashed child items in count
	 * @return	{Integer}
	 */
	public function numNotes($includeTrashed=false) {
		if ($this->isNote()) {
			throw new Exception("numNotes() cannot be called on items of type 'note'");
		}
		
		if (!$this->id) {
			return 0;
		}
		
		if (!isset($this->numNotes)) {
			$sql = "SELECT COUNT(*) FROM itemNotes WHERE sourceItemID=?";
			$this->numNotes = (int) Zotero_DB::valueQuery(
				$sql, $this->id, Zotero_Shards::getByLibraryID($this->libraryID)
			);
		}
		
		$deleted = 0;
		if ($includeTrashed) {
			$sql = "SELECT COUNT(*) FROM itemNotes WHERE sourceItemID=? AND
					itemID IN (SELECT itemID FROM deletedItems)";
			$deleted = (int) Zotero_DB::valueQuery(
				$sql, $this->id, Zotero_Shards::getByLibraryID($this->libraryID)
			);
		}
		
		return $this->numNotes + $deleted;
	}
	
	
	public function incrementNoteCount() {
		$this->numNotes++;
	}
	
	
	public function decrementNoteCount() {
		$this->numNotes--;
	}
	
	
	//
	//
	// Methods dealing with item notes
	//
	//
	/**
	* Returns an array of note itemIDs for this item
	**/
	public function getNotes() {
		if ($this->isNote()) {
			throw new Exception("getNotes() cannot be called on items of type 'note'");
		}
		
		if (!$this->id) {
			return array();
		}
		
		$sql = "SELECT N.itemID FROM itemNotes N NATURAL JOIN items
				WHERE sourceItemID=? ORDER BY title";
		
		/*
		if (Zotero.Prefs.get('sortNotesChronologically')) {
			sql += " ORDER BY dateAdded";
			return Zotero.DB.columnQuery(sql, $this->id);
		}
		*/
		
		$itemIDs = Zotero_DB::columnQuery($sql, $this->id, Zotero_Shards::getByLibraryID($this->libraryID));
		if (!$itemIDs) {
			return array();
		}
		return $itemIDs;
	}
	
	
	//
	//
	// Attachment methods
	//
	//
	/**
	 * Get the link mode of an attachment
	 *
	 * Possible return values specified as constants in Zotero.Attachments
	 * (e.g. Zotero.Attachments.LINK_MODE_LINKED_FILE)
	 */
	private function getAttachmentLinkMode() {
		if (!$this->isAttachment()) {
			throw new Exception("attachmentLinkMode can only be retrieved for attachment items");
		}
		
		if ($this->attachmentData['linkMode'] !== null) {
			return $this->attachmentData['linkMode'];
		}
		
		if (!$this->id) {
			return null;
		}
		
		// Return ENUM as 0-index integer
		$sql = "SELECT linkMode - 1 FROM itemAttachments WHERE itemID=?";
		$stmt = Zotero_DB::getStatement($sql, true, Zotero_Shards::getByLibraryID($this->libraryID));
		// DEBUG: why is this returned as a float without the cast?
		$linkMode = (int) Zotero_DB::valueQueryFromStatement($stmt, $this->id);
		$this->attachmentData['linkMode'] = $linkMode;
		return $linkMode;
	}
	
	
	/**
	 * Get the MIME type of an attachment (e.g. 'text/plain')
	 */
	private function getAttachmentMIMEType() {
		if (!$this->isAttachment()) {
			trigger_error("attachmentMIMEType can only be retrieved for attachment items", E_USER_ERROR);
		}
		
		if ($this->attachmentData['mimeType'] !== null) {
			return $this->attachmentData['mimeType'];
		}
		
		if (!$this->id) {
			return '';
		}
		
		$sql = "SELECT mimeType FROM itemAttachments WHERE itemID=?";
		$stmt = Zotero_DB::getStatement($sql, true, Zotero_Shards::getByLibraryID($this->libraryID));
		$mimeType = Zotero_DB::valueQueryFromStatement($stmt, $this->id);
		if (!$mimeType) {
			$mimeType = '';
		}
		
		// TEMP: Strip some invalid characters
		$mimeType = iconv("UTF-8", "ASCII//IGNORE", $mimeType);
		$mimeType = preg_replace('/[^\x{0009}\x{000a}\x{000d}\x{0020}-\x{D7FF}\x{E000}-\x{FFFD}]+/u', '', $mimeType);
		
		$this->attachmentData['mimeType'] = $mimeType;
		return $mimeType;
	}
	
	
	/**
	 * Get the character set of an attachment
	 *
	 * @return	string					Character set name
	 */
	private function getAttachmentCharset() {
		if (!$this->isAttachment()) {
			trigger_error("attachmentCharset can only be retrieved for attachment items", E_USER_ERROR);
		}
		
		if ($this->attachmentData['charset'] !== null) {
			return $this->attachmentData['charset'];
		}
		
		if (!$this->id) {
			return '';
		}
		
		$sql = "SELECT charsetID FROM itemAttachments WHERE itemID=?";
		$stmt = Zotero_DB::getStatement($sql, true, Zotero_Shards::getByLibraryID($this->libraryID));
		$charset = Zotero_DB::valueQueryFromStatement($stmt, $this->id);
		if ($charset) {
			$charset = Zotero_CharacterSets::getName($charset);
		}
		else {
			$charset = '';
		}
		
		$this->attachmentData['charset'] = $charset;
		return $charset;
	}
	
	
	private function getAttachmentPath() {
		if (!$this->isAttachment()) {
			trigger_error("attachmentPath can only be retrieved for attachment items", E_USER_ERROR);
		}
		
		if ($this->attachmentData['path'] !== null) {
			return $this->attachmentData['path'];
		}
		
		if (!$this->id) {
			return '';
		}
		
		$sql = "SELECT path FROM itemAttachments WHERE itemID=?";
		$stmt = Zotero_DB::getStatement($sql, true, Zotero_Shards::getByLibraryID($this->libraryID));
		$path = Zotero_DB::valueQueryFromStatement($stmt, $this->id);
		if (!$path) {
			$path = '';
		}
		$this->attachmentData['path'] = $path;
		return $path;
	}
	
	
	private function getAttachmentFilename() {
		if (!$this->isAttachment()) {
			throw new Exception("attachmentFilename can only be retrieved for attachment items");
		}
		
		if (!$this->isImportedAttachment()) {
			throw new Exception("attachmentFilename cannot be retrieved for linked attachments");
		}
		
		if ($this->attachmentData['filename'] !== null) {
			return $this->attachmentData['filename'];
		}
		
		if (!$this->id) {
			return '';
		}
		
		$path = $this->attachmentPath;
		if (!$path) {
			return '';
		}
		
		// Strip "storage:"
		$filename = substr($path, 8);
		$filename = Zotero_Attachments::decodeRelativeDescriptorString($filename);
		
		$this->attachmentData['filename'] = $filename;
		return $filename;
	}
	
	
	private function getAttachmentStorageModTime() {
		if (!$this->isAttachment()) {
			trigger_error("attachmentStorageModTime can only be retrieved
				for attachment items", E_USER_ERROR);
		}
		
		if ($this->attachmentData['storageModTime'] !== null) {
			return $this->attachmentData['storageModTime'];
		}
		
		if (!$this->id) {
			return null;
		}
		
		$sql = "SELECT storageModTime FROM itemAttachments WHERE itemID=?";
		$stmt = Zotero_DB::getStatement($sql, true, Zotero_Shards::getByLibraryID($this->libraryID));
		$val = Zotero_DB::valueQueryFromStatement($stmt, $this->id);
		
		$this->attachmentData['storageModTime'] = $val;
		return $val;
	}
	
	
	private function getAttachmentStorageHash() {
		if (!$this->isAttachment()) {
			trigger_error("attachmentStorageHash can only be retrieved
				for attachment items", E_USER_ERROR);
		}
		
		if ($this->attachmentData['storageHash'] !== null) {
			return $this->attachmentData['storageHash'];
		}
		
		if (!$this->id) {
			return null;
		}
		
		$sql = "SELECT storageHash FROM itemAttachments WHERE itemID=?";
		$stmt = Zotero_DB::getStatement($sql, true, Zotero_Shards::getByLibraryID($this->libraryID));
		$val = Zotero_DB::valueQueryFromStatement($stmt, $this->id);
		$this->attachmentData['storageHash'] = $val;
		return $val;
	}
	
	
	private function setAttachmentField($field, $val) {
		Z_Core::debug("Setting attachment field $field to '$val'");
		switch ($field) {
			case 'mimeType':
				$field = 'mimeType';
				$fieldCap = 'MIMEType';
				break;
			
			case 'linkMode':
			case 'charset':
			case 'storageModTime':
			case 'storageHash':
			case 'path':
			case 'filename':
				$fieldCap = ucwords($field);
				break;
				
			default:
				trigger_error("Invalid attachment field $field", E_USER_ERROR);
		}
		
		if (!$this->isAttachment()) {
			trigger_error("attachment$fieldCap can only be set for attachment items", E_USER_ERROR);
		}
		
		// Validate linkMode
		if ($field == 'linkMode') {
			Zotero_Attachments::linkModeNumberToName($val);
		}
		else if ($field == 'filename') {
			$linkMode = $this->getAttachmentLinkMode();
			$linkMode = Zotero_Attachments::linkModeNumberToName($linkMode);
			if ($linkMode == "LINKED_URL") {
				throw new Exception("Linked URLs cannot have filenames");
			}
			else if ($linkMode == "LINKED_FILE") {
				throw new Exception("Cannot change filename for linked file");
			}
			
			$field = 'path';
			$fieldCap = 'Path';
			$val = 'storage:' . Zotero_Attachments::encodeRelativeDescriptorString($val);
		}
		
		/*if (!is_int($val) && !$val) {
			$val = '';
		}*/
		
		$fieldName = 'attachment' . $fieldCap;
		
		if ($val === $this->$fieldName) {
			return;
		}
		
		// Don't allow changing of existing linkMode
		if ($field == 'linkMode' && $this->$fieldName !== null) {
			throw new Exception("Cannot change existing linkMode for item "
				. $this->libraryID . "/" . $this->key);
		}
		
		$this->changed['attachmentData'][$field] = true;
		$this->attachmentData[$field] = $val;
	}
	
	
	/**
	* Returns an array of attachment itemIDs that have this item as a source,
	* or FALSE if none
	**/
	public function getAttachments() {
		if ($this->isAttachment()) {
			throw new Exception("getAttachments() cannot be called on attachment items");
		}
		
		if (!$this->id) {
			return false;
		}
		
		$sql = "SELECT itemID FROM items NATURAL JOIN itemAttachments WHERE sourceItemID=?";
		
		// TODO: reimplement sorting by title using values from MongoDB?
		
		/*
		if (Zotero.Prefs.get('sortAttachmentsChronologically')) {
			sql +=  " ORDER BY dateAdded";
			return Zotero.DB.columnQuery(sql, this.id);
		}
		*/
		
		$itemIDs = Zotero_DB::columnQuery($sql, $this->id, Zotero_Shards::getByLibraryID($this->libraryID));
		if (!$itemIDs) {
			return array();
		}
		return $itemIDs;
	}
	
	
	
	//
	// Methods dealing with tags
	//
	// save() is not required for tag functions
	//
	public function numTags() {
		if (!$this->id) {
			return 0;
		}
		
		$sql = "SELECT COUNT(*) FROM itemTags WHERE itemID=?";
		return (int) Zotero_DB::valueQuery($sql, $this->id, Zotero_Shards::getByLibraryID($this->libraryID));
	}
	
	
	/**
	 * Returns all tags assigned to an item
	 *
	 * @return	array			Array of Zotero.Tag objects
	 */
	public function getTags($asIDs=false) {
		if (!$this->id) {
			return array();
		}
		
		$sql = "SELECT tagID FROM tags JOIN itemTags USING (tagID)
				WHERE itemID=? ORDER BY name";
		$tagIDs = Zotero_DB::columnQuery($sql, $this->id, Zotero_Shards::getByLibraryID($this->libraryID));
		if (!$tagIDs) {
			return array();
		}
		
		if ($asIDs) {
			return $tagIDs;
		}
		
		$tagObjs = array();
		foreach ($tagIDs as $tagID) {
			$tag = Zotero_Tags::get($this->libraryID, $tagID, true);
			$tagObjs[] = $tag;
		}
		return $tagObjs;
	}
	
	
	/**
	 * Updates the tags associated with an item
	 *
	 * @param array $newTags Array of objects with properties 'tag' and 'type'
	 */
	public function setTags($newTags) {
		if (!$this->loaded['tags']) {
			$this->loadTags();
		}
		
		if (!$newTags && !$this->tags) {
			return false;
		}
		
		$this->storePreviousData('tags');
		$this->tags = [];
		foreach ($newTags as $newTag) {
			$obj = new stdClass;
			// Allow the passed array to contain either strings or objects
			if (is_string($newTag)) {
				$obj->tag = $newTag;
				$obj->type = 0;
			}
			else {
				$obj->tag = $newTag->tag;
				$obj->type = (int) isset($newTag->type) ? $newTag->type : 0;
			}
			$this->tags[] = $obj;
		}
		$this->changed['tags'] = true;
	}
	
	
	//
	// Methods dealing with collections
	//
	public function numCollections() {
		if (!$this->loaded['collections']) {
			$this->loadCollections();
		}
		return sizeOf($this->collections);
	}
	
	
	/**
	 * Returns all collections the item is in
	 *
	 * @param boolean [$asKeys=false] Return collection keys instead of collection objects
	 * @return array Array of Zotero_Collection objects, or keys if $asKeys=true
	 */
	public function getCollections($asKeys=false) {
		if (!$this->loaded['collections']) {
			$this->loadCollections();
		}
		if ($asKeys) {
			return $this->collections;
		}
		return array_map(function ($key) {
			return Zotero_Collections::getByLibraryAndKey(
				$this->libraryID, $key, true
			);
		}, $this->collections);
	}
	
	
	/**
	 * Updates the collections an item is in
	 *
	 * @param array $newCollections Array of new collection keys to set
	 */
	public function setCollections($collectionKeys=[]) {
		if (!$this->loaded['collections']) {
			$this->loadCollections();
		}
		
		if ((!$this->collections && !$collectionKeys) ||
				(!Zotero_Utilities::arrayDiffFast($this->collections, $collectionKeys) &&
				!Zotero_Utilities::arrayDiffFast($collectionKeys, $this->collections))) {
			Z_Core::debug("Collections have not changed for item $this->id");
			return;
		}
		
		$this->storePreviousData('collections');
		$this->collections = array_unique($collectionKeys);
		$this->changed['collections'] = true;
	}
	
	
	//
	// Methods dealing with relations
	//
	/**
	 * Returns all relations of the item
	 *
	 * @return object Object with predicates as keys and URIs as values
	 */
	public function getRelations() {
		if (!$this->loaded['relations']) {
			$this->loadRelations();
		}
		
		$toReturn = new stdClass;
		foreach ($this->relations as $relation) {
			// Relations are stored internally as predicate-object pairs
			$predicate = $relation[0];
			if (isset($toReturn->$predicate)) {
				// If object with predicate exists, convert to an array
				if (is_string($toReturn->$predicate)) {
					$toReturn->$predicate = array($toReturn->$predicate);
				}
				// Add new object to array
				$toReturn->{$predicate}[] = $relation[1];
			}
			// Add first object as a string
			else {
				$toReturn->$predicate = $relation[1];
			}
		}
		return $toReturn;
	}
	
	
	/**
	 * Updates the item's relations
	 *
	 * @param object $newRelations Object with predicates as keys and URIs/arrays-of-URIs as values
	 */
	public function setRelations($newRelations) {
		if (!$this->loaded['relations']) {
			$this->loadRelations();
		}
		
		// An empty array is allowed by updateFromJSON()
		if (is_array($newRelations) && empty($newRelations)) {
			$newRelations = new stdClass;
		}
		
		// There can be more than one object for a given predicate, so build
		// flat arrays with individual predicate-object pairs converted to
		// JSON strings so we can use array_diff to determine what changed
		$oldRelations = $this->relations;
		
		$sortFunc = function ($a, $b) {
			if ($a[0] < $b[0]) return -1;
			if ($a[0] > $b[0]) return 1;
			return strcmp($a[1], $b[1]);
		};
		
		$newRelationsFlat = [];
		foreach ($newRelations as $predicate => $object) {
			if (is_array($object)) {
				foreach ($object as $o) {
					$newRelationsFlat[] = [$predicate, $o];
				}
			}
			else {
				$newRelationsFlat[] = [$predicate, $object];
			}
		}
		
		$changed = false;
		if (sizeOf($oldRelations) != sizeOf($newRelationsFlat)) {
			$changed = true;
		}
		else {
			usort($oldRelations, $sortFunc);
			usort($newRelationsFlat, $sortFunc);
			
			for ($i=0; $i<sizeOf($oldRelations); $i++) {
				if (!isset($newRelationsFlat) || $oldRelations[$i] != $newRelationsFlat[$i]) {
					$changed = true;
					break;
				}
			}
		}
		
		if (!$changed) {
			Z_Core::debug("Relations have not changed for item $this->id");
			return false;
		}
		
		$this->storePreviousData('relations');
		// Store relations internally as array of predicate-object pairs
		$this->relations = $newRelationsFlat;
		$this->changed['relations'] = true;
	}
	
	
	public function toHTML($asSimpleXML=false) {
		$html = new SimpleXMLElement('<table/>');
		
		/*
		// Title
		$tr = $html->addChild('tr');
		$tr->addAttribute('class', 'title');
		$tr->addChild('th', Zotero_ItemFields::getLocalizedString(false, 'title'));
		$tr->addChild('td', htmlspecialchars($item->getDisplayTitle(true)));
		*/
		
		// Item type
		Zotero_Atom::addHTMLRow(
			$html,
			"itemType",
			Zotero_ItemFields::getLocalizedString(false, 'itemType'),
			Zotero_ItemTypes::getLocalizedString($this->itemTypeID)
		);
		
		// Creators
		$creators = $this->getCreators();
		if ($creators) {
			$displayText = '';
			foreach ($creators as $creator) {
				// Two fields
				if ($creator['ref']->fieldMode == 0) {
					$displayText = $creator['ref']->firstName . ' ' . $creator['ref']->lastName;
				}
				// Single field
				else if ($creator['ref']->fieldMode == 1) {
					$displayText = $creator['ref']->lastName;
				}
				else {
					// TODO
				}
				
				Zotero_Atom::addHTMLRow(
					$html,
					"creator",
					Zotero_CreatorTypes::getLocalizedString($creator['creatorTypeID']),
					trim($displayText)
				);
			}
		}
		
		$primaryFields = array();
		$fields = array_merge($primaryFields, $this->getUsedFields());
		
		foreach ($fields as $field) {
			if (in_array($field, $primaryFields)) {
				$fieldName = $field;
			}
			else {
				$fieldName = Zotero_ItemFields::getName($field);
			}
			
			// Skip certain fields
			switch ($fieldName) {
				case '':
				case 'userID':
				case 'libraryID':
				case 'key':
				case 'itemTypeID':
				case 'itemID':
				case 'title':
				case 'serverDateModified':
				case 'version':
					continue 2;
			}
			
			if (Zotero_ItemFields::isFieldOfBase($fieldName, 'title')) {
				continue;
			}
			
			$localizedFieldName = Zotero_ItemFields::getLocalizedString(false, $field);
			
			$value = $this->getField($field);
			$value = trim($value);
			
			// Skip empty fields
			if (!$value) {
				continue;
			}
			
			$fieldText = '';
			
			// Shorten long URLs manually until Firefox wraps at ?
			// (like Safari) or supports the CSS3 word-wrap property
			if (false && preg_match("'https?://'", $value)) {
				$fieldText = $value;
				
				$firstSpace = strpos($value, ' ');
				// Break up long uninterrupted string
				if (($firstSpace === false && strlen($value) > 29) || $firstSpace > 29) {
					$stripped = false;
					
					/*
					// Strip query string for sites we know don't need it
					for each(var re in _noQueryStringSites) {
						if (re.test($field)){
							var pos = $field.indexOf('?');
							if (pos != -1) {
								fieldText = $field.substr(0, pos);
								stripped = true;
							}
							break;
						}
					}
					*/
					
					if (!$stripped) {
						// Add a line-break after the ? of long URLs
						//$fieldText = str_replace($field.replace('?', "?<ZOTEROBREAK/>");
						
						// Strip query string variables from the end while the
						// query string is longer than the main part
						$pos = strpos($fieldText, '?');
						if ($pos !== false) {
							while ($pos < (strlen($fieldText) / 2)) {
								$lastAmp = strrpos($fieldText, '&');
								if ($lastAmp === false) {
									break;
								}
								$fieldText = substr($fieldText, 0, $lastAmp);
								$shortened = true;
							}
							// Append '&...' to the end
							if ($shortened) {
								 $fieldText .= "&…";
							}
						}
					}
				}
				
				if ($field == 'url') {
					$linkContainer = new SimpleXMLElement("<container/>");
					$linkContainer->a = $value;
					$linkContainer->a['href'] = $fieldText;
				}
			}
			// Remove SQL date from multipart dates
			// (e.g. '2006-00-00 Summer 2006' becomes 'Summer 2006')
			else if ($fieldName == 'date') {
				$fieldText = $value;
			}
			// Convert dates to local format
			else if ($fieldName == 'accessDate' || $fieldName == 'dateAdded' || $fieldName == 'dateModified') {
				//$date = Zotero.Date.sqlToDate($field, true)
				$date = $value;
				//fieldText = escapeXML(date.toLocaleString());
				$fieldText = $date;
			}
			else {
				$fieldText = $value;
			}
			
			if (isset($linkContainer)) {
				$tr = Zotero_Atom::addHTMLRow($html, $fieldName, $localizedFieldName, "", true);
				
				$tdNode = dom_import_simplexml($tr->td);
				$linkNode = dom_import_simplexml($linkContainer->a);
				$importedNode = $tdNode->ownerDocument->importNode($linkNode, true);
				$tdNode->appendChild($importedNode);
				unset($linkContainer);
			}
			else {
				Zotero_Atom::addHTMLRow($html, $fieldName, $localizedFieldName, $fieldText);
			}
		}
		
		if ($this->isNote() || $this->isAttachment()) {
			$note = $this->getNote(true);
			if ($note) {
				$tr = Zotero_Atom::addHTMLRow($html, "note", "Note", "", true);
				
				try {
					$noteXML = @new SimpleXMLElement("<td>" . $note . "</td>");
					$trNode = dom_import_simplexml($tr);
					$tdNode = $trNode->getElementsByTagName("td")->item(0);
					$noteNode = dom_import_simplexml($noteXML);
					$importedNode = $trNode->ownerDocument->importNode($noteNode, true);
					$trNode->replaceChild($importedNode, $tdNode);
					unset($noteXML);
				}
				catch (Exception $e) {
					// Store non-HTML notes as <pre>
					$tr->td->pre = $note;
				}
			}
		}
		
		if ($this->isAttachment()) {
			Zotero_Atom::addHTMLRow($html, "linkMode", "Link Mode", $this->attachmentLinkMode);
			Zotero_Atom::addHTMLRow($html, "mimeType", "MIME Type", $this->attachmentMIMEType);
			Zotero_Atom::addHTMLRow($html, "charset", "Character Set", $this->attachmentCharset);
			
			// TODO: get from a constant
			/*if ($this->attachmentLinkMode != 3) {
				$doc->addField('path', $this->attachmentPath);
			}*/
		}
		
		if ($this->getDeleted()) {
			Zotero_Atom::addHTMLRow($html, "deleted", "Deleted", "Yes");
		}
		
		if ($asSimpleXML) {
			return $html;
		}
		
		return str_replace('<?xml version="1.0"?>', '', $html->asXML());
	}
	
	
	public function toResponseJSON($requestParams=[], Zotero_Permissions $permissions, $sharedData=null) {
		$t = microtime(true);
		
		if (!$this->loaded['primaryData']) {
			$this->loadPrimaryData(true);
		}
		if (!$this->loaded['itemData']) {
			$this->loadItemData();
		}
		
		// Uncached stuff or parts of the cache key
		$version = $this->version;
		$parent = $this->getSource();
		$isRegularItem = !$parent && $this->isRegularItem();
		$downloadDetails = $permissions->canAccess($this->libraryID, 'files')
								? Zotero_Storage::getDownloadDetails($this)
								: false;
		if ($isRegularItem) {
			$numChildren = $permissions->canAccess($this->libraryID, 'notes')
								? $this->numChildren()
								: $this->numAttachments();
		}
		$libraryType = Zotero_Libraries::getType($this->libraryID);
		
		// Any query parameters that have an effect on the output
		// need to be added here
		$allowedParams = [
			'include',
			'style',
			'css',
			'linkwrap'
		];
		$cachedParams = Z_Array::filterKeys($requestParams, $allowedParams);
		
		$cacheVersion = 1;
		$cacheKey = "jsonEntry_" . $this->libraryID . "/" . $this->id . "_"
			. md5(
				$version
				. json_encode($cachedParams)
				. ($downloadDetails ? 'hasFile' : '')
				// For groups, include the group WWW URL, which can change
				. ($libraryType == 'group' ? Zotero_URI::getItemURI($this, true) : '')
			)
			. "_" . $requestParams['v']
			// For code-based changes
			. "_" . $cacheVersion
			// For data-based changes
			. (isset(Z_CONFIG::$CACHE_VERSION_RESPONSE_JSON_ITEM)
				? "_" . Z_CONFIG::$CACHE_VERSION_RESPONSE_JSON_ITEM
				: "")
			// If there's bib content, include the bib cache version
			. ((in_array('bib', $requestParams['include'])
					&& isset(Z_CONFIG::$CACHE_VERSION_BIB))
				? "_" . Z_CONFIG::$CACHE_VERSION_BIB
				: "");
		
		$cached = Z_Core::$MC->get($cacheKey);
		if (false && $cached) {
			// Make sure numChildren reflects the current permissions
			if ($isRegularItem) {
				$json = json_decode($cached);
				$json['numChildren'] = $numChildren;
				$cached = json_encode($json);
			}
			
			//StatsD::timing("api.items.itemToResponseJSON.cached", (microtime(true) - $t) * 1000);
			//StatsD::increment("memcached.items.itemToResponseJSON.hit");
			
			// Skip the cache every 10 times for now, to ensure cache sanity
			if (!Z_Core::probability(10)) {
				return $cached;
			}
		}
		
		
		$json = [
			'key' => $this->key,
			'version' => $version,
			'library' => Zotero_Libraries::toJSON($this->libraryID)
		];
		
		$json['links'] = [
			'self' => [
				'href' => Zotero_API::getItemURI($this),
				'type' => 'application/json'
			],
			'alternate' => [
				'href' => Zotero_URI::getItemURI($this, true),
				'type' => 'text/html'
			]
		];
		
		if ($parent) {
			$parentItem = Zotero_Items::get($this->libraryID, $parent);
			$json['links']['up'] = [
				'href' => Zotero_API::getItemURI($parentItem),
				'type' => 'application/json'
			];
		}
		
		// If appropriate permissions and the file is stored in ZFS, get file request link
		if ($downloadDetails) {
			$details = $downloadDetails;
			$type = $this->attachmentMIMEType;
			if ($type) {
				$json['links']['enclosure'] = [
					'type' => $type
				];
			}
			$json['links']['enclosure']['href'] = $details['url'];
			if (!empty($details['filename'])) {
				$json['links']['enclosure']['title'] = $details['filename'];
			}
			if (isset($details['size'])) {
				$json['links']['enclosure']['length'] = $details['size'];
			}
		}
		
		// 'meta'
		$json['meta'] = new stdClass;
		
		if (Zotero_Libraries::getType($this->libraryID) == 'group') {
			$createdByUserID = $this->createdByUserID;
			$lastModifiedByUserID = $this->lastModifiedByUserID;
			
			if ($createdByUserID) {
				$json['meta']->createdByUser = Zotero_Users::toJSON($createdByUserID);
			}
			
			if ($lastModifiedByUserID && $lastModifiedByUserID != $createdByUserID) {
				$json['meta']->lastModifiedByUser = Zotero_Users::toJSON($lastModifiedByUserID);
			}
		}
		
		if ($isRegularItem) {
			$val = $this->getCreatorSummary();
			if ($val !== '') {
				$json['meta']->creatorSummary = $val;
			}
			
			$val = $this->getField('date', true, true, true);
			if ($val !== '') {
				$sqlDate = Zotero_Date::multipartToSQL($val);
				if (substr($sqlDate, 0, 4) !== '0000') {
					$json['meta']->parsedDate = Zotero_Date::sqlToISO8601($sqlDate);
				}
			}
			
			$json['meta']->numChildren = $numChildren;
		}
		
		// 'include'
		$include = $requestParams['include'];
		
		foreach ($include as $type) {
			if ($type == 'html') {
				$json[$type] = trim($this->toHTML());
			}
			else if ($type == 'citation') {
				if (isset($sharedData[$type][$this->libraryID . "/" . $this->key])) {
					$html = $sharedData[$type][$this->libraryID . "/" . $this->key];
				}
				else {
					if ($sharedData !== null) {
						//error_log("Citation not found in sharedData -- retrieving individually");
					}
					$html = Zotero_Cite::getCitationFromCiteServer($this, $requestParams);
				}
				$json[$type] = $html;
			}
			else if ($type == 'bib') {
				if (isset($sharedData[$type][$this->libraryID . "/" . $this->key])) {
					$html = $sharedData[$type][$this->libraryID . "/" . $this->key];
				}
				else {
					if ($sharedData !== null) {
						//error_log("Bibliography not found in sharedData -- retrieving individually");
					}
					$html = Zotero_Cite::getBibliographyFromCitationServer([$this], $requestParams);
					
					// Strip prolog
					$html = preg_replace('/^<\?xml.+\n/', "", $html);
					$html = trim($html);
				}
				$json[$type] = $html;
			}
			else if ($type == 'data') {
				$json[$type] = $this->toJSON(true, $requestParams, true);
			}
			else if ($type == 'csljson') {
				$json[$type] = $this->toCSLItem();
			}
			else if (in_array($type, Zotero_Translate::$exportFormats)) {
				$export = Zotero_Translate::doExport([$this], $type);
				$json[$type] = $export['body'];
				unset($export);
			}
		}
		

		// TEMP
		if ($cached) {
			$uncached = Zotero_Utilities::formatJSON($json);
			if ($cached != $uncached) {
				error_log("Cached JSON item entry does not match");
				error_log("  Cached: " . $cached);
				error_log("Uncached: " . $uncached);
				
				//Z_Core::$MC->set($cacheKey, $uncached, 3600); // 1 hour for now
			}
		}
		else {
			/*Z_Core::$MC->set($cacheKey, $xmlstr, 3600); // 1 hour for now
			StatsD::timing("api.items.itemToAtom.uncached", (microtime(true) - $t) * 1000);
			StatsD::increment("memcached.items.itemToAtom.miss");*/
		}
		
		return $json;
	}
	
	
	public function toJSON($asArray=false, $requestParams=array(), $includeEmpty=false, $unformattedFields=false) {
		if ($this->id || $this->key) {
			if (!$this->loaded['primaryData']) {
				$this->loadPrimaryData(true);
			}
			if (!$this->loaded['itemData']) {
				$this->loadItemData();
			}
		}
		
		if (!isset($requestParams['v'])) {
			$requestParams['v'] = 3;
		}
		
		$regularItem = $this->isRegularItem();
		
		$arr = array();
		if ($requestParams['v'] >= 2) {
			if ($requestParams['v'] >= 3) {
				$arr['key'] = $this->key;
				$arr['version'] = $this->version;
			}
			else {
				$arr['itemKey'] = $this->key;
				$arr['itemVersion'] = $this->version;
			}
			
			$key = $this->getSourceKey();
			if ($key) {
				$arr['parentItem'] = $key;
			}
		}
		$arr['itemType'] = Zotero_ItemTypes::getName($this->itemTypeID);
		
		if ($this->isAttachment()) {
			$val = $this->attachmentLinkMode;
			$arr['linkMode'] = strtolower(Zotero_Attachments::linkModeNumberToName($val));
		}
		
		// For regular items, show title and creators first
		if ($regularItem) {
			// Get 'title' or the equivalent base-mapped field
			$titleFieldID = Zotero_ItemFields::getFieldIDFromTypeAndBase($this->itemTypeID, 'title');
			$titleFieldName = Zotero_ItemFields::getName($titleFieldID);
			if ($includeEmpty || $this->itemData[$titleFieldID] !== false) {
				$arr[$titleFieldName] = $this->itemData[$titleFieldID] !== false ? $this->itemData[$titleFieldID] : "";
			}
			
			// Creators
			$arr['creators'] = array();
			$creators = $this->getCreators();
			foreach ($creators as $creator) {
				$c = array();
				$c['creatorType'] = Zotero_CreatorTypes::getName($creator['creatorTypeID']);
				
				// Single-field mode
				if ($creator['ref']->fieldMode == 1) {
					$c['name'] = $creator['ref']->lastName;
				}
				// Two-field mode
				else {
					$c['firstName'] = $creator['ref']->firstName;
					$c['lastName'] = $creator['ref']->lastName;
				}
				$arr['creators'][] = $c;
			}
			if (!$arr['creators'] && !$includeEmpty) {
				unset($arr['creators']);
			}
		}
		else {
			$titleFieldID = false;
		}
		
		// Item metadata
		$fields = array_keys($this->itemData);
		foreach ($fields as $field) {
			if ($field == $titleFieldID) {
				continue;
			}
			
			if ($unformattedFields) {
				$value = $this->itemData[$field];
			}
			else {
				$value = $this->getField($field);
			}
			
			if (!$includeEmpty && ($value === false || $value === "")) {
				continue;
			}
			
			$fieldName = Zotero_ItemFields::getName($field);
			// TEMP
			if ($fieldName == 'versionNumber') {
				if ($requestParams['v'] < 3) {
					$fieldName = 'version';
				}
			}
			else if ($fieldName == 'accessDate') {
				if ($requestParams['v'] >= 3 && $value !== false && $value !== "") {
					$value = Zotero_Date::sqlToISO8601($value);
				}
			}
			$arr[$fieldName] = ($value !== false && $value !== "") ? $value : "";
		}
		
		if ($requestParams['v'] >= 3) {
			$arr['dateAdded'] = Zotero_Date::sqlToISO8601($this->dateAdded);
			$arr['dateModified'] = Zotero_Date::sqlToISO8601($this->dateModified);
		}
		
		// Embedded note for notes and attachments
		if (!$regularItem) {
			// Use sanitized version
			$arr['note'] = $this->getNote(true);
		}
		
		if ($this->isAttachment()) {
			$val = $this->attachmentLinkMode;
			$arr['linkMode'] = strtolower(Zotero_Attachments::linkModeNumberToName($val));
			
			$val = $this->attachmentMIMEType;
			if ($includeEmpty || ($val !== false && $val !== "")) {
				$arr['contentType'] = $val;
			}
			
			$val = $this->attachmentCharset;
			if ($includeEmpty || ($val !== false && $val !== "")) {
				$arr['charset'] = $val;
			}
			
			if ($this->isImportedAttachment()) {
				$arr['filename'] = $this->attachmentFilename;
				
				$val = $this->attachmentStorageHash;
				if ($includeEmpty || $val) {
					$arr['md5'] = $val;
				}
				
				$val = $this->attachmentStorageModTime;
				if ($includeEmpty || $val) {
					$arr['mtime'] = $val;
				}
			}
		}
		
		if ($this->getDeleted()) {
			$arr['deleted'] = 1;
		}
		
		// Tags
		$arr['tags'] = array();
		$tags = $this->getTags();
		if ($tags) {
			foreach ($tags as $tag) {
				$t = array(
					'tag' => $tag->name
				);
				if ($tag->type != 0) {
					$t['type'] = $tag->type;
				}
				$arr['tags'][] = $t;
			}
		}
		
		if ($requestParams['v'] >= 2) {
			if ($this->isTopLevelItem()) {
				$collections = $this->getCollections(true);
				$arr['collections'] = $collections;
			}
			
			$arr['relations'] = $this->getRelations();
		}
		
		if ($asArray) {
			return $arr;
		}
		
		// Before v3, additional characters were escaped in the JSON, for unclear reasons
		$escapeAll = $requestParams['v'] <= 2;
		
		return Zotero_Utilities::formatJSON($arr, $escapeAll);
	}
	
	
	public function toCSLItem() {
		return Zotero_Cite::retrieveItem($this);
	}
	
	
	//
	//
	// Private methods
	//
	//
	private function loadItemData() {
		Z_Core::debug("Loading item data for item $this->id");
		
		// TODO: remove?
		if ($this->loaded['itemData']) {
			trigger_error("Item data for item $this->id already loaded", E_USER_ERROR);
		}
		
		if (!$this->id) {
			trigger_error('Item ID not set before attempting to load data', E_USER_ERROR);
		}
		
		if (!is_numeric($this->id)) {
			trigger_error("Invalid itemID '$this->id'", E_USER_ERROR);
		}
		
		if ($this->cacheEnabled) {
			$cacheVersion = 1;
			$cacheKey = $this->getCacheKey("itemData",
				$cacheVersion
					. isset(Z_CONFIG::$CACHE_VERSION_ITEM_DATA)
					? "_" . Z_CONFIG::$CACHE_VERSION_ITEM_DATA
					: ""
			);
			$fields = Z_Core::$MC->get($cacheKey);
		}
		else {
			$fields = false;
		}
		if ($fields === false) {
			$sql = "SELECT fieldID, value FROM itemData WHERE itemID=?";
			$stmt = Zotero_DB::getStatement($sql, true, Zotero_Shards::getByLibraryID($this->libraryID));
			$fields = Zotero_DB::queryFromStatement($stmt, $this->id);
			
			if ($this->cacheEnabled) {
				Z_Core::$MC->set($cacheKey, $fields ? $fields : array());
			}
		}
		
		$itemTypeFields = Zotero_ItemFields::getItemTypeFields($this->itemTypeID);
		
		if ($fields) {
			foreach ($fields as $field) {
				$this->setField($field['fieldID'], $field['value'], true, true);
			}
		}
		
		// Mark nonexistent fields as loaded
		if ($itemTypeFields) {
			foreach($itemTypeFields as $fieldID) {
				if (is_null($this->itemData[$fieldID])) {
					$this->itemData[$fieldID] = false;
				}
			}
		}
		
		$this->loaded['itemData'] = true;
	}
	
	
	private function getNoteHash() {
		if (!$this->isNote() && !$this->isAttachment()) {
			trigger_error("getNoteHash() can only be called on notes and attachments", E_USER_ERROR);
		}
		
		if (!$this->id) {
			return '';
		}
		
		// Store access time for later garbage collection
		//$this->noteAccessTime = new Date();
		
		return Zotero_Notes::getHash($this->libraryID, $this->id);
	}
	
	
	private function loadCreators() {
		if (!$this->id) {
			trigger_error('Item ID not set for item before attempting to load creators', E_USER_ERROR);
		}
		
		if (!is_numeric($this->id)) {
			trigger_error("Invalid itemID '$this->id'", E_USER_ERROR);
		}
		
		if ($this->cacheEnabled) {
			$cacheVersion = 1;
			$cacheKey = $this->getCacheKey("itemCreators", $cacheVersion);
			$creators = Z_Core::$MC->get($cacheKey);
		}
		else {
			$creators = false;
		}
		if ($creators === false) {
			$sql = "SELECT creatorID, creatorTypeID, orderIndex FROM itemCreators
					WHERE itemID=? ORDER BY orderIndex";
			$stmt = Zotero_DB::getStatement($sql, true, Zotero_Shards::getByLibraryID($this->libraryID));
			$creators = Zotero_DB::queryFromStatement($stmt, $this->id);
			
			if ($this->cacheEnabled) {
				Z_Core::$MC->set($cacheKey, $creators ? $creators : array());
			}
		}
		
		$this->creators = array();
		$this->loaded['creators'] = true;
		
		if (!$creators) {
			return;
		}
		
		foreach ($creators as $creator) {
			$creatorObj = Zotero_Creators::get($this->libraryID, $creator['creatorID'], true);
			if (!$creatorObj) {
				Z_Core::$MC->delete($cacheKey);
				throw new Exception("Creator {$creator['creatorID']} not found");
			}
			$this->creators[$creator['orderIndex']] = array(
				'creatorTypeID' => $creator['creatorTypeID'],
				'ref' => $creatorObj
			);
		}
	}
	
	
	private function loadCollections() {
		if (!$this->id) {
			return;
		}
		
		Z_Core::debug("Loading collections for item $this->id");
		
		if ($this->loaded['collections']) {
			throw new Exception("Collections already loaded for item $this->id");
		}
		
		$sql = "SELECT C.key FROM collectionItems "
			. "JOIN collections C USING (collectionID) "
			. "WHERE itemID=?";
		$this->collections = Zotero_DB::columnQuery(
			$sql, $this->id, Zotero_Shards::getByLibraryID($this->libraryID)
		);
		if (!$this->collections) {
			$this->collections = [];
		}
		$this->loaded['collections'] = true;
	}
	
	
	private function loadTags() {
		if (!$this->id) {
			return;
		}
		
		Z_Core::debug("Loading tags for item $this->id");
		
		if ($this->loaded['tags']) {
			throw new Exception("Tags already loaded for item $this->id");
		}
		
		$sql = "SELECT tagID FROM itemTags JOIN tags USING (tagID) WHERE itemID=?";
		$tagIDs = Zotero_DB::columnQuery(
			$sql, $this->id, Zotero_Shards::getByLibraryID($this->libraryID)
		);
		$this->tags = [];
		if ($tagIDs) {
			foreach ($tagIDs as $tagID) {
				$this->tags[] = Zotero_Tags::get($this->libraryID, $tagID, true);
			}
		}
		$this->loaded['tags'] = true;
	}
	
	
	/**
	 * @return {array<string>}  An array of related item keys
	 */
	private function getRelatedItems() {
		$predicate = Zotero_Relations::$relatedItemPredicate;
		
		$relations = $this->getRelations();
		if (empty($relations->$predicate)) {
			return [];
		}
		
		$relatedItemURIs = is_string($relations->$predicate)
			? [$relations->$predicate]
			: $relations->$predicate;
		
		// Pull out object values from related-item relations, turn into items, and pull out keys
		$keys = [];
		foreach ($relatedItemURIs as $relatedItemURI) {
			$item = Zotero_URI::getURIItem($relatedItemURI);
			if ($item) {
				$keys[] = $item->key;
			}
		}
		return $keys;
	}
	
	
	/**
	 * @param {array<string>} $itemKeys
	 * @return {Boolean}  TRUE if related items were changed, FALSE if not
	 */
	private function setRelatedItems($itemKeys) {
		if (!is_array($itemKeys))  {
			throw new Exception('$itemKeys must be an array');
		}
		
		$predicate = Zotero_Relations::$relatedItemPredicate;
		
		$relations = $this->getRelations();
		if (!isset($relations->$predicate)) {
			$relations->$predicate = [];
		}
		else if (is_string($relations->$predicate)) {
			$relations->$predicate = [$relations->$predicate];
		}
		
		$currentKeys = array_map(function ($objectURI) {
			$key = substr($objectURI, -8);
			return Zotero_ID::isValidKey($key) ? $key : false;
		}, $relations->$predicate);
		$currentKeys = array_filter($currentKeys);
		
		$oldKeys = []; // items being kept
		$newKeys = []; // new items
		
		if (!$itemKeys) {
			if (!$currentKeys) {
				Z_Core::debug("No related items added", 4);
				return false;
			}
		}
		else {
			foreach ($itemKeys as $itemKey) {
				if ($itemKey == $this->key) {
					Z_Core::debug("Can't relate item to itself in Zotero.Item.setRelatedItems()", 2);
					continue;
				}
				
				if (in_array($itemKey, $currentKeys)) {
					Z_Core::debug("Item {$this->key} is already related to item $itemKey");
					$oldKeys[] = $itemKey;
					continue;
				}
				
				// TODO: check if related on other side (like client)?
				
				$newKeys[] = $itemKey;
			}
		}
		
		// If new or changed keys, update relations with new related items
		if ($newKeys || sizeOf($oldKeys) != sizeOf($currentKeys)) {
			$prefix = Zotero_URI::getLibraryURI($this->libraryID) . "/items/";
			$relations->$predicate = array_map(function ($key) use ($prefix) {
				return $prefix . $key;
			}, array_merge($oldKeys, $newKeys));
			$this->setRelations($relations);
			return true;
		}
		else {
			Z_Core::debug('Related items not changed', 4);
			return false;
		}
	}
	
	
	private function loadRelations() {
		if (!$this->id) {
			return;
		}
		
		Z_Core::debug("Loading relations for item $this->id");
		
		if ($this->loaded['relations']) {
			throw new Exception("Relations for item $this->id already loaded");
		}
		
		if (!$this->loaded['primaryData']) {
			$this->loadPrimaryData(true);
		}
		
		$itemURI = Zotero_URI::getItemURI($this);
		
		$relations = Zotero_Relations::getByURIs($this->libraryID, $itemURI);
		$relations = array_map(function ($rel) {
			return [$rel->predicate, $rel->object];
		}, $relations);
		
		// Related items are bidirectional, so include any with this item as the object
		$reverseRelations = Zotero_Relations::getByURIs(
			$this->libraryID, false, Zotero_Relations::$relatedItemPredicate, $itemURI
		);
		foreach ($reverseRelations as $rel) {
			$r = [$rel->predicate, $rel->subject];
			// Only add if not already added in other direction
			if (!in_array($r, $relations)) {
				$relations[] = $r;
			}
		}
		
		// Also include any owl:sameAs relations with this item as the object
		// (as sent by client via classic sync)
		$reverseRelations = Zotero_Relations::getByURIs(
			$this->libraryID, false, Zotero_Relations::$linkedObjectPredicate, $itemURI
		);
		foreach ($reverseRelations as $rel) {
			$relations[] = [$rel->predicate, $rel->subject];
		}
		
		// TEMP: Get old-style related items
		//
		// Add related items
		$sql = "SELECT `key` FROM itemRelated IR "
			. "JOIN items I ON (IR.linkedItemID=I.itemID) "
			. "WHERE IR.itemID=?";
		$relatedItemKeys = Zotero_DB::columnQuery($sql, $this->id, Zotero_Shards::getByLibraryID($this->libraryID));
		if ($relatedItemKeys) {
			$prefix = Zotero_URI::getLibraryURI($this->libraryID) . "/items/";
			$predicate = Zotero_Relations::$relatedItemPredicate;
			foreach ($relatedItemKeys as $key) {
				$relations[] = [$predicate, $prefix . $key];
			}
		}
		// Reverse as well
		$sql = "SELECT `key` FROM itemRelated IR JOIN items I USING (itemID) WHERE IR.linkedItemID=?";
		$reverseRelatedItemKeys = Zotero_DB::columnQuery(
			$sql, $this->id, Zotero_Shards::getByLibraryID($this->libraryID)
		);
		if ($reverseRelatedItemKeys) {
			$prefix = Zotero_URI::getLibraryURI($this->libraryID) . "/items/";
			$predicate = Zotero_Relations::$relatedItemPredicate;
			foreach ($reverseRelatedItemKeys as $key) {
				$relations[] = [$predicate, $prefix . $key];
			}
		}
		
		$this->relations = $relations;
		$this->loaded['relations'] = true;
	}
	
	
	private function getETag() {
		if (!$this->loaded['primaryData']) {
			$this->loadPrimaryData();
		}
		return md5($this->serverDateModified . $this->version);
	}
	
	
	private function storePreviousData($field) {
		// Don't overwrite previous data already stored
		if (isset($this->previousData[$field])) {
			return;
		}
		$this->previousData[$field] = $this->$field;
	}
	
	
	private function getCacheKey($mode, $cacheVersion=false) {
		if (!$this->loaded['primaryData']) {
			$this->loadPrimaryData();
		}
		
		if (!$this->id) {
			return false;
		}
		if (!$mode) {
			throw new Exception('$mode not provided');
		}
		return $mode
			. "_". $this->id
			. "_" . $this->version
			. ($cacheVersion ? "_" . $cacheVersion : "");
	}
}
?>
