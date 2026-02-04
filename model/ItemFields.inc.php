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

declare(strict_types=1);

class Zotero_ItemFields {
	private static $customFieldCheck = array();
	
	// Caches
	private static $fieldIDCache = array();
	private static $fieldNameCache = array();
	private static $cachedSchemaVersions = [];
	private static $itemTypeFieldsCache = [];
	private static $itemTypeBaseFieldIDCache = [];
	private static $isValidForTypeCache = [];
	private static $isBaseFieldCache;
	private static $typeFieldIDsByBaseCache = array();
	private static $typeFieldNamesByBaseCache = array();
	
	
	public static function getID($fieldOrFieldID) {
		// TODO: batch load
		
		if (isset(self::$fieldIDCache[$fieldOrFieldID])) {
			return self::$fieldIDCache[$fieldOrFieldID];
		}
		
		$cacheKey = "itemFieldID_{$fieldOrFieldID}_" . \Zotero\Schema::getVersion();
		$fieldID = Z_Core::$MC->get($cacheKey);
		if ($fieldID) {
			// casts are temporary until memcached reload
			self::$fieldIDCache[$fieldOrFieldID] = (int) $fieldID;
			return (int) $fieldID;
		}
		
		$sql = "(SELECT fieldID FROM fields WHERE fieldID=?) UNION
				(SELECT fieldID FROM fields WHERE fieldName=?) LIMIT 1";
		$fieldID = Zotero_DB::valueQuery($sql, array($fieldOrFieldID, $fieldOrFieldID));
		
		self::$fieldIDCache[$fieldOrFieldID] = $fieldID ? (int) $fieldID : false;
		Z_Core::$MC->set($cacheKey, (int) $fieldID);
		
		return $fieldID ? (int) $fieldID : false;
	}
	
	
	public static function getName($fieldOrFieldID) {
		if (isset(self::$fieldNameCache[$fieldOrFieldID])) {
			return self::$fieldNameCache[$fieldOrFieldID];
		}
		
		$cacheKey = "itemFieldName_{$fieldOrFieldID}_" . \Zotero\Schema::getVersion();
		$fieldName = Z_Core::$MC->get($cacheKey);
		if ($fieldName) {
			self::$fieldNameCache[$fieldOrFieldID] = $fieldName;
			return $fieldName;
		}
		
		$sql = "(SELECT fieldName FROM fields WHERE fieldID=?) UNION
				(SELECT fieldName FROM fields WHERE fieldName=?) LIMIT 1";
		$fieldName = Zotero_DB::valueQuery($sql, array($fieldOrFieldID, $fieldOrFieldID));
		
		self::$fieldNameCache[$fieldOrFieldID] = $fieldName;
		Z_Core::$MC->set($cacheKey, $fieldName);
		
		return $fieldName;
	}
	
	
	public static function getLocalizedString($field, $locale='en-US') {
		// Fields in the items table are special cases
		switch ($field) {
			case 'dateAdded':
			case 'dateModified':
			case 'itemType':
				$fieldName = $field;
				break;
			
			default:
				// unused currently
				//var typeName = Zotero.ItemTypes.getName(itemType);
				$fieldName = self::getName($field);
		}
		
		$strings = \Zotero\Schema::getLocaleStrings($locale)['fields'];
		if (!isset($strings[$fieldName])) {
			Z_Core::logError("Localized string not found for field '$fieldName' in $locale");
			return $fieldName;
		}
		return $strings[$fieldName];
	}
	
	
	public static function getAll($locale=false) {
		$sql = "SELECT DISTINCT fieldID AS id, fieldName AS name
				FROM fields JOIN itemTypeFields USING (fieldID)";
		// TEMP - skip nsfReviewer fields
		$sql .= " WHERE fieldID < 10000";
		$rows = Zotero_DB::query($sql);
		
		// TODO: cache
		
		if (!$locale) {
			return $rows;
		}
		
		foreach ($rows as &$row) {
			$row['localized'] =  self::getLocalizedString($row['id'], $locale);
		}
		
		usort($rows, function ($a, $b) {
			return strcmp($a["localized"], $b["localized"]);
		});
		
		return $rows;
	}
	
	
	/**
	 * Validates field content
	 *
	 * @param	string		$field		Field name
	 * @param	mixed		$value
	 * @return	bool
	 */
	public static function validate($field, $value) {
		if (empty($field)) {
			throw new Exception("Field not provided");
		}
		
		switch ($field) {
			case 'itemTypeID':
				return is_integer($value);
		}
		
		return true;
	}
	
	
	public static function isValidForType(int $fieldID, int $itemTypeID, ?int $schemaVersion = null): bool {
		$currentSchemaVersion = \Zotero\Schema::getVersion();
		if (!$schemaVersion || $schemaVersion > $currentSchemaVersion) {
			$schemaVersion = $currentSchemaVersion;
		}
		
		if (isset(self::$cachedSchemaVersions[$schemaVersion])) {
			return self::isValidForTypeCached($fieldID, $itemTypeID, $schemaVersion);
		}
		
		// Check memcached
		$cacheKey = "itemTypeFieldIDs_{$schemaVersion}_{$itemTypeID}";
		$itemTypeFieldIDs = Z_Core::$MC->get($cacheKey);
		if ($itemTypeFieldIDs !== false) {
			self::cacheItemTypeFields($schemaVersion, $itemTypeFieldIDs);
			return self::isValidForTypeCached($fieldID, $itemTypeID, $schemaVersion);
		}
		
		self::cacheSchemaVersion($schemaVersion);
		
		$valid = self::isValidForTypeCached($fieldID, $itemTypeID, $schemaVersion);
		
		// Store in local cache if missing
		if (!$valid) {
			self::$isValidForTypeCache[$schemaVersion][$itemTypeID][$fieldID] = false;
		}
		return $valid;
	}
	
	
	private static function isValidForTypeCached(int $fieldID, int $itemTypeID, int $schemaVersion) {
		if (isset(self::$isValidForTypeCache[$schemaVersion][$itemTypeID][$fieldID])) {
			return self::$isValidForTypeCache[$schemaVersion][$itemTypeID][$fieldID];
		}
		if (!self::getID($fieldID)) {
			throw new Exception("Invalid fieldID '$fieldID'");
		}
		if (!Zotero_ItemTypes::getID($itemTypeID)) {
			throw new Exception("Invalid item type id '$itemTypeID'");
		}
		return false;
	}
	
	
	private static function cacheSchemaVersion(int $schemaVersion): void {
		if (isset(self::$cachedSchemaVersions[$schemaVersion])) {
			throw new \Exception("Schema $schemaVersion is already cached");
		}
		self::$cachedSchemaVersions[$schemaVersion] = true;
		$schema = \Zotero\Schema::getByVersion($schemaVersion);
		
		$baseFieldIDs = new \Ds\Set();
		foreach ($schema['itemTypes'] as $t) {
			$itemType = $t['itemType'];
			$itemTypeID = Zotero_ItemTypes::getID($itemType);
			$itemTypeFieldIDs = [];
			foreach ($t['fields'] as $f) {
				$fieldID = Zotero_ItemFields::getID($f['field']);
				if (!$fieldID) {
					throw new Exception("Field '{$f['field']}' from schema $schemaVersion not found");
				}
				$itemTypeFieldIDs[] = $fieldID;
				
				if (isset($f['baseField'])) {
					$baseFieldID = Zotero_ItemFields::getID($f['baseField']);
					if (!$baseFieldID) {
						throw new Exception("Base field '{$f['baseField']}' from schema $schemaVersion not found");
					}
					$baseFieldIDs->add($baseFieldID);
				}
			}
			self::cacheItemTypeFields($schemaVersion, $itemTypeID, $itemTypeFieldIDs);
		}
		self::$isBaseFieldCache = $baseFieldIDs;
	}
	
	
	private static function cacheItemTypeFields(int $schemaVersion, int $itemTypeID, array $itemTypeFieldIDs) {
		self::$itemTypeFieldsCache[$itemTypeID] = $itemTypeFieldIDs;
		self::$isValidForTypeCache[$schemaVersion][$itemTypeID] = [];
		foreach ($itemTypeFieldIDs as $fieldID) {
			self::$isValidForTypeCache[$schemaVersion][$itemTypeID][$fieldID] = true;
		}
	}
	
	
	public static function isDate($field) {
		$fieldID = self::getID($field);
		$fieldName = self::getName($field);
		if (self::isFieldOfBase($fieldID, 'date')) {
			return true;
		}
		$schema = \Zotero\Schema::getCurrent();
		if (isset($schema['fields'][$fieldName])) {
			return $schema['fields'][$fieldName]['type'] == 'date';
		}
		return false;
	}
	
	
	public static function getItemTypeFields($itemTypeID) {
		if (isset(self::$itemTypeFieldsCache[$itemTypeID])) {
			return self::$itemTypeFieldsCache[$itemTypeID];
		}
		
		$cacheKey = "itemTypeFields_{$itemTypeID}_" . \Zotero\Schema::getVersion();
		$fields = Z_Core::$MC->get($cacheKey);
		if ($fields !== false) {
			self::$itemTypeFieldsCache[$itemTypeID] = $fields;
			return $fields;
		}
		
		if (!Zotero_ItemTypes::getID($itemTypeID)) {
			throw new Exception("Invalid item type id '$itemTypeID'");
		}
		
		$sql = 'SELECT fieldID FROM itemTypeFields WHERE itemTypeID=? ORDER BY orderIndex';
		$fields = Zotero_DB::columnQuery($sql, $itemTypeID);
		if (!$fields) {
			$fields = array();
		}
		
		self::$itemTypeFieldsCache[$itemTypeID] = $fields;
		Z_Core::$MC->set($cacheKey, $fields);
		
		return $fields;
	}
	
	
	public static function isBaseField($field) {
		$fieldID = self::getID($field);
		if (!$fieldID) {
			throw new Exception("Invalid field '$field'");
		}
		
		if (self::$isBaseFieldCache) {
			return self::$isBaseFieldCache->contains($fieldID);
		}
		
		$schemaVersion = \Zotero\Schema::getVersion();
		self::cacheSchemaVersion($schemaVersion);
		
		// TODO: Convert Set to array and store in memcached, and retrieve above?
		
		return self::$isBaseFieldCache->contains($fieldID);
	}
	
	
	public static function isFieldOfBase($field, $baseField) {
		$fieldID = self::getID($field);
		if (!$fieldID) {
			throw new Exception("Invalid field '$field'");
		}
		
		$baseFieldID = self::getID($baseField);
		if (!$baseFieldID) {
			throw new Exception("Invalid field '$baseField' for base field");
		}
		
		if ($fieldID == $baseFieldID) {
			return true;
		}
		
		$typeFields = self::getTypeFieldsFromBase($baseFieldID);
		return in_array($fieldID, $typeFields);
	}
	
	
	public static function getBaseMappedFields() {
		$sql = "SELECT DISTINCT fieldID FROM baseFieldMappings";
		return Zotero_DB::columnQuery($sql);
	}
	
	
	/*
	 * Returns the fieldID of a type-specific field for a given base field
	 * 		or false if none
	 *
	 * Examples:
	 *
	 * 'audioRecording' and 'publisher' returns label's fieldID
	 * 'book' and 'publisher' returns publisher's fieldID
	 * 'audioRecording' and 'number' returns false
	 *
	 * Accepts names or ids
	 */
	public static function getFieldIDFromTypeAndBase($itemType, $baseField) {
		$itemTypeID = Zotero_ItemTypes::getID($itemType);
		$baseFieldID = self::getID($baseField);
		
		// Check local cache
		if (isset(self::$itemTypeBaseFieldIDCache[$itemTypeID][$baseFieldID])) {
			return self::$itemTypeBaseFieldIDCache[$itemTypeID][$baseFieldID];
		}
		
		// Check memcached
		$cacheKey = "itemTypeBaseFieldID_{$itemTypeID}_{$baseFieldID}_" . \Zotero\Schema::getVersion();
		$fieldID = Z_Core::$MC->get($cacheKey);
		if ($fieldID !== false) {
			if (!isset(self::$itemTypeBaseFieldIDCache[$itemTypeID])) {
				self::$itemTypeBaseFieldIDCache[$itemTypeID] = array();
			}
			// FALSE is stored as 0
			if ($fieldID == 0) {
				$fieldID = false;
			}
			self::$itemTypeBaseFieldIDCache[$itemTypeID][$baseFieldID] = $fieldID;
			return $fieldID;
		}
		
		if (!$itemTypeID) {
			throw new Exception("Invalid item type '$itemType'");
		}
		
		if (!$baseFieldID) {
			throw new Exception("Invalid field '$baseField' for base field");
		}
		
		$sql = "SELECT fieldID FROM baseFieldMappings
					WHERE itemTypeID=? AND baseFieldID=?
				UNION
				SELECT baseFieldID FROM baseFieldMappings
					WHERE itemTypeID=? AND baseFieldID=?";
		$fieldID =  Zotero_DB::valueQuery(
			$sql,
			array($itemTypeID, $baseFieldID, $itemTypeID, $baseFieldID)
		);
		
		if (!$fieldID) {
			if (self::isBaseField($baseFieldID) && self::isValidForType($baseFieldID, $itemTypeID)) {
				$fieldID = $baseFieldID;
			}
		}
		
		// Store in local cache
		if (!isset(self::$itemTypeBaseFieldIDCache[$itemTypeID])) {
			self::$itemTypeBaseFieldIDCache[$itemTypeID] = array();
		}
		self::$itemTypeBaseFieldIDCache[$itemTypeID][$baseFieldID] = $fieldID;
		// Store in memcached (and store FALSE as 0)
		Z_Core::$MC->set($cacheKey, $fieldID ? $fieldID : 0);
		
		return $fieldID;
	}
	
	
	/*
	 * Returns the fieldID of the base field for a given type-specific field
	 * 		or false if none
	 *
	 * Examples:
	 *
	 * 'audioRecording' and 'label' returns publisher's fieldID
	 * 'book' and 'publisher' returns publisher's fieldID
	 * 'audioRecording' and 'runningTime' returns false
	 *
	 * Accepts names or ids
	 */
	public static function getBaseIDFromTypeAndField($itemType, $typeField) {
		$itemTypeID = Zotero_ItemTypes::getID($itemType);
		if (!$itemTypeID) {
			throw new Exception("Invalid item type '$itemType'");
		}
		
		$typeFieldID = self::getID($typeField);
		if (!$typeFieldID) {
			throw new Exception("Invalid field '$typeField'");
		}
		
		if (!self::isValidForType($typeFieldID, $itemTypeID)) {
			throw new Exception("'$typeField' is not a valid field for item type '$itemType'");
		}
		
		// If typeField is already a base field, just return that
		if (self::isBaseField($typeFieldID)) {
			return $typeFieldID;
		}
		
		return Zotero_DB::valueQuery("SELECT baseFieldID FROM baseFieldMappings
			WHERE itemTypeID=? AND fieldID=?", array($itemTypeID, $typeFieldID));
	}
	
	
	/*
	 * Returns an array of fieldIDs associated with a given base field
	 *
	 * e.g. 'publisher' returns fieldIDs for [university, studio, label, network]
	 */
	public static function getTypeFieldsFromBase($baseField, $asNames=false) {
		$baseFieldID = self::getID($baseField);
		if (!$baseFieldID) {
			throw new Exception("Invalid base field '$baseField'");
		}
		
		if ($asNames) {
			if (isset(self::$typeFieldNamesByBaseCache[$baseFieldID])) {
				return self::$typeFieldNamesByBaseCache[$baseFieldID];
			}
			
			$cacheKey = "itemTypeFieldNamesByBase_{$baseFieldID}_" . \Zotero\Schema::getVersion();
			$fieldNames = Z_Core::$MC->get($cacheKey);
			if ($fieldNames) {
				self::$typeFieldNamesByBaseCache[$baseFieldID] = $fieldNames;
				return $fieldNames;
			}
			
			$sql = "SELECT fieldName FROM fields WHERE fieldID IN (
				SELECT fieldID FROM baseFieldMappings
				WHERE baseFieldID=?)";
			$fieldNames = Zotero_DB::columnQuery($sql, $baseFieldID);
			if (!$fieldNames) {
				$fieldNames = array();
			}
			
			self::$typeFieldNamesByBaseCache[$baseFieldID] = $fieldNames;
			Z_Core::$MC->set($cacheKey, $fieldNames);
			
			return $fieldNames;
		}
		
		if (isset(self::$typeFieldIDsByBaseCache[$baseFieldID])) {
			return self::$typeFieldIDsByBaseCache[$baseFieldID];
		}
		
		$cacheKey = "itemTypeFieldIDsByBase_{$baseFieldID}_" . \Zotero\Schema::getVersion();
		$fieldIDs = Z_Core::$MC->get($cacheKey);
		if ($fieldIDs) {
			self::$typeFieldIDsByBaseCache[$baseFieldID] = $fieldIDs;
			return $fieldIDs;
		}
		
		$sql = "SELECT DISTINCT fieldID FROM baseFieldMappings WHERE baseFieldID=?";
		$fieldIDs = Zotero_DB::columnQuery($sql, $baseFieldID);
		if (!$fieldIDs) {
			$fieldIDs = array();
		}
		
		self::$typeFieldIDsByBaseCache[$baseFieldID] = $fieldIDs;
		Z_Core::$MC->set($cacheKey, $fieldIDs);
		
		return $fieldIDs;
	}
	
	
	public static function isCustomField($fieldID) {
		if (isset(self::$customFieldCheck)) {
			return self::$customFieldCheck;
		}
		
		$sql = "SELECT custom FROM fields WHERE fieldID=?";
		$isCustom = Zotero_DB::valueQuery($sql, $fieldID);
		if ($isCustom === false) {
			throw new Exception("Invalid fieldID '$fieldID'");
		}
		
		self::$customFieldCheck[$fieldID] = !!$isCustom;
		
		return !!$isCustom;
	}
	
	
	public static function addCustomField($name) {
		if (self::getID($name)) {
			trigger_error("Field '$name' already exists", E_USER_ERROR);
		}
		
		if (!preg_match('/^[a-z][^\s0-9]+$/', $name)) {
			trigger_error("Invalid field name '$name'", E_USER_ERROR);
		}
		
		// TODO: make sure user hasn't added too many already
		
		trigger_error("Unimplemented", E_USER_ERROR);
		// TODO: add to cache
		
		Zotero_DB::beginTransaction();
		
		$sql = "SELECT NEXT_ID(fieldID) FROM fields";
		$fieldID = Zotero_DB::valueQuery($sql);
		
		$sql = "INSERT INTO fields (?, ?, ?)";
		Zotero_DB::query($sql, array($fieldID, $name, 1));
		
		Zotero_DB::commit();
		
		return $fieldID;
	}
}
?>
