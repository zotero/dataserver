<?php
/*
    ***** BEGIN LICENSE BLOCK *****
    
    This file is part of the Zotero Data Server.
    
    Copyright © 2015 Center for History and New Media
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

namespace Zotero;

abstract class DataObjectUtilities {
	public static $allowedKeyChars = "23456789ABCDEFGHIJKLMNPQRSTUVWXYZ";
	private static $legacySchema = null;
	
	public static function getTypeFromObject($object) {
		if (!preg_match("/(Item|Collection|Search|Setting)$/", get_class($object), $matches)) {
			throw new Exception("Invalid object type");
		}
		return strtolower($matches[0]);
	}
	
	
	public static function getObjectTypePlural($objectType) {
		if ($objectType == 'search') {
			return $objectType . "es";
		}
		return $objectType . "s";
	}
	
	
	public static function checkID($dataID) {
		if (!is_int($dataID) || $dataID <= 0) {
			throw new Exception("id must be a positive integer");
		}
		return $dataID;
	}
	
	
	public static function checkKey($key) {
		if (!$key) return null;
		if (!self::isValidKey($key)) throw new Exception("key is not valid");
		return $key;
	}
	
	public static function isValidKey($key) {
		return !!preg_match('/^[' . self::$allowedKeyChars . ']{8}$/', $key);
	}
	
	public static function isLegacySchema($objectType, $json) {
		// TEMP
		try { \Z_Core::$debug = true;
		
		if (!self::$legacySchema) {
			self::$legacySchema = json_decode(
				file_get_contents(Z_ENV_BASE_PATH . 'misc/legacy-schema.json'),
				true
			);
		}
		if ($objectType == 'collection') {
			foreach ($json as $key => $val) {
				switch ($key) {
					case 'key':
					case 'version':
					case 'name':
					case 'parentCollection':
					case 'relations':
						break;
					
					default:
						\Z_Core::debug("'$key' is not a valid collection property in the classic schema");
						return false;
				}
			}
			return true;
		}
		
		if ($objectType == 'search') {
			foreach ($json as $key => $val) {
				switch ($key) {
					case 'key':
					case 'version':
					case 'name':
					case 'conditions':
						break;
					
					default:
						\Z_Core::debug("'$key' is not a valid search property in the classic schema");
						return false;
				}
			}
			return true;
		}
		
		if ($objectType == 'item') {
			if (empty($json['itemType'])) {
				throw new \Exception("No 'itemType' property in JSON");
			}
			$itemType = $json['itemType'];
			$data = null;
			foreach (self::$legacySchema['itemTypes'] as $itemTypeData) {
				if ($itemTypeData['itemType'] == $itemType) {
					$data = $itemTypeData;
					break;
				}
			}
			// If item type not found, it's not the legacy schema
			if (!$data) {
				return false;
			}
			$fields = new \Ds\Set(
				array_map(function ($x) { return $x['field']; }, $data['fields'])
			);
			$creatorTypes = new \Ds\Set(
				array_map(function ($x) { return $x['creatorType']; }, $data['creatorTypes'])
			);
			
			foreach ($json as $key => $val) {
				switch ($key) {
					case 'key':
					case 'version':
					case 'itemType':
					case 'parentItem':
					case 'deleted':
					case 'inPublications':
					case 'collections':
					case 'relations':
					case 'tags':
					case 'dateAdded':
					case 'dateModified':
					
					// Attachment
					case 'linkMode':
					case 'contentType':
					case 'charset':
					case 'filename':
					case 'md5':
					case 'mtime':
					case 'path':
					
					// Note
					case 'note':
						break;
						
					case 'creators':
						foreach ($val as $creator) {
							if (!isset($creator['creatorType'])) {
								throw new \Exception("No 'creatorType' property in JSON creator");
							}
							if (!$creatorTypes->contains($creator['creatorType'])) {
								\Z_Core::debug("'${$creator['creatorType']}' is not a valid creator "
									. "type for item type '$itemType' in the classic schema");
								return false;
							}
						}
						break;
					
					default:
						if (!$fields->contains($key)) {
							\Z_Core::debug("'$key' is not a valid field for item type '$itemType' in the classic schema");
							return false;
						}
					}
			}
			
			return true;
		}
		
		throw new \Exception("Unimplemented");
		
		// TEMP
		} finally { \Z_Core::$debug = false; }
	}
}
