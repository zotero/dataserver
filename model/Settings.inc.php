<?php
/*
    ***** BEGIN LICENSE BLOCK *****
    
    This file is part of the Zotero Data Server.
    
    Copyright © 2013 Center for History and New Media
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

class Zotero_Settings extends Zotero_ClassicDataObjects {
	public static $MAX_VALUE_LENGTH = 30000;
	
	public static $allowedSettings = [
		'attachmentRenameTemplate',
		'autoRenameFiles',
		'autoRenameFilesFileTypes',
		'feeds',
		'tagColors',
		'/^lastPageIndex_(u|g[0-9]+)_[A-Z0-9]{8}$/',
		'/^lastRead_(g[0-9]+)_[A-Z0-9]{8}$/',
		'readerCustomThemes'
	];
	
	protected static $ZDO_object = 'setting';
	protected static $ZDO_key = 'name';
	protected static $ZDO_id = 'name';
	protected static $ZDO_timestamp = 'lastUpdated';
	
	protected static $primaryFields = array(
		'libraryID' => '',
		'name' => '',
		'value' => '',
		'version' => ''
	);
	
	public static function search($libraryID, $params) {
		// Default empty library
		if ($libraryID === 0) {
			return [];
		}
		
		$sql = "SELECT name FROM settings WHERE libraryID=?";
		$sqlParams = [$libraryID];
		
		if (!empty($params['since'])) {
			$sql .= " AND version > ? ";
			$sqlParams[] = $params['since'];
		}
		
		// TEMP: for sync transition
		if (!empty($params['sincetime'])) {
			$sql .= " AND lastUpdated >= FROM_UNIXTIME(?) ";
			$sqlParams[] = $params['sincetime'];
		}
		
		$names = Zotero_DB::columnQuery($sql, $sqlParams, Zotero_Shards::getByLibraryID($libraryID));
		if (!$names) {
			$names = array();
		}
		
		$settings = array();
		foreach ($names as $name) {
			$setting = new Zotero_Setting;
			$setting->libraryID = $libraryID;
			$setting->name = $name;
			$settings[] = $setting;
		}
		return $settings;
	}
	
	
	/**
	 * @param Zotero_Setting $setting The setting object to update;
	 *                                this should be either an existing
	 *                                setting or a new setting
	 *                                with a library and name assigned.
	 * @param object $json Setting data to write
	 * @param boolean [$requireVersion=0] See Zotero_API::checkJSONObjectVersion()
	 * @return boolean True if the setting was changed, false otherwise
	 */
	public static function updateFromJSON(Zotero_Setting $setting,
	                                      $json,
	                                      $requestParams,
	                                      $userID,
	                                      $requireVersion=0) {
		self::validateJSONObject($setting->name, $json, $requestParams);
		Zotero_API::checkJSONObjectVersion(
			$setting, $json, $requestParams, $requireVersion
		);
		
		$changed = false;
		
		if (!Zotero_DB::transactionInProgress()) {
			Zotero_DB::beginTransaction();
			$transactionStarted = true;
		}
		else {
			$transactionStarted = false;
		}
		
		$setting->value = $json->value;
		$changed = $setting->save() || $changed;
		
		if ($transactionStarted) {
			Zotero_DB::commit();
		}
		
		return $changed;
	}
	
	
	private static function validateJSONObject($name, $json, $requestParams) {
		if (!is_object($json)) {
			throw new Exception('$json must be a decoded JSON object');
		}
		
		$requiredProps = array('value');
		
		self::checkSettingName($name);
		
		foreach ($requiredProps as $prop) {
			if (!isset($json->$prop)) {
				throw new Exception("'$prop' property not provided", Z_ERROR_INVALID_INPUT);
			}
		}
		
		foreach ($json as $key=>$val) {
			switch ($key) {
				// Handled by Zotero_API::checkJSONObjectVersion()
				case 'version':
					break;
				
				case 'value':
					self::checkSettingValue($name, $val);
					break;
					
				default:
					throw new Exception("Invalid property '$key'", Z_ERROR_INVALID_INPUT);
			}
		}
	}
	
	
	public static function updateMultipleFromJSON($json, $requestParams, $libraryID, $userID, $requireVersion, $parent=null) {
		self::validateMultiObjectJSON($json, $requestParams);
		
		Zotero_DB::beginTransaction();
		
		$changed = false;
		foreach ($json as $name => $jsonObject) {
			if (!is_object($jsonObject)) {
				throw new Exception(
					"Invalid property '$name'; expected JSON setting object",
					Z_ERROR_INVALID_INPUT
				);
			}
			
			$obj = new Zotero_Setting;
			$obj->libraryID = $libraryID;
			$obj->name = $name;
			$changed = static::updateFromJSON(
				$obj, $jsonObject, $requestParams, $requireVersion
			) || $changed;
		}
		
		Zotero_DB::commit();
		
		return $changed;
	}
	
	
	public static function checkSettingName($name) {
		if (in_array($name, self::$allowedSettings)) {
			return;
		}
		
		foreach (self::$allowedSettings as $setting) {
			// Check for any allowed settings that are specified by regexp
			if ($setting[0] == '/' && $setting[-1] == '/') {
				if (preg_match($setting, $name)) {
					return;
				}
			}
		}
		
		throw new Exception("Invalid setting '$name'", Z_ERROR_INVALID_INPUT);
	}
	
	
	public static function checkSettingValue($setting, $value) {
		if (mb_strlen(is_string($value) ? $value : json_encode($value)) > self::$MAX_VALUE_LENGTH) {
			throw new Exception("'value' cannot be longer than "
				. self::$MAX_VALUE_LENGTH . " characters", Z_ERROR_INVALID_INPUT);
		}
		
		preg_match('/^([a-z]+)/i', $setting, $matches);
		$baseName = $matches[1];
		
		switch ($baseName) {
		// Object settings
		case 'feeds':
			if (!is_object($value)) {
				throw new Exception("'value' must be an object", Z_ERROR_INVALID_INPUT);
			}
			break;
		
		// Array settings
		case 'autoRenameFilesFileTypes':
		case 'readerCustomThemes':
		case 'tagColors':
			if (!is_array($value)) {
				throw new Exception("'value' must be an array", Z_ERROR_INVALID_INPUT);
			}
			
			if (empty($value)) {
				throw new Exception("'value' array cannot be empty", Z_ERROR_INVALID_INPUT);
			}
			break;
		
		// Integer settings
		case 'lastRead':
			if (!is_integer($value)) {
				throw new Exception("'value' must be an integer", Z_ERROR_INVALID_INPUT);
			}
			break;
		
		case 'lastPageIndex':
			if (!is_integer($value) && !is_string($value) && !is_float($value)) {
				throw new Exception("'value' must be an integer, string, or decimal", Z_ERROR_INVALID_INPUT);
			}
			// Snapshots use 0 <= scrollYPercent <= 100 with 0-1 decimal places
			if (is_float($value)) {
				if ($value < 0 || $value > 100) {
					throw new Exception("Decimal value must be between 0 and 100", Z_ERROR_INVALID_INPUT);
				}
				if ($value != round($value, 1)) {
					throw new Exception("Decimal value must be to one decimal place", Z_ERROR_INVALID_INPUT);
				}
			}
			if ($value === "") {
				throw new Exception("'value' cannot be empty", Z_ERROR_INVALID_INPUT);
			}
			break;
		
		// String settings
		default:
			if (!is_string($value)) {
				throw new Exception("'value' must be a string", Z_ERROR_INVALID_INPUT);
			}
			
			if ($value === "") {
				throw new Exception("'value' cannot be empty", Z_ERROR_INVALID_INPUT);
			}
			break;
		}
	}
	
	
	protected static function validateMultiObjectJSON($json, $requestParams) {
		if (!is_object($json)) {
			throw new Exception('$json must be a decoded JSON object');
		}
		
		if (sizeOf(get_object_vars($json)) > Zotero_API::$maxWriteSettings) {
			throw new Exception("Cannot add more than "
				. Zotero_API::$maxWriteSettings
				. " settings at a time", Z_ERROR_UPLOAD_TOO_LARGE);
		}
	}
	
	
	private static function invalidValueError($prop, $value) {
		throw new Exception("Invalid '$prop' value '$value'");
	}
}
