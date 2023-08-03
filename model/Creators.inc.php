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

class Zotero_Creators {
	public static $creatorSummarySortLength = 50;
	
	protected static $ZDO_object = 'creator';
	
	private static $fields = array(
		'firstName', 'lastName', 'fieldMode'
	);
	
	private static $maxFirstNameLength = 255;
	private static $maxLastNameLength = 255;
	
	private static $creatorsByID = array();
	private static $primaryDataByLibraryAndKey = array();
	
	public static function bulkDelete($libraryID, $itemID, $creatorOrdersArray) {
		$placeholders = implode(', ', array_fill(0, sizeOf($creatorOrdersArray), '?'));
		$sql = "DELETE FROM itemCreators WHERE itemID=? AND orderIndex IN ($placeholders)";
		Zotero_DB::query($sql, array_merge([$itemID], $creatorOrdersArray), Zotero_Shards::getByLibraryID($libraryID));
	}

	public static function bulkInsert($libraryID, $itemID, $creators) {
		$placeholdersArray = array();
		$paramList = array();
		foreach ($creators as $creator) {
			$placeholdersArray[] = "(?, ?, ?, ?, ?, ?)";
			$paramList = array_merge($paramList, [
				$itemID,
				$creator->firstName,
				$creator->lastName,
				$creator->fieldMode,
				$creator->creatorTypeID,
				$creator->orderIndex,
			 ]);
		}
		$placeholdersStr = implode(", ", $placeholdersArray);
		$sql = "INSERT INTO itemCreators (itemID, firstName, lastName, fieldMode, creatorTypeID, orderIndex) VALUES $placeholdersStr";

		$stmt = Zotero_DB::getStatement($sql, true, Zotero_Shards::getByLibraryID($libraryID));
		Zotero_DB::queryFromStatement($stmt, $paramList);
	}
	
	
	
	public static function cache(Zotero_Creator $creator) {
		if (isset(self::$creatorsByID[$creator->id])) {
			error_log("Creator $creator->id is already cached");
		}
		
		self::$creatorsByID[$creator->id] = $creator;
	}

	public static function editCheck($obj, $userID=false) {
		if (!$userID) {
			return true;
		}
		
		if (!Zotero_Libraries::userCanEdit($obj->libraryID, $userID, $obj)) {
			throw new Exception("Cannot edit " . self::$objectType
				. " in library $obj->libraryID", Z_ERROR_LIBRARY_ACCESS_DENIED);
		}
	}
	
	
	public static function getLocalizedFieldNames($locale='en-US') {
		if ($locale != 'en-US') {
			throw new Exception("Locale not yet supported");
		}
		
		$fields = array('firstName', 'lastName', 'name');
		$rows = array();
		foreach ($fields as $field) {
			$rows[] = array('name' => $field);
		}
		
		foreach ($rows as &$row) {
			switch ($row['name']) {
				case 'firstName':
					$row['localized'] = 'First';
					break;
				
				case 'lastName':
					$row['localized'] = 'Last';
					break;
				
				case 'name':
					$row['localized'] = 'Name';
					break;
			}
		}
		
		return $rows;
	}
	
	
	public static function purge() {
		trigger_error("Unimplemented", E_USER_ERROR);
	}
	
	
	private static function convertXMLToDataValues(DOMElement $xml) {
		$dataObj = new stdClass;
		
		$fieldMode = $xml->getElementsByTagName('fieldMode')->item(0);
		$fieldMode = $fieldMode ? (int) $fieldMode->nodeValue : 0;
		$dataObj->fieldMode = $fieldMode;
		
		if ($fieldMode == 1) {
			$dataObj->firstName = '';
			$dataObj->lastName = $xml->getElementsByTagName('name')->item(0)->nodeValue;
		}
		else {
			$dataObj->firstName = $xml->getElementsByTagName('firstName')->item(0)->nodeValue;
			$dataObj->lastName = $xml->getElementsByTagName('lastName')->item(0)->nodeValue;
		}
		
		
		return $dataObj;
	}
}
?>
