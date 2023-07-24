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
	
	protected static $primaryFields = array(
		'id' => 'creatorID',
		'libraryID' => '',
		'firstName' => '',
		'lastName' => '',
		'fieldMode' => ''
	);
	private static $fields = array(
		'firstName', 'lastName', 'fieldMode'
	);
	
	private static $maxFirstNameLength = 255;
	private static $maxLastNameLength = 255;
	
	private static $creatorsByID = array();
	private static $primaryDataByCreatorID = array();
	private static $primaryDataByLibraryAndKey = array();
	
	public static function idsDoNotExist($libraryID, $creators) {
		$creatorIDs = array_map(function ($object) {
			return $object['creatorID'];
		}, $creators);
		$placeholders = implode(',', array_fill(0, count($creatorIDs), '?'));
		$sql = "SELECT creatorID FROM creators WHERE creatorID IN ($placeholders)";
		$result = Zotero_DB::query($sql, $creatorIDs, Zotero_Shards::getByLibraryID($libraryID));
		$existingIDs = array_map(function ($object) {
			return $object['creatorID'];
		}, $result);
		return array_diff($creatorIDs, $existingIDs);
	}

	public static function bulkInsert($libraryID, $orderedCreators) {
		$placeholdersArray = array();
		$paramList = array();
		foreach ($orderedCreators as $order => $creator) {
			if (isset($creator->id)) {
				throw new Exception("Insert not possible for creator with a set creatorID");
			}
			$creator->id = Zotero_ID::get('creators');
			$placeholdersArray[] = "(?, ?, ?, ?)";
			$paramList = array_merge($paramList, [
				$creator->id,
				$creator->firstName,
				$creator->lastName,
				$creator->fieldMode,
			 ]);
		}
		$placeholdersStr = implode(", ", $placeholdersArray);
		$sql = "INSERT INTO creators (creatorID, firstName, lastName, fieldMode) VALUES $placeholdersStr";

		$stmt = Zotero_DB::getStatement($sql, true, Zotero_Shards::getByLibraryID($libraryID));
		Zotero_DB::queryFromStatement($stmt, $paramList);
		return $orderedCreators;
	}

	public static function get($libraryID, $creatorID) {
		if (!$libraryID) {
			throw new Exception("Library ID not set");
		}
		
		if (!$creatorID) {
			throw new Exception("Creator ID not set");
		}
		
		if (!empty(self::$creatorsByID[$creatorID])) {
			return self::$creatorsByID[$creatorID];
		}
		
		$sql = 'SELECT * FROM creators WHERE creatorID=?';
		$creator = Zotero_DB::rowQuery($sql, $creatorID, Zotero_Shards::getByLibraryID($libraryID));
		if (!$creator) {
			return false;
		}
		
		$creator = new Zotero_Creator($creator['creatorID'], $libraryID, $creator['firstName'], $creator['lastName'], $creator['fieldMode'] );
		
		self::$creatorsByID[$creatorID] = $creator;
		return self::$creatorsByID[$creatorID];
	}
	
	
	public static function getCreatorsWithData($libraryID, $creator, $sortByItemCountDesc=false) {
		$sql = "SELECT creatorID, firstName, lastName, fieldMode FROM creators ";
		if ($sortByItemCountDesc) {
			$sql .= "LEFT JOIN itemCreators USING (creatorID) ";
		}
		$sql .= "WHERE firstName = ? "
			. "AND lastName = ? AND fieldMode=?";
		if ($sortByItemCountDesc) {
			$sql .= " GROUP BY creatorID ORDER BY IFNULL(COUNT(*), 0) DESC";
		}
		$rows = Zotero_DB::query(
			$sql,
			array(
				$creator->firstName,
				$creator->lastName,
				$creator->fieldMode
			),
			Zotero_Shards::getByLibraryID($libraryID)
		);
		
		// Case-sensitive filter, since the DB columns use a case-insensitive collation and we want
		// it to use an index
		$rows = array_filter($rows, function ($row) use ($creator) {
			return $row['lastName'] == $creator->lastName && $row['firstName'] == $creator->firstName;
		});

		$result = [];
		foreach($rows as $row) {
			$c = new Zotero_Creator($row['creatorID'], $libraryID, $row['firstName'], $row['lastName'], $row['fieldMode'] ); 
			if (empty(self::$creatorsByID[$row['creatorID']])) {
				self::$creatorsByID[$row['creatorID']] = $c;
			}
			array_push($result, $c);
		}
		
		return $result;
	}
	
	
/*
	public static function updateLinkedItems($creatorID, $dateModified) {
		Zotero_DB::beginTransaction();
		
		// TODO: add to notifier, if we have one
		//$sql = "SELECT itemID FROM itemCreators WHERE creatorID=?";
		//$changedItemIDs = Zotero_DB::columnQuery($sql, $creatorID);
		
		// This is very slow in MySQL 5.1.33 -- should be faster in MySQL 6
		//$sql = "UPDATE items SET dateModified=?, serverDateModified=? WHERE itemID IN
		//		(SELECT itemID FROM itemCreators WHERE creatorID=?)";
		
		$sql = "UPDATE items JOIN itemCreators USING (itemID) SET items.dateModified=?,
					items.serverDateModified=?, serverDateModifiedMS=? WHERE creatorID=?";
		$timestamp = Zotero_DB::getTransactionTimestamp();
		$timestampMS = Zotero_DB::getTransactionTimestampMS();
		Zotero_DB::query(
			$sql,
			array($dateModified, $timestamp, $timestampMS, $creatorID)
		);
		Zotero_DB::commit();
	}
*/	
	
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
