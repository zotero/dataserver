<?php
/*
    ***** BEGIN LICENSE BLOCK *****
    
    This file is part of the Zotero Data Server.
    
    Copyright © 2019 Corporation for Digital Scholarship
                     Vienna, Virginia, USA
                     http://digitalscholar.org
    
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

namespace Zotero;

class Schema {
	private static $schema;
	
	
	public static function init() {
		self::$schema = self::readFromFile();
	}
	
	
	public static function get() {
		if (!self::$schema) {
			self::init();
		}
		return self::$schema;
	}
	
	
	public static function getLocaleStrings($locale = 'en-US') {
		if (!self::$schema) {
			self::init();
		}
		if (!isset(self::$schema['locales'][$locale])) {
			if (!isset(self::$schema['locales']['en-US'])) {
				throw new \Exception("Locales not available");
			}
			Z_Core::logError("Locale $locale not found");
			return self::$schema['locales']['en-US'];
		}
		return self::$schema['locales'][$locale];
	}
	
	
	public static function resolveLocale($locale) {
		if (!self::$schema) {
			self::init();
		}
		// If the locale exists as-is, use that
		if (isset(self::$schema['locales'][$locale])) {
			return $locale;
		}
		// If there's a locale with just the language, use that
		$langCode = substr($locale, 0, 2);
		if (isset(self::$schema['locales'][$langCode])) {
			return $langCode;
		}
		// Find locales matching language
		$locales = array_keys(self::$schema['locales']);
		$locales = array_filter($locales, function ($x) use ($langCode) {
			return substr($x, 0, 2) == $langCode;
		});
		// If none, use en-US
		if (!$locales) {
			if (!isset(self::$schema['locales']['en-US'])) {
				throw new \Exception("Locales not available");
			}
			Z_Core::logError("Locale $locale not found");
			return 'en-US';
		}
		usort($locales, function ($a, $b) {
			if ($a == 'en-US') return -1;
			if ($b == 'en-US') return 1;
			
			if (substr($a, 0, 2) == strtolower(substr($a, 3, 2))) {
				return -1;
			}
			if (substr($b, 0, 2) == strtolower(substr($b, 3, 2))) {
				return 1;
			}
			return strcmp(substr($a, 3, 2), substr($b, 3, 2));
		});
		return $locales[0];
	}
	
	
	/**
	 * Update the item-type/field/creator mapping tables based on the passed schema
	 */
	public static function updateDatabase($data, $dryRun = false) {
		if (!$data) {
			throw new \Exception("Schema data not provided");
		}
		
		\Zotero_DB::beginTransaction();
		
		// Get schema version from DB
		$dbVersion = (int) \Zotero_DB::valueQuery(
			"SELECT value FROM settings WHERE name='schemaVersion'"
		);
		
		if ($dbVersion >= $data['version']) {
			\Zotero_DB::executeTransaction();
			\Z_Core::debug("DB schema is up to date ($dbVersion >= {$data['version']})");
			return false;
		}
		
		\Z_Core::debug("Updating schema to version " . $data['version']);
		
		$preItemTypeRows = \Zotero_DB::query(
			"SELECT itemTypeID AS id, itemTypeName AS name FROM itemTypes"
		);
		$preFieldRows = \Zotero_DB::query(
			"SELECT fieldID AS id, fieldName AS name FROM fields"
		);
		$preCreatorTypeRows = \Zotero_DB::query(
			"SELECT creatorTypeID AS id, creatorTypeName AS name FROM creatorTypes"
		);
		$preFields = new \Ds\Set(
			array_map(function ($x) { return $x['name']; }, $preFieldRows)
		);
		$preCreatorTypes = new \Ds\Set(
			array_map(function ($x) { return $x['name']; }, $preCreatorTypeRows)
		);
		$preItemTypeIDsByName = array_column($preItemTypeRows, 'id', 'name');
		$preFieldIDsByName = array_column($preFieldRows, 'id', 'name');
		$preCreatorTypeIDsByName = array_column($preCreatorTypeRows, 'id', 'name');
		$postFields = new \Ds\Set();
		$postCreatorTypes = new \Ds\Set();
		$postFieldIDsByName = [];
		$postCreatorTypeIDsByName = [];
		
		// Add new fields and creator types
		foreach ($data['itemTypes'] as ["fields" => $fields, "creatorTypes" => $creatorTypes]) {
			foreach ($fields as $o) {
				$postFields->add($o['field']);
				if (isset($o['baseField'])) {
					$postFields->add($o['baseField']);
				}
			}
			
			foreach ($creatorTypes as ["creatorType" => $creatorType]) {
				$postCreatorTypes->add($creatorType);
			}
		}
		
		$fieldsValueSets = [];
		$fieldsParams = [];
		foreach ($postFields as $field) {
			if ($preFields->contains($field)) {
				$postFieldIDsByName[$field] = $preFieldIDsByName[$field];
			}
			else {
				$id = \Zotero_ID::get('fields');
				$fieldsValueSets[] = "(?, ?, NULL, 0)";
				array_push($fieldsParams, $id, $field);
				$postFieldIDsByName[$field] = $id;
			}
		}
		if ($fieldsValueSets) {
			\Zotero_DB::query(
				"INSERT INTO fields VALUES " . implode(", ", $fieldsValueSets),
				$fieldsParams
			);
		}
		
		$creatorTypesValueSets = [];
		$creatorTypesParams = [];
		foreach ($postCreatorTypes as $type) {
			if ($preCreatorTypes->contains($type)) {
				$postCreatorTypeIDsByName[$type] = $preCreatorTypeIDsByName[$type];
			}
			else {
				$id = \Zotero_ID::get('creatorTypes');
				$creatorTypesValueSets[] = "(?, ?, 0)";
				array_push($creatorTypesParams, $id, $type);
				$postCreatorTypeIDsByName[$type] = $id;
			}
		}
		if ($creatorTypesValueSets) {
			\Zotero_DB::query(
				"INSERT INTO creatorTypes VALUES " . implode(", ", $creatorTypesValueSets),
				$creatorTypesParams
			);
		}
		
		// Apply changes to DB
		$itemTypeFieldsValueSets = [];
		$baseFieldMappingsValueSets = [];
		$itemTypeCreatorTypesValueSets = [];
		foreach ($data['itemTypes'] as ["itemType" => $itemType, "fields" => $fields, "creatorTypes" => $creatorTypes]) {
			$itemTypeID = $preItemTypeIDsByName[$itemType] ?? null;
			// let preItemTypeCreatorTypeIDs = [];
			if ($itemTypeID) {
				// Unused
				//preItemTypeCreatorTypeIDs = await Zotero.DB.columnQueryAsync(
				//	"SELECT creatorTypeID FROM itemTypeCreatorTypes WHERE itemTypeID=?",
				//	itemTypeID
				//);
			}
			// New item type
			else {
				$itemTypeID = \Zotero_ID::get('itemTypes');
				\Zotero_DB::query(
					"INSERT INTO itemTypes VALUES (?, ?, 0)",
					[$itemTypeID, $itemType]
				);
			}
			
			// Fields
			$index = 0;
			$postItemTypeFieldIDs = new \Ds\Set();
			foreach ($fields as $o) {
				$field = $o['field'];
				$baseField = $o['baseField'] ?? null;
				
				$fieldID = $postFieldIDsByName[$field];
				$postItemTypeFieldIDs->add($fieldID);
				array_push($itemTypeFieldsValueSets, "($itemTypeID, $fieldID, 0, " . $index++ . ")");
				if ($baseField) {
					$baseFieldID = $postFieldIDsByName[$baseField];
					array_push($baseFieldMappingsValueSets, "($itemTypeID, $baseFieldID, $fieldID)");
				}
			}
			
			
			// TODO: Check for fields removed from this item type
			// throw new Error(`Field ${id} was removed from ${itemType}`);
			
			// Creator types
			foreach ($creatorTypes as $o) {
				$creatorType = $o['creatorType'];
				$primary = isset($o['primary']) ? 1 : 0;
				$typeID = $postCreatorTypeIDsByName[$creatorType];
				array_push($itemTypeCreatorTypesValueSets, "($itemTypeID, $typeID, $primary)");
			}
			
			// TODO: Check for creator types removed from this item type
			// throw new Error(`Creator type ${id} was removed from ${itemType}`);
			
			// TODO: Deal with existing types not in the schema, and their items
		}
		
		\Zotero_DB::query("DELETE FROM itemTypeFields WHERE itemTypeID < 10000");
		\Zotero_DB::query("DELETE FROM baseFieldMappings WHERE itemTypeID < 10000");
		\Zotero_DB::query("DELETE FROM itemTypeCreatorTypes");
		
		\Zotero_DB::query("INSERT INTO itemTypeFields VALUES "
			. implode(", ", $itemTypeFieldsValueSets));
		\Zotero_DB::query("INSERT INTO baseFieldMappings VALUES "
			. implode(", ", $baseFieldMappingsValueSets));
		\Zotero_DB::query("INSERT INTO itemTypeCreatorTypes VALUES "
			. implode(", ", $itemTypeCreatorTypesValueSets));
		
		\Zotero_DB::query("REPLACE INTO settings VALUES ('schemaVersion', ?)", $data['version']);
		
		if ($dryRun) {
			echo "Not committing\n";
			exit;
		}
		
		\Zotero_DB::commit();
		
		return true;
	}
	
	
	private static function readFromFile() {
		$schema = file_get_contents(Z_ENV_BASE_PATH . 'htdocs/zotero-schema/schema.json');
		$schema = json_decode($schema, true);
		return $schema;
	}
}