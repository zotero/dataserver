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

class Zotero_Items {
	use Zotero_DataObjects;
	
	private static $objectType = 'item';
	private static $primaryDataSQLParts = [
		'id' => 'O.itemID',
		'libraryID' => 'O.libraryID',
		'key' => 'O.key',
		'itemTypeID' => 'O.itemTypeID',
		'dateAdded' => 'O.dateAdded',
		'dateModified' => 'O.dateModified',
		'serverDateModified' => 'O.serverDateModified',
		'version' => 'O.version'
	];
	
	public static $maxDataValueLength = 65535;
	
	/**
	 *
	 * TODO: support limit?
	 *
	 * @param	{Integer[]}
	 * @param	{Boolean}
	 */
	public static function getDeleted($libraryID, $asIDs) {
		$sql = "SELECT itemID FROM deletedItems JOIN items USING (itemID) WHERE libraryID=?";
		$ids = Zotero_DB::columnQuery($sql, $libraryID, Zotero_Shards::getByLibraryID($libraryID));
		if (!$ids) {
			return array();
		}
		if ($asIDs) {
			return $ids;
		}
		return self::get($libraryID, $ids);
	}
	
	
	public static function search($libraryID, $onlyTopLevel=false, $params=array(), $includeTrashed=false, Zotero_Permissions $permissions=null) {
		$rnd = "_" . uniqid($libraryID . "_");
		
		$results = array('results' => array(), 'total' => 0);
		
		$shardID = Zotero_Shards::getByLibraryID($libraryID);
		
		$isPublications = !empty($params['publications']);
		if ($isPublications && Zotero_Libraries::getType($libraryID) == 'publications') {
			$isPublications = false;
		}
		
		$includeNotes = true;
		if (!$isPublications && $permissions && !$permissions->canAccess($libraryID, 'notes')) {
			$includeNotes = false;
		}
		
		// Pass a list of itemIDs, for when the initial search is done via SQL
		$itemIDs = !empty($params['itemIDs']) ? $params['itemIDs'] : array();
		$itemKeys = $params['itemKey'];
		
		$titleSort = !empty($params['sort']) && $params['sort'] == 'title';
		$parentItemSort = !empty($params['sort'])
			&& in_array($params['sort'], ['itemType', 'dateAdded', 'dateModified', 'serverDateModified', 'addedBy']);
		
		$sql = "SELECT SQL_CALC_FOUND_ROWS DISTINCT ";
		
		// In /top mode, use the parent item's values for most joins
		if ($onlyTopLevel) {
			$itemIDSelector = "COALESCE(IA.sourceItemID, INo.sourceItemID, I.itemID)";
			$itemKeySelector = "COALESCE(IP.key, I.key)";
			$itemVersionSelector = "COALESCE(IP.version, I.version)";
			$itemTypeIDSelector = "COALESCE(IP.itemTypeID, I.itemTypeID)";
		}
		else {
			$itemIDSelector = "I.itemID";
			$itemKeySelector = "I.key";
			$itemVersionSelector = "I.version";
			$itemTypeIDSelector = "I.itemTypeID";
		}
		
		if ($params['format'] == 'keys' || $params['format'] == 'versions') {
			// In /top mode, display the parent item of matching items
			$sql .= "$itemKeySelector AS `key`";
			
			if ($params['format'] == 'versions') {
				$sql .= ", $itemVersionSelector AS version";
			}
		}
		else {
			$sql .= "$itemIDSelector AS itemID";
		}
		$sql .= " FROM items I ";
		$sqlParams = array($libraryID);
		
		// For /top, we need the parent itemID
		if ($onlyTopLevel) {
			$sql .= "LEFT JOIN itemAttachments IA ON (IA.itemID=I.itemID) ";
		}
		
		// For /top, we need the parent itemID; for 'q' we need the note; for sorting by title,
		// we need the note title
		if ($onlyTopLevel || !empty($params['q']) || $titleSort) {
			$sql .= "LEFT JOIN itemNotes INo ON (INo.itemID=I.itemID) ";
		}
		
		// For some /top requests, pull in the parent item's items row
		if ($onlyTopLevel && ($params['format'] == 'keys' || $params['format'] == 'versions' || $parentItemSort)) {
			$sql .= "LEFT JOIN items IP ON ($itemIDSelector=IP.itemID) ";
		}
		
		// Pull in titles
		if (!empty($params['q']) || $titleSort) {
			$titleFieldIDs = array_merge(
				array(Zotero_ItemFields::getID('title')),
				Zotero_ItemFields::getTypeFieldsFromBase('title')
			);
			$sql .= "LEFT JOIN itemData IDT ON (IDT.itemID=I.itemID AND IDT.fieldID IN "
				. "(" . implode(',', $titleFieldIDs) . ")) ";
		}
		
		// When sorting by title in /top mode, we need the title of the parent item
		if ($onlyTopLevel && $titleSort) {
			$titleSortDataTable = "IDTSort";
			$titleSortNoteTable = "INoSort";
			$sql .= "LEFT JOIN itemData IDTSort ON (IDTSort.itemID=$itemIDSelector AND "
				. "IDTSort.fieldID IN (" . implode(',', $titleFieldIDs) . ")) "
				. "LEFT JOIN itemNotes INoSort ON (INoSort.itemID=$itemIDSelector) ";
		}
		else {
			$titleSortDataTable = "IDT";
			$titleSortNoteTable = "INo";
		}
		
		if (!empty($params['q'])) {
			// Pull in creators
			$sql .= "LEFT JOIN itemCreators IC ON (IC.itemID=I.itemID) "
				. "LEFT JOIN creators C ON (C.creatorID=IC.creatorID) ";
			
			// Pull in dates
			$dateFieldIDs = array_merge(
				array(Zotero_ItemFields::getID('date')),
				Zotero_ItemFields::getTypeFieldsFromBase('date')
			);
			$sql .= "LEFT JOIN itemData IDD ON (IDD.itemID=I.itemID AND IDD.fieldID IN "
					. "(" . implode(',', $dateFieldIDs) . ")) ";
		}
		
		if ($includeTrashed) {
			if (!empty($params['trashedItemsOnly'])) {
				$sql .= "JOIN deletedItems DI ON (DI.itemID=I.itemID) ";
			}
		}
		else {
			$sql .= "LEFT JOIN deletedItems DI ON (DI.itemID=I.itemID) ";
			
			// In /top mode, we don't want to show results for deleted parents or children
			if ($onlyTopLevel) {
				$sql .= "LEFT JOIN deletedItems DIP ON (DIP.itemID=$itemIDSelector) ";
			}
		}
		
		if ($isPublications) {
			$sql .= "LEFT JOIN publicationsItems PI ON (PI.itemID=I.itemID) ";
		}
		
		if (!empty($params['sort'])) {
			switch ($params['sort']) {
				case 'title':
				case 'creator':
					$sql .= "LEFT JOIN itemSortFields ISF ON (ISF.itemID=$itemIDSelector) ";
					break;
				
				case 'date':
					// When sorting by date in /top mode, we need the date of the parent item
					if ($onlyTopLevel) {
						$sortTable = "IDDSort";
						// Pull in dates
						$dateFieldIDs = array_merge(
							array(Zotero_ItemFields::getID('date')),
							Zotero_ItemFields::getTypeFieldsFromBase('date')
						);
						$sql .= "LEFT JOIN itemData IDDSort ON (IDDSort.itemID=$itemIDSelector AND "
							. "IDDSort.fieldID IN (" . implode(',', $dateFieldIDs) . ")) ";
					}
					// If we didn't already pull in dates for a quick search, pull in here
					else {
						$sortTable = "IDD";
						if (empty($params['q'])) {
							$dateFieldIDs = array_merge(
								array(Zotero_ItemFields::getID('date')),
								Zotero_ItemFields::getTypeFieldsFromBase('date')
							);
							$sql .= "LEFT JOIN itemData IDD ON (IDD.itemID=I.itemID AND IDD.fieldID IN ("
								. implode(',', $dateFieldIDs) . ")) ";
						}
					}
					break;
				
				case 'itemType':
					$locale = 'en-US';
					$types = Zotero_ItemTypes::getAll($locale);
					// TEMP: get localized string
					// DEBUG: Why is attachment skipped in getAll()?
					$types[] = array(
						'id' => 14,
						'localized' => 'Attachment'
					);
					foreach ($types as $type) {
						$sql2 = "INSERT IGNORE INTO tmpItemTypeNames VALUES (?, ?, ?)";
						Zotero_DB::query(
							$sql2,
							array(
								$type['id'],
								$locale,
								$type['localized']
							),
							$shardID
						);
					}
					
					// Join temp table to query
					$sql .= "JOIN tmpItemTypeNames TITN ON (TITN.itemTypeID=$itemTypeIDSelector) ";
					break;
				
				case 'addedBy':
					$isGroup = Zotero_Libraries::getType($libraryID) == 'group';
					if ($isGroup) {
						$sql2 = "SELECT DISTINCT createdByUserID FROM items
								JOIN groupItems USING (itemID) WHERE
								createdByUserID IS NOT NULL AND ";
						if ($itemIDs) {
							$sql2 .= "itemID IN ("
									. implode(', ', array_fill(0, sizeOf($itemIDs), '?'))
									. ") ";
							$createdByUserIDs = Zotero_DB::columnQuery($sql2, $itemIDs, $shardID);
						}
						else {
							$sql2 .= "libraryID=?";
							$createdByUserIDs = Zotero_DB::columnQuery($sql2, $libraryID, $shardID);
						}
						
						// Populate temp table with usernames
						if ($createdByUserIDs) {
							$toAdd = array();
							foreach ($createdByUserIDs as $createdByUserID) {
								$toAdd[] = array(
									$createdByUserID,
									Zotero_Users::getUsername($createdByUserID)
								);
							}
							
							$sql2 = "INSERT IGNORE INTO tmpCreatedByUsers VALUES ";
							Zotero_DB::bulkInsert($sql2, $toAdd, 50, false, $shardID);
							
							// Join temp table to query
							$sql .= "LEFT JOIN groupItems GI ON (GI.itemID=I.itemID)
									LEFT JOIN tmpCreatedByUsers TCBU ON (TCBU.userID=GI.createdByUserID) ";
						}
					}
					break;
			}
		}
		
		$sql .= "WHERE I.libraryID=? ";
		
		if (!$includeTrashed) {
			$sql .= "AND DI.itemID IS NULL ";
			
			// Hide deleted parents in /top mode
			if ($onlyTopLevel) {
				$sql .= "AND DIP.itemID IS NULL ";
			}
		}
		
		if ($isPublications) {
			$sql .= "AND PI.itemID IS NOT NULL ";
		}
		
		// Search on title, creators, and dates
		if (!empty($params['q'])) {
			$sql .= "AND (";
			
			$sql .= "IDT.value LIKE ? ";
			$sqlParams[] = '%' . $params['q'] . '%';
			
			$sql .= "OR INo.title LIKE ? ";
			$sqlParams[] = '%' . $params['q'] . '%';
			
			$sql .= "OR TRIM(CONCAT(firstName, ' ', lastName)) LIKE ? ";
			$sqlParams[] = '%' . $params['q'] . '%';
			
			$sql .= "OR SUBSTR(IDD.value, 1, 4) = ?";
			$sqlParams[] = $params['q'];
			
			// Full-text search
			if ($params['qmode'] == 'everything') {
				$ftKeys = Zotero_FullText::searchInLibrary($libraryID, $params['q']);
				if ($ftKeys) {
					$sql .= " OR I.key IN ("
						. implode(', ', array_fill(0, sizeOf($ftKeys), '?'))
						. ") ";
					$sqlParams = array_merge($sqlParams, $ftKeys);
				}
			}
			
			$sql .= ") ";
		}
		
		// Search on itemType
		if (!empty($params['itemType'])) {
			$itemTypes = Zotero_API::getSearchParamValues($params, 'itemType');
			if ($itemTypes) {
				if (sizeOf($itemTypes) > 1) {
					throw new Exception("Cannot specify 'itemType' more than once", Z_ERROR_INVALID_INPUT);
				}
				$itemTypes = $itemTypes[0];
				
				$itemTypeIDs = array();
				foreach ($itemTypes['values'] as $itemType) {
					$itemTypeID = Zotero_ItemTypes::getID($itemType);
					if (!$itemTypeID) {
						throw new Exception("Invalid itemType '{$itemType}'", Z_ERROR_INVALID_INPUT);
					}
					$itemTypeIDs[] = $itemTypeID;
				}
				
				$sql .= "AND I.itemTypeID " . ($itemTypes['negation'] ? "NOT " : "") . "IN ("
						. implode(',', array_fill(0, sizeOf($itemTypeIDs), '?'))
						. ") ";
				$sqlParams = array_merge($sqlParams, $itemTypeIDs);
			}
		}
		
		if (!$includeNotes) {
			$sql .= "AND I.itemTypeID != 1 ";
		}
		
		if (!empty($params['since'])) {
			$sql .= "AND $itemVersionSelector > ? ";
			$sqlParams[] = $params['since'];
		}
		
		// TEMP: for sync transition
		if (!empty($params['sincetime']) && $params['sincetime'] != 1) {
			$sql .= "AND I.serverDateModified >= FROM_UNIXTIME(?) ";
			$sqlParams[] = $params['sincetime'];
		}
		
		// Tags
		//
		// ?tag=foo
		// ?tag=foo bar // phrase
		// ?tag=-foo // negation
		// ?tag=\-foo // literal hyphen (only for first character)
		// ?tag=foo&tag=bar // AND
		$tagSets = Zotero_API::getSearchParamValues($params, 'tag');
		
		if ($tagSets) {
			$sql2 = "SELECT itemID FROM items WHERE libraryID=?\n";
			$sqlParams2 = array($libraryID);
			
			$positives = array();
			$negatives = array();
			
			foreach ($tagSets as $set) {
				$tagIDs = array();
				
				foreach ($set['values'] as $tag) {
					$ids = Zotero_Tags::getIDs($libraryID, $tag, true);
					if (!$ids) {
						$ids = array(0);
					}
					$tagIDs = array_merge($tagIDs, $ids);
				}
				
				$tagIDs = array_unique($tagIDs);
				
				$tmpSQL = "SELECT itemID FROM items JOIN itemTags USING (itemID) "
						. "WHERE tagID IN (" . implode(',', array_fill(0, sizeOf($tagIDs), '?')) . ")";
				$ids = Zotero_DB::columnQuery($tmpSQL, $tagIDs, $shardID);
				
				if (!$ids) {
					// If no negative tags, skip this tag set
					if ($set['negation']) {
						continue;
					}
					
					// If no positive tags, return no matches
					return $results;
				}
				
				$ids = $ids ? $ids : array();
				$sql2 .= " AND itemID " . ($set['negation'] ? "NOT " : "") . " IN ("
					. implode(',', array_fill(0, sizeOf($ids), '?')) . ")";
				$sqlParams2 = array_merge($sqlParams2, $ids);
			}
			
			$tagItems = Zotero_DB::columnQuery($sql2, $sqlParams2, $shardID);
			
			// No matches
			if (!$tagItems) {
				return $results;
			}
			
			// Combine with passed ids
			if ($itemIDs) {
				$itemIDs = array_intersect($itemIDs, $tagItems);
				// None of the tag matches match the passed ids
				if (!$itemIDs) {
					return $results;
				}
			}
			else {
				$itemIDs = $tagItems;
			}
		}
		
		if ($itemIDs) {
			$sql .= "AND I.itemID IN ("
					. implode(', ', array_fill(0, sizeOf($itemIDs), '?'))
					. ") ";
			$sqlParams = array_merge($sqlParams, $itemIDs);
		}
		
		if ($itemKeys) {
			$sql .= "AND I.key IN ("
					. implode(', ', array_fill(0, sizeOf($itemKeys), '?'))
					. ") ";
			$sqlParams = array_merge($sqlParams, $itemKeys);
		}
		
		$sql .= "ORDER BY ";
		
		if (!empty($params['sort'])) {
			switch ($params['sort']) {
				case 'dateAdded':
				case 'dateModified':
				case 'serverDateModified':
					if ($onlyTopLevel) {
						$orderSQL = "IP." . $params['sort'];
					}
					else {
						$orderSQL = "I." . $params['sort'];
					}
					break;
				
				
				case 'itemType';
					$orderSQL = "TITN.itemTypeName";
					/*
					// Optional method for sorting by localized item type name, which would avoid
					// the INSERT and JOIN above and allow these requests to use DB read replicas
					$locale = 'en-US';
					$types = Zotero_ItemTypes::getAll($locale);
					// TEMP: get localized string
					// DEBUG: Why is attachment skipped in getAll()?
					$types[] = [
						'id' => 14,
						'localized' => 'Attachment'
					];
					usort($types, function ($a, $b) {
						return strcasecmp($a['localized'], $b['localized']);
					});
					// Pass order of localized item type names for sorting
					// e.g., FIELD(14, 12, 14, 26...) for sorting "Attachment" after "Artwork"
					$orderSQL = "FIELD($itemTypeIDSelector, "
						. implode(", ", array_map(function ($x) {
							return $x['id'];
						}, $types)) . ")";
					// If itemTypeID isn't found in passed list (currently only for NSF Reviewer),
					// sort last
					$orderSQL = "IFNULL(NULLIF($orderSQL, 0), 99999)";
					// All items have types, so no need to check for empty sort values
					$params['emptyFirst'] = true;
					*/
					break;
				
				case 'title':
					$orderSQL = "IFNULL(COALESCE(sortTitle, $titleSortDataTable.value, $titleSortNoteTable.title), '')";
					break;
				
				case 'creator':
					$orderSQL = "ISF.creatorSummary";
					break;
				
				// TODO: generic base field mapping-aware sorting
				case 'date':
					$orderSQL = "$sortTable.value";
					break;
				
				case 'addedBy':
					if ($isGroup && $createdByUserIDs) {
						$orderSQL = "TCBU.username";
					}
					else {
						$orderSQL = ($onlyTopLevel ? "IP" : "I") . ".dateAdded";
					}
					break;
				
				case 'itemKeyList':
					$orderSQL = "FIELD(I.key,"
						. implode(',', array_fill(0, sizeOf($itemKeys), '?')) . ")";
					$sqlParams = array_merge($sqlParams, $itemKeys);
					break;
				
				default:
					$fieldID = Zotero_ItemFields::getID($params['sort']);
					if (!$fieldID) {
						throw new Exception("Invalid order field '" . $params['sort'] . "'");
					}
					$orderSQL = "(SELECT value FROM itemData WHERE itemID=I.itemID AND fieldID=?)";
					if (!$params['emptyFirst']) {
						$sqlParams[] = $fieldID;
					}
					$sqlParams[] = $fieldID;
			}
			
			if (!empty($params['direction'])) {
				$dir = $params['direction'];
			}
			else {
				$dir = "ASC";
			}
			
			if (!$params['emptyFirst']) {
				$sql .= "IFNULL($orderSQL, '') = '' $dir, ";
			}
			
			$sql .= $orderSQL . " $dir, ";
		}
		$sql .= "I.version " . (!empty($params['direction']) ? $params['direction'] : "ASC")
			. ", I.itemID " . (!empty($params['direction']) ? $params['direction'] : "ASC") . " ";
		
		if (!empty($params['limit'])) {
			$sql .= "LIMIT ?, ?";
			$sqlParams[] = $params['start'] ? $params['start'] : 0;
			$sqlParams[] = $params['limit'];
		}
		
		// Log SQL statement with embedded parameters
		/*if (true || !empty($_GET['sqldebug'])) {
			error_log($onlyTopLevel);
			
			$debugSQL = "";
			$parts = explode("?", $sql);
			$debugSQLParams = $sqlParams;
			foreach ($parts as $part) {
				$val = array_shift($debugSQLParams);
				$debugSQL .= $part;
				if (!is_null($val)) {
					$debugSQL .= is_int($val) ? $val : '"' . $val . '"';
				}
			}
			error_log($debugSQL . ";");
		}*/
		
		if ($params['format'] == 'versions') {
			$rows = Zotero_DB::query($sql, $sqlParams, $shardID);
		}
		// keys and ids
		else {
			$rows = Zotero_DB::columnQuery($sql, $sqlParams, $shardID);
		}
		
		$results['total'] = Zotero_DB::valueQuery("SELECT FOUND_ROWS()", false, $shardID);
		if ($rows) {
			if ($params['format'] == 'keys') {
				$results['results'] = $rows;
			}
			else if ($params['format'] == 'versions') {
				foreach ($rows as $row) {
					$results['results'][$row['key']] = $row['version'];
				}
			}
			else {
				$results['results'] = Zotero_Items::get($libraryID, $rows);
			}
		}
		
		return $results;
	}
	
	
	/**
	 * Store item in internal id-based cache
	 */
	public static function cache(Zotero_Item $item) {
		if (isset(self::$objectCache[$item->id])) {
			Z_Core::debug("Item $item->id is already cached");
		}
		
		self::$itemsByID[$item->id] = $item;
	}
	
	
	public static function updateVersions($items, $userID=false) {
		$libraryShards = array();
		$libraryIsGroup = array();
		$shardItemIDs = array();
		$shardGroupItemIDs = array();
		$libraryItems = array();
		
		foreach ($items as $item) {
			$libraryID = $item->libraryID;
			$itemID = $item->id;
			
			// Index items by shard
			if (isset($libraryShards[$libraryID])) {
				$shardID = $libraryShards[$libraryID];
				$shardItemIDs[$shardID][] = $itemID;
			}
			else {
				$shardID = Zotero_Shards::getByLibraryID($libraryID);
				$libraryShards[$libraryID] = $shardID;
				$shardItemIDs[$shardID] = array($itemID);
			}
			
			// Separate out group items by shard
			if (!isset($libraryIsGroup[$libraryID])) {
				$libraryIsGroup[$libraryID] =
					Zotero_Libraries::getType($libraryID) == 'group';
			}
			if ($libraryIsGroup[$libraryID]) {
				if (isset($shardGroupItemIDs[$shardID])) {
					$shardGroupItemIDs[$shardID][] = $itemID;
				}
				else {
					$shardGroupItemIDs[$shardID] = array($itemID);
				}
			}
			
			// Index items by library
			if (!isset($libraryItems[$libraryID])) {
				$libraryItems[$libraryID] = array();
			}
			$libraryItems[$libraryID][] = $item;
		}
		
		Zotero_DB::beginTransaction();
		foreach ($shardItemIDs as $shardID => $itemIDs) {
			// Group item data
			if ($userID && isset($shardGroupItemIDs[$shardID])) {
				$sql = "UPDATE groupItems SET lastModifiedByUserID=? "
					. "WHERE itemID IN ("
					. implode(',', array_fill(0, sizeOf($shardGroupItemIDs[$shardID]), '?')) . ")";
				Zotero_DB::query(
					$sql,
					array_merge(array($userID), $shardGroupItemIDs[$shardID]),
					$shardID
				);
			}
		}
		foreach ($libraryItems as $libraryID => $items) {
			$itemIDs = array();
			foreach ($items as $item) {
				$itemIDs[] = $item->id;
			}
			$version = Zotero_Libraries::getUpdatedVersion($libraryID);
			$sql = "UPDATE items SET version=? WHERE itemID IN "
				. "(" . implode(',', array_fill(0, sizeOf($itemIDs), '?')) . ")";
			Zotero_DB::query($sql, array_merge(array($version), $itemIDs), $shardID);
		}
		Zotero_DB::commit();
		
		foreach ($libraryItems as $libraryID => $items) {
			foreach ($items as $item) {
				$item->reload();
			}
			
			$libraryKeys = array_map(function ($item) use ($libraryID) {
				return $libraryID . "/" . $item->key;
			}, $items);
			
			Zotero_Notifier::trigger('modify', 'item', $libraryKeys);
		}
	}
	
	
	public static function getDataValuesFromXML(DOMDocument $doc) {
		$xpath = new DOMXPath($doc);
		$fields = $xpath->evaluate('//items/item/field');
		$vals = array();
		foreach ($fields as $f) {
			$vals[] = $f->firstChild->nodeValue;
		}
		$vals = array_unique($vals);
		return $vals;
	}
	
	
	public static function getLongDataValueFromXML(DOMDocument $doc) {
		$xpath = new DOMXPath($doc);
		$fields = $xpath->evaluate('//items/item/field[string-length(text()) > ' . self::$maxDataValueLength . ']');
		return $fields->length ? $fields->item(0) : false;
	}
	
	
	/**
	 * Converts a DOMElement item to a Zotero_Item object
	 *
	 * @param	DOMElement		$xml		Item data as DOMElement
	 * @return	Zotero_Item					Zotero item object
	 */
	public static function convertXMLToItem(DOMElement $xml, $skipCreators = []) {
		// Get item type id, adding custom type if necessary
		$itemTypeName = $xml->getAttribute('itemType');
		$itemTypeID = Zotero_ItemTypes::getID($itemTypeName);
		if (!$itemTypeID) {
			$itemTypeID = Zotero_ItemTypes::addCustomType($itemTypeName);
		}
		
		// Primary fields
		$libraryID = (int) $xml->getAttribute('libraryID');
		$itemObj = self::getByLibraryAndKey($libraryID, $xml->getAttribute('key'));
		if (!$itemObj) {
			$itemObj = new Zotero_Item;
			$itemObj->libraryID = $libraryID;
			$itemObj->key = $xml->getAttribute('key');
		}
		$itemObj->setField('itemTypeID', $itemTypeID, false, true);
		$itemObj->setField('dateAdded', $xml->getAttribute('dateAdded'), false, true);
		$itemObj->setField('dateModified', $xml->getAttribute('dateModified'), false, true);
		
		$xmlFields = array();
		$xmlCreators = array();
		$xmlNote = null;
		$xmlPath = null;
		$xmlRelated = null;
		$childNodes = $xml->childNodes;
		foreach ($childNodes as $child) {
			switch ($child->nodeName) {
				case 'field':
					$xmlFields[] = $child;
					break;
				
				case 'creator':
					$xmlCreators[] = $child;
					break;
				
				case 'note':
					$xmlNote = $child;
					break;
				
				case 'path':
					$xmlPath = $child;
					break;
				
				case 'related':
					$xmlRelated = $child;
					break;
			}
		}
		
		// Item data
		$setFields = array();
		foreach ($xmlFields as $field) {
			// TODO: add custom fields
			
			$fieldName = $field->getAttribute('name');
			// Special handling for renamed computerProgram 'version' field
			if ($itemTypeID == 32 && $fieldName == 'version') {
				$fieldName = 'versionNumber';
			}
			$itemObj->setField($fieldName, $field->nodeValue, false, true);
			$setFields[$fieldName] = true;
		}
		$previousFields = $itemObj->getUsedFields(true);
		
		foreach ($previousFields as $field) {
			if (!isset($setFields[$field])) {
				$itemObj->setField($field, false, false, true);
			}
		}
		
		$deleted = $xml->getAttribute('deleted');
		$itemObj->deleted = ($deleted == 'true' || $deleted == '1');
		
		// Creators
		$i = 0;
		foreach ($xmlCreators as $creator) {
			// TODO: add custom creator types
			
			$key = $creator->getAttribute('key');
			$creatorObj = Zotero_Creators::getByLibraryAndKey($libraryID, $key);
			// If creator doesn't exist locally (e.g., if it was deleted locally
			// and appears in a new/modified item remotely), get it from within
			// the item's creator block, where a copy should be provided
			if (!$creatorObj) {
				$subcreator = $creator->getElementsByTagName('creator')->item(0);
				if (!$subcreator) {
					if (!empty($skipCreators[$libraryID]) && in_array($key, $skipCreators[$libraryID])) {
						error_log("Skipping empty referenced creator $key for item $libraryID/$itemObj->key");
						continue;
					}
					throw new Exception("Data for missing local creator $key not provided", Z_ERROR_CREATOR_NOT_FOUND);
				}
				$creatorObj = Zotero_Creators::convertXMLToCreator($subcreator, $libraryID);
				if ($creatorObj->key != $key) {
					throw new Exception("Creator key " . $creatorObj->key .
						" does not match item creator key $key");
				}
			}
			if (Zotero_Utilities::unicodeTrim($creatorObj->firstName) === ''
					&& Zotero_Utilities::unicodeTrim($creatorObj->lastName) === '') {
				continue;
			}
			$creatorTypeID = Zotero_CreatorTypes::getID($creator->getAttribute('creatorType'));
			$itemObj->setCreator($i, $creatorObj, $creatorTypeID);
			$i++;
		}
		
		// Remove item's remaining creators not in XML
		$numCreators = $itemObj->numCreators();
		$rem = $numCreators - $i;
		for ($j=0; $j<$rem; $j++) {
			// Keep removing last creator
			$itemObj->removeCreator($i);
		}
		
		// Both notes and attachments might have parents and notes
		if ($itemTypeName == 'note' || $itemTypeName == 'attachment') {
			$sourceItemKey = $xml->getAttribute('sourceItem');
			$itemObj->setSource($sourceItemKey ? $sourceItemKey : false);
			$itemObj->setNote($xmlNote ? $xmlNote->nodeValue : "");
		}
		
		// Attachment metadata
		if ($itemTypeName == 'attachment') {
			$itemObj->attachmentLinkMode = (int) $xml->getAttribute('linkMode');
			$itemObj->attachmentMIMEType = $xml->getAttribute('mimeType');
			$itemObj->attachmentCharset = $xml->getAttribute('charset');
			// Cast to string to be 32-bit safe
			$storageModTime = (string) $xml->getAttribute('storageModTime');
			$itemObj->attachmentStorageModTime = $storageModTime ? $storageModTime : null;
			$storageHash = $xml->getAttribute('storageHash');
			$itemObj->attachmentStorageHash = $storageHash ? $storageHash : null;
			$itemObj->attachmentPath = $xmlPath ? $xmlPath->nodeValue : "";
		}
		
		// Related items
		if ($xmlRelated && $xmlRelated->nodeValue) {
			$relatedKeys = explode(' ', $xmlRelated->nodeValue);
		}
		else {
			$relatedKeys = array();
		}
		$itemObj->relatedItems = $relatedKeys;
		
		return $itemObj;
	}
	
	
	/**
	 * Converts a Zotero_Item object to a SimpleXMLElement item
	 *
	 * @param	object				$item		Zotero_Item object
	 * @param	array				$data
	 * @return	SimpleXMLElement					Item data as SimpleXML element
	 */
	public static function convertItemToXML(Zotero_Item $item, $data=array()) {
		$t = microtime(true);
		
		// Check cache for all items except imported attachments,
		// which don't have their versions updated when the client
		// updates their file metadata
		if (!$item->isImportedAttachment()) {
			$cacheVersion = 1;
			$cacheKey = "syncXMLItem_" . $item->libraryID . "/" . $item->id . "_"
				. $item->version
				. "_" . md5(json_encode($data))
				// For code-based changes
				. "_" . $cacheVersion
				// For data-based changes
				. (isset(Z_CONFIG::$CACHE_VERSION_SYNC_XML_ITEM)
					? "_" . Z_CONFIG::$CACHE_VERSION_SYNC_XML_ITEM
					: "");
			$xmlstr = Z_Core::$MC->get($cacheKey);
		}
		else {
			$cacheKey = false;
			$xmlstr = false;
		}
		if ($xmlstr) {
			$xml = new SimpleXMLElement($xmlstr);
			
			StatsD::timing("api.items.itemToSyncXML.cached", (microtime(true) - $t) * 1000);
			StatsD::increment("memcached.items.itemToSyncXML.hit");
			
			// Skip the cache every 10 times for now, to ensure cache sanity
			if (Z_Core::probability(10)) {
				//$xmlstr = $xml->saveXML();
			}
			else {
				Z_Core::debug("Using cached sync XML item");
				return $xml;
			}
		}
		
		$xml = new SimpleXMLElement('<item/>');
		
		// Primary fields
		foreach (self::$primaryFields as $field) {
			switch ($field) {
				case 'id':
				case 'serverDateModified':
				case 'version':
					continue (2);
				
				case 'itemTypeID':
					$xmlField = 'itemType';
					$xmlValue = Zotero_ItemTypes::getName($item->$field);
					break;
				
				default:
					$xmlField = $field;
					$xmlValue = $item->$field;
			}
			
			$xml[$xmlField] = $xmlValue;
		}
		
		// Item data
		$itemTypeID = $item->itemTypeID;
		$fieldIDs = $item->getUsedFields();
		foreach ($fieldIDs as $fieldID) {
			$val = $item->getField($fieldID);
			if ($val == '') {
				continue;
			}
			$f = $xml->addChild('field', htmlspecialchars($val));
			$fieldName = Zotero_ItemFields::getName($fieldID);
			// Special handling for renamed computerProgram 'version' field
			if ($itemTypeID == 32 && $fieldName == 'versionNumber') {
				$fieldName = 'version';
			}
			$f['name'] = htmlspecialchars($fieldName);
		}
		
		// Deleted item flag
		if ($item->deleted) {
			$xml['deleted'] = '1';
		}
		
		if ($item->isNote() || $item->isAttachment()) {
			$sourceItemID = $item->getSource();
			if ($sourceItemID) {
				$sourceItem = Zotero_Items::get($item->libraryID, $sourceItemID);
				if (!$sourceItem) {
					throw new Exception("Parent item $sourceItemID not found");
				}
				$xml['sourceItem'] = $sourceItem->key;
			}
		}
		
		// Group modification info
		$createdByUserID = null;
		$lastModifiedByUserID = null;
		switch (Zotero_Libraries::getType($item->libraryID)) {
			case 'group':
				$createdByUserID = $item->createdByUserID;
				$lastModifiedByUserID = $item->lastModifiedByUserID;
				break;
		}
		if ($createdByUserID) {
			$xml['createdByUserID'] = $createdByUserID;
		}
		if ($lastModifiedByUserID) {
			$xml['lastModifiedByUserID'] = $lastModifiedByUserID;
		}
		
		if ($item->isAttachment()) {
			$linkMode = $item->attachmentLinkMode;
			$xml['linkMode'] = Zotero_Attachments::linkModeNameToNumber($linkMode);
			$xml['mimeType'] = $item->attachmentMIMEType;
			if ($item->attachmentCharset) {
				$xml['charset'] = $item->attachmentCharset;
			}
			
			$storageModTime = $item->attachmentStorageModTime;
			if ($storageModTime) {
				$xml['storageModTime'] = $storageModTime;
			}
			
			$storageHash = $item->attachmentStorageHash;
			if ($storageHash) {
				$xml['storageHash'] = $storageHash;
			}
			
			if ($linkMode != 'linked_url') {
				$xml->addChild('path', htmlspecialchars($item->attachmentPath));
			}
		}
		
		// Note
		if ($item->isNote() || $item->isAttachment()) {
			// Get htmlspecialchars'ed note
			$note = $item->getNote(false, true);
			if ($note !== '') {
				$xml->addChild('note', $note);
			}
			else if ($item->isNote()) {
				$xml->addChild('note', '');
			}
		}
		
		// Creators
		$creators = $item->getCreators();
		if ($creators) {
			foreach ($creators as $index => $creator) {
				$c = $xml->addChild('creator');
				$c['key'] = $creator['ref']->key;
				$c['creatorType'] = htmlspecialchars(
					Zotero_CreatorTypes::getName($creator['creatorTypeID'])
				);
				$c['index'] = $index;
				if (empty($data['updatedCreators']) ||
						!in_array($creator['ref']->id, $data['updatedCreators'])) {
					$cNode = dom_import_simplexml($c);
					$creatorXML = Zotero_Creators::convertCreatorToXML($creator['ref'], $cNode->ownerDocument);
					$cNode->appendChild($creatorXML);
				}
			}
		}
		
		// Related items
		$relatedKeys = $item->relatedItems;
		$keys = array();
		foreach ($relatedKeys as $relatedKey) {
			if (Zotero_Items::getByLibraryAndKey($item->libraryID, $relatedKey)) {
				$keys[] = $relatedKey;
			}
		}
		if ($keys) {
			$xml->related = implode(' ', $keys);
		}
		
		if ($xmlstr) {
			$uncached = $xml->saveXML();
			if ($xmlstr != $uncached) {
				error_log("Cached sync XML item does not match");
				error_log("  Cached: " . $xmlstr);
				error_log("Uncached: " . $uncached);
			}
		}
		else {
			$xmlstr = $xml->saveXML();
			if ($cacheKey) {
				Z_Core::$MC->set($cacheKey, $xmlstr, 3600); // 1 hour for now
			}
			StatsD::timing("api.items.itemToSyncXML.uncached", (microtime(true) - $t) * 1000);
			StatsD::increment("memcached.items.itemToSyncXML.miss");
		}
		
		return $xml;
	}
	
	
	/**
	 * Converts a Zotero_Item object to a SimpleXMLElement Atom object
	 *
	 * Note: Increment Z_CONFIG::$CACHE_VERSION_ATOM_ENTRY when changing
	 * the response.
	 *
	 * @param	object				$item		Zotero_Item object
	 * @param	string				$content
	 * @return	SimpleXMLElement					Item data as SimpleXML element
	 */
	public static function convertItemToAtom(Zotero_Item $item, $queryParams, $permissions, $sharedData=null) {
		$t = microtime(true);
		
		// Uncached stuff or parts of the cache key
		$version = $item->version;
		$parent = $item->getSource();
		$isRegularItem = !$parent && $item->isRegularItem();
		
		$props = $item->getUncachedResponseProps($queryParams, $permissions);
		$downloadDetails = $props['downloadDetails'];
		$numChildren = $props['numChildren'];
		
		// <id> changes based on group visibility in v1
		if ($queryParams['v'] < 2) {
			$id = Zotero_URI::getItemURI($item, false, true);
		}
		else {
			$id = Zotero_URI::getItemURI($item);
		}
		$libraryType = Zotero_Libraries::getType($item->libraryID);
		
		// Any query parameters that have an effect on the output
		// need to be added here
		$allowedParams = array(
			'content',
			'style',
			'css',
			'linkwrap',
			'publications'
		);
		$cachedParams = Z_Array::filterKeys($queryParams, $allowedParams);
		
		$cacheVersion = 3;
		$cacheKey = "atomEntry_" . $item->libraryID . "/" . $item->id . "_"
			. md5(
				$version
				. json_encode($cachedParams)
				. ($downloadDetails ? 'hasFile' : '')
				. ($libraryType == 'group' ? 'id' . $id : '')
			)
			. "_" . $queryParams['v']
			// For code-based changes
			. "_" . $cacheVersion
			// For data-based changes
			. (isset(Z_CONFIG::$CACHE_VERSION_ATOM_ENTRY)
				? "_" . Z_CONFIG::$CACHE_VERSION_ATOM_ENTRY
				: "")
			// If there's bib content, include the bib cache version
			. ((in_array('bib', $queryParams['content'])
					&& isset(Z_CONFIG::$CACHE_VERSION_BIB))
				? "_" . Z_CONFIG::$CACHE_VERSION_BIB
				: "");
		
		$xmlstr = Z_Core::$MC->get($cacheKey);
		if ($xmlstr) {
			try {
				// TEMP: Strip control characters
				$xmlstr = Zotero_Utilities::cleanString($xmlstr, true);
				
				$doc = new DOMDocument;
				$doc->loadXML($xmlstr);
				$xpath = new DOMXpath($doc);
				$xpath->registerNamespace('atom', Zotero_Atom::$nsAtom);
				$xpath->registerNamespace('zapi', Zotero_Atom::$nsZoteroAPI);
				$xpath->registerNamespace('xhtml', Zotero_Atom::$nsXHTML);
				
				// Make sure numChildren reflects the current permissions
				if ($isRegularItem) {
					$xpath->query('/atom:entry/zapi:numChildren')
								->item(0)->nodeValue = $numChildren;
				}
				
				// To prevent PHP from messing with namespace declarations,
				// we have to extract, remove, and then add back <content>
				// subelements. Otherwise the subelements become, say,
				// <default:span xmlns="http://www.w3.org/1999/xhtml"> instead
				// of just <span xmlns="http://www.w3.org/1999/xhtml">, and
				// xmlns:default="http://www.w3.org/1999/xhtml" gets added to
				// the parent <entry>. While you might reasonably think that
				//
				// echo $xml->saveXML();
				//
				// and
				//
				// $xml = new SimpleXMLElement($xml->saveXML());
				// echo $xml->saveXML();
				//
				// would be identical, you would be wrong.
				$multiFormat = !!$xpath
					->query('/atom:entry/atom:content/zapi:subcontent')
					->length;
				
				$contentNodes = array();
				if ($multiFormat) {
					$contentNodes = $xpath->query('/atom:entry/atom:content/zapi:subcontent');
				}
				else {
					$contentNodes = $xpath->query('/atom:entry/atom:content');
				}
				
				foreach ($contentNodes as $contentNode) {
					$contentParts = array();
					while ($contentNode->hasChildNodes()) {
						$contentParts[] = $doc->saveXML($contentNode->firstChild);
						$contentNode->removeChild($contentNode->firstChild);
					}
					
					foreach ($contentParts as $part) {
						if (!trim($part)) {
							continue;
						}
						
						// Strip the namespace and add it back via SimpleXMLElement,
						// which keeps it from being changed later
						if (preg_match('%^<[^>]+xmlns="http://www.w3.org/1999/xhtml"%', $part)) {
							$part = preg_replace(
								'%^(<[^>]+)xmlns="http://www.w3.org/1999/xhtml"%', '$1', $part
							);
							$html = new SimpleXMLElement($part);
							$html['xmlns'] = "http://www.w3.org/1999/xhtml";
							$subNode = dom_import_simplexml($html);
							$importedNode = $doc->importNode($subNode, true);
							$contentNode->appendChild($importedNode);
						}
						else if (preg_match('%^<[^>]+xmlns="http://zotero.org/ns/transfer"%', $part)) {
							$part = preg_replace(
								'%^(<[^>]+)xmlns="http://zotero.org/ns/transfer"%', '$1', $part
							);
							$html = new SimpleXMLElement($part);
							$html['xmlns'] = "http://zotero.org/ns/transfer";
							$subNode = dom_import_simplexml($html);
							$importedNode = $doc->importNode($subNode, true);
							$contentNode->appendChild($importedNode);
						}
						// Non-XML blocks get added back as-is
						else {
							$docFrag = $doc->createDocumentFragment();
							$docFrag->appendXML($part);
							$contentNode->appendChild($docFrag);
						}
					}
				}
				
				$xml = simplexml_import_dom($doc);
				
				StatsD::timing("api.items.itemToAtom.cached", (microtime(true) - $t) * 1000);
				StatsD::increment("memcached.items.itemToAtom.hit");
				
				// Skip the cache every 10 times for now, to ensure cache sanity
				if (Z_Core::probability(10)) {
					$xmlstr = $xml->saveXML();
				}
				else {
					return $xml;
				}
			}
			catch (Exception $e) {
				error_log($xmlstr);
				error_log("WARNING: " . $e);
			}
		}
		
		$content = $queryParams['content'];
		$contentIsHTML = sizeOf($content) == 1 && $content[0] == 'html';
		$contentParamString = urlencode(implode(',', $content));
		$style = $queryParams['style'];
		
		$entry = '<?xml version="1.0" encoding="UTF-8"?>'
			. '<entry xmlns="' . Zotero_Atom::$nsAtom . '" xmlns:zapi="' . Zotero_Atom::$nsZoteroAPI . '"/>';
		$xml = new SimpleXMLElement($entry);
		
		$title = $item->getDisplayTitle(true);
		$title = $title ? $title : '[Untitled]';
		$xml->title = $title;
		
		$author = $xml->addChild('author');
		$createdByUserID = null;
		$lastModifiedByUserID = null;
		switch (Zotero_Libraries::getType($item->libraryID)) {
			case 'group':
				$createdByUserID = $item->createdByUserID;
				// Used for zapi:lastModifiedByUser below
				$lastModifiedByUserID = $item->lastModifiedByUserID;
				break;
		}
		if ($createdByUserID) {
			$author->name = Zotero_Users::getUsername($createdByUserID);
			$author->uri = Zotero_URI::getUserURI($createdByUserID);
		}
		else {
			$author->name = Zotero_Libraries::getName($item->libraryID);
			$author->uri = Zotero_URI::getLibraryURI($item->libraryID);
		}
		
		$xml->id = $id;
		
		$xml->published = Zotero_Date::sqlToISO8601($item->dateAdded);
		$xml->updated = Zotero_Date::sqlToISO8601($item->dateModified);
		
		$link = $xml->addChild("link");
		$link['rel'] = "self";
		$link['type'] = "application/atom+xml";
		$href = Zotero_API::getItemURI($item) . "?format=atom";
		if ($queryParams['publications']) {
			$href = str_replace("/items/", "/publications/items/", $href);
		}
		if (!$contentIsHTML) {
			$href .= "&content=$contentParamString";
		}
		$link['href'] = $href;
		
		if ($parent) {
			// TODO: handle group items?
			$parentItem = Zotero_Items::get($item->libraryID, $parent);
			$link = $xml->addChild("link");
			$link['rel'] = "up";
			$link['type'] = "application/atom+xml";
			$href = Zotero_API::getItemURI($parentItem) . "?format=atom";
			if (!$contentIsHTML) {
				$href .= "&content=$contentParamString";
			}
			$link['href'] = $href;
		}
		
		$link = $xml->addChild('link');
		$link['rel'] = 'alternate';
		$link['type'] = 'text/html';
		$link['href'] = Zotero_URI::getItemURI($item, true);
		
		// If appropriate permissions and the file is stored in ZFS, get file request link
		if ($downloadDetails) {
			$details = $downloadDetails;
			$link = $xml->addChild('link');
			$link['rel'] = 'enclosure';
			$type = $item->attachmentMIMEType;
			if ($type) {
				$link['type'] = $type;
			}
			$link['href'] = $details['url'];
			if (!empty($details['filename'])) {
				$link['title'] = $details['filename'];
			}
			if (isset($details['size'])) {
				$link['length'] = $details['size'];
			}
		}
		
		$xml->addChild('zapi:key', $item->key, Zotero_Atom::$nsZoteroAPI);
		$xml->addChild('zapi:version', $item->version, Zotero_Atom::$nsZoteroAPI);
		
		if ($lastModifiedByUserID) {
			$xml->addChild(
				'zapi:lastModifiedByUser',
				Zotero_Users::getUsername($lastModifiedByUserID),
				Zotero_Atom::$nsZoteroAPI
			);
		}
		
		$xml->addChild(
			'zapi:itemType',
			Zotero_ItemTypes::getName($item->itemTypeID),
			Zotero_Atom::$nsZoteroAPI
		);
		if ($isRegularItem) {
			$val = $item->creatorSummary;
			if ($val !== '') {
				$xml->addChild(
					'zapi:creatorSummary',
					htmlspecialchars($val),
					Zotero_Atom::$nsZoteroAPI
				);
			}
			
			$val = $item->getField('date', true, true, true);
			if ($val !== '') {
				// TODO: Make sure all stored values are multipart strings
				if (!Zotero_Date::isMultipart($val)) {
					$val = Zotero_Date::strToMultipart($val);
				}
				if ($queryParams['v'] < 3) {
					$val = substr($val, 0, 4);
					if ($val !== '0000') {
						$xml->addChild('zapi:year', $val, Zotero_Atom::$nsZoteroAPI);
					}
				}
				else {
					$sqlDate = Zotero_Date::multipartToSQL($val);
					if (substr($sqlDate, 0, 4) !== '0000') {
						$xml->addChild(
							'zapi:parsedDate',
							Zotero_Date::sqlToISO8601($sqlDate),
							Zotero_Atom::$nsZoteroAPI
						);
					}
				}
			}
			
			$xml->addChild(
				'zapi:numChildren',
				$numChildren,
				Zotero_Atom::$nsZoteroAPI
			);
		}
		
		if ($queryParams['v'] < 3) {
			$xml->addChild(
				'zapi:numTags',
				$item->numTags(),
				Zotero_Atom::$nsZoteroAPI
			);
		}
		
		$xml->content = '';
		
		//
		// DOM XML from here on out
		//
		
		$contentNode = dom_import_simplexml($xml->content);
		$domDoc = $contentNode->ownerDocument;
		$multiFormat = sizeOf($content) > 1;
		
		// Create a root XML document for multi-format responses
		if ($multiFormat) {
			$contentNode->setAttribute('type', 'application/xml');
			/*$multicontent = $domDoc->createElementNS(
				Zotero_Atom::$nsZoteroAPI, 'multicontent'
			);
			$contentNode->appendChild($multicontent);*/
		}
		
		foreach ($content as $type) {
			// Set the target to either the main <content>
			// or a <multicontent> <content>
			if (!$multiFormat) {
				$target = $contentNode;
			}
			else {
				$target = $domDoc->createElementNS(
					Zotero_Atom::$nsZoteroAPI, 'subcontent'
				);
				$contentNode->appendChild($target);
			}
			
			$target->setAttributeNS(
				Zotero_Atom::$nsZoteroAPI,
				"zapi:type",
				$type
			);
			
			if ($type == 'html') {
				if (!$multiFormat) {
					$target->setAttribute('type', 'xhtml');
				}
				$div = $domDoc->createElementNS(
					Zotero_Atom::$nsXHTML, 'div'
				);
				$target->appendChild($div);
				$html = $item->toHTML(true, $queryParams);
				$subNode = dom_import_simplexml($html);
				$importedNode = $domDoc->importNode($subNode, true);
				$div->appendChild($importedNode);
			}
			else if ($type == 'citation') {
				if (!$multiFormat) {
					$target->setAttribute('type', 'xhtml');
				}
				if (isset($sharedData[$type][$item->libraryID . "/" . $item->key])) {
					$html = $sharedData[$type][$item->libraryID . "/" . $item->key];
				}
				else {
					if ($sharedData !== null) {
						//error_log("Citation not found in sharedData -- retrieving individually");
					}
					$html = Zotero_Cite::getCitationFromCiteServer($item, $queryParams);
				}
				$html = new SimpleXMLElement($html);
				$html['xmlns'] = Zotero_Atom::$nsXHTML;
				$subNode = dom_import_simplexml($html);
				$importedNode = $domDoc->importNode($subNode, true);
				$target->appendChild($importedNode);
			}
			else if ($type == 'bib') {
				if (!$multiFormat) {
					$target->setAttribute('type', 'xhtml');
				}
				if (isset($sharedData[$type][$item->libraryID . "/" . $item->key])) {
					$html = $sharedData[$type][$item->libraryID . "/" . $item->key];
				}
				else {
					if ($sharedData !== null) {
						//error_log("Bibliography not found in sharedData -- retrieving individually");
					}
					$html = Zotero_Cite::getBibliographyFromCitationServer(array($item), $queryParams);
				}
				$html = new SimpleXMLElement($html);
				$html['xmlns'] = Zotero_Atom::$nsXHTML;
				$subNode = dom_import_simplexml($html);
				$importedNode = $domDoc->importNode($subNode, true);
				$target->appendChild($importedNode);
			}
			else if ($type == 'json') {
				if ($queryParams['v'] < 2) {
					$target->setAttributeNS(
						Zotero_Atom::$nsZoteroAPI,
						"zapi:etag",
						$item->etag
					);
				}
				$textNode = $domDoc->createTextNode($item->toJSON(false, $queryParams, true));
				$target->appendChild($textNode);
			}
			else if ($type == 'csljson') {
				$arr = $item->toCSLItem();
				$json = Zotero_Utilities::formatJSON($arr);
				$textNode = $domDoc->createTextNode($json);
				$target->appendChild($textNode);
			}
			else if (in_array($type, Zotero_Translate::$exportFormats)) {
				$exportParams = $queryParams;
				$exportParams['format'] = $type;
				$export = Zotero_Translate::doExport([$item], $exportParams);
				$target->setAttribute('type', $export['mimeType']);
				// Insert XML into document
				if (preg_match('/\+xml$/', $export['mimeType'])) {
					// Strip prolog
					$body = preg_replace('/^<\?xml.+\n/', "", $export['body']);
					$subNode = $domDoc->createDocumentFragment();
					$subNode->appendXML($body);
					$target->appendChild($subNode);
				}
				else {
					$textNode = $domDoc->createTextNode($export['body']);
					$target->appendChild($textNode);
				}
			}
		}
		
		// TEMP
		if ($xmlstr) {
			$uncached = $xml->saveXML();
			if ($xmlstr != $uncached) {
				$uncached = str_replace(
					'<zapi:year></zapi:year>',
					'<zapi:year/>',
					$uncached
				);
				$uncached = str_replace(
					'<content zapi:type="none"></content>',
					'<content zapi:type="none"/>',
					$uncached
				);
				$uncached = str_replace(
					'<zapi:subcontent zapi:type="coins" type="text/html"></zapi:subcontent>',
					'<zapi:subcontent zapi:type="coins" type="text/html"/>',
					$uncached
				);
				$uncached = str_replace(
					'<title></title>',
					'<title/>',
					$uncached
				);
				$uncached = str_replace(
					'<note></note>',
					'<note/>',
					$uncached
				);
				$uncached = str_replace(
					'<path></path>',
					'<path/>',
					$uncached
				);
				$uncached = str_replace(
					'<td></td>',
					'<td/>',
					$uncached
				);
				
				if ($xmlstr != $uncached) {
					error_log("Cached Atom item entry does not match");
					error_log("  Cached: " . $xmlstr);
					error_log("Uncached: " . $uncached);
					
					Z_Core::$MC->set($cacheKey, $uncached, 3600); // 1 hour for now
				}
			}
		}
		else {
			$xmlstr = $xml->saveXML();
			Z_Core::$MC->set($cacheKey, $xmlstr, 3600); // 1 hour for now
			StatsD::timing("api.items.itemToAtom.uncached", (microtime(true) - $t) * 1000);
			StatsD::increment("memcached.items.itemToAtom.miss");
		}
		
		return $xml;
	}
	
	
	/**
	 * Import an item by URL using the translation server
	 *
	 * Initial request:
	 *
	 * {
	 *   "url": "http://..."
	 * }
	 *
	 * Item selection for multi-item results:
	 *
	 * {
	 *   "url": "http://...",
	 *   "token": "<token>"
	 *   "items": {
	 *     "0": "Item 1 Title",
	 *     "3": "Item 2 Title"
	 *   }
	 * }
	 *
	 * Returns an array of keys of added items (like updateMultipleFromJSON) or an object
	 * with a 'select' property containing an array of titles for multi-item results
	 */
	public static function addFromURL($json, $requestParams, $libraryID, $userID,
			Zotero_Permissions $permissions, $translationToken) {
		if (!$translationToken) {
			throw new Exception("Translation token not provided");
		}
		
		self::validateJSONURL($json, $requestParams);
		
		$cacheKey = 'addFromURLKeyMappings_' . md5($json->url . $translationToken);
		
		// Replace numeric keys with URLs for selected items
		if (isset($json->items) && $requestParams['v'] >= 2) {
			$keyMappings = Z_Core::$MC->get($cacheKey);
			$newItems = [];
			foreach ($json->items as $number => $title) {
				if (!isset($keyMappings[$number])) {
					throw new Exception("Index '$number' not found for URL and token", Z_ERROR_INVALID_INPUT);
				}
				$url = $keyMappings[$number];
				$newItems[$url] = $title;
			}
			$json->items = $newItems;
		}
		
		$response = Zotero_Translate::doWeb(
			$json->url,
			$translationToken,
			isset($json->items) ? $json->items : null
		);
		
		if (!$response || is_int($response)) {
			return $response;
		}
		
		if (isset($response->items)) {
			$items = $response->items;
			
			// APIv3
			if ($requestParams['v'] >= 3) {
				for ($i = 0, $len = sizeOf($items); $i < $len; $i++) {
					// Assign key here so that we can add notes if necessary
					do {
						$itemKey = Zotero_ID::getKey();
					}
					while (Zotero_Items::existsByLibraryAndKey($libraryID, $itemKey));
					$items[$i]->key = $itemKey;
					// TEMP: translation-server shouldn't include these, but as long as it does,
					// remove them
					unset($items[$i]->itemKey);
					unset($items[$i]->itemVersion);
					
					// Pull out notes and stick in separate items
					if (isset($items[$i]->notes)) {
						foreach ($items[$i]->notes as $note) {
							$newNote = (object) [
								"itemType" => "note",
								"note" => $note->note,
								"parentItem" => $itemKey
							];
							$items[] = $newNote;
						}
						unset($items[$i]->notes);
					}
					
					// TODO: link attachments, or not possible from translation-server?
				}
				
				$response = $items;
			}
			// APIv2 (was this ever used? it's possible the bookmarklet used v1 and we never publicized
			// this for v2)
			else if ($requestParams['v'] == 2) {
				for ($i = 0, $len = sizeOf($items); $i < $len; $i++) {
					// Assign key here so that we can add notes if necessary
					do {
						$itemKey = Zotero_ID::getKey();
					}
					while (Zotero_Items::existsByLibraryAndKey($libraryID, $itemKey));
					$items[$i]->itemKey = $itemKey;
					
					// Pull out notes and stick in separate items
					if (isset($items[$i]->notes)) {
						foreach ($items[$i]->notes as $note) {
							$newNote = (object) [
								"itemType" => "note",
								"note" => $note->note,
								"parentItem" => $itemKey
							];
							$items[] = $newNote;
						}
						unset($items[$i]->notes);
					}
					
					// TODO: link attachments, or not possible from translation-server?
				}
			}
			// APIv1
			else {
				for ($i = 0, $len = sizeOf($items); $i < $len; $i++) {
					unset($items[$i]->itemKey);
					unset($items[$i]->itemVersion);
				}
			}
			
			try {
				self::validateMultiObjectJSON($response, $requestParams);
			}
			catch (Exception $e) {
				error_log($e);
				error_log(json_encode($response));
				throw new Exception("Invalid JSON from doWeb()");
			}
		}
		// Multi-item select
		else if (isset($response->select)) {
			// Replace URLs with numeric keys for found items
			if ($requestParams['v'] >= 2) {
				$keyMappings = [];
				$newItems = new stdClass;
				$number = 0;
				foreach ($response->select as $url => $title) {
					$keyMappings[$number] = $url;
					$newItems->$number = $title;
					$number++;
				}
				Z_Core::$MC->set($cacheKey, $keyMappings, 600);
				$response->select = $newItems;
			}
			return $response;
		}
		else {
			throw new Exception("Invalid return value from doWeb()");
		}
		
		return self::updateMultipleFromJSON(
			$response,
			$requestParams,
			$libraryID,
			$userID,
			$permissions,
			false,
			null
		);
	}
	
	
	public static function updateFromJSON(Zotero_Item $item,
	                                      $json,
	                                      Zotero_Item $parentItem=null,
	                                      $requestParams,
	                                      $userID,
	                                      $requireVersion=0,
	                                      $partialUpdate=false) {
		$json = Zotero_API::extractEditableJSON($json);
		$exists = Zotero_API::processJSONObjectKey($item, $json, $requestParams);
		$apiVersion = $requestParams['v'];
		
		// computerProgram used 'version' instead of 'versionNumber' before v3
		if ($apiVersion < 3 && isset($json->version)) {
			$json->versionNumber = $json->version;
			unset($json->version);
		}
		
		Zotero_API::checkJSONObjectVersion($item, $json, $requestParams, $requireVersion);
		self::validateJSONItem(
			$json,
			$item->libraryID,
			$exists ? $item : null,
			$parentItem || ($exists ? !!$item->getSourceKey() : false),
			$requestParams,
			$partialUpdate && $exists
		);
		
		$changed = false;
		$twoStage = false;
		
		if (!Zotero_DB::transactionInProgress()) {
			Zotero_DB::beginTransaction();
			$transactionStarted = true;
		}
		else {
			$transactionStarted = false;
		}
		
		// Set itemType first
		if (isset($json->itemType)) {
			$item->setField("itemTypeID", Zotero_ItemTypes::getID($json->itemType));
		}
		
		$dateModifiedProvided = false;
		// APIv2 and below
		$changedDateModified = false;
		// Limit new Date Modified handling to Zotero for now. It can be applied to all v3 clients
		// once people have time to update their code.
		$tmpZoteroClientDateModifiedHack = !empty($_SERVER['HTTP_USER_AGENT'])
			&& (strpos($_SERVER['HTTP_USER_AGENT'], 'Firefox') !== false
				|| strpos($_SERVER['HTTP_USER_AGENT'], 'Zotero') !== false);
		
		foreach ($json as $key=>$val) {
			switch ($key) {
				case 'key':
				case 'version':
				case 'itemKey':
				case 'itemVersion':
				case 'itemType':
				case 'deleted':
				case 'inPublications':
					continue;
				
				case 'parentItem':
					$item->setSourceKey($val);
					break;
				
				case 'creators':
					if (!$val && !$item->numCreators()) {
						continue 2;
					}
					
					$orderIndex = -1;
					foreach ($val as $newCreatorData) {
						// JSON uses 'name' and 'firstName'/'lastName',
						// so switch to just 'firstName'/'lastName'
						if (isset($newCreatorData->name)) {
							$newCreatorData->firstName = '';
							$newCreatorData->lastName = $newCreatorData->name;
							unset($newCreatorData->name);
							$newCreatorData->fieldMode = 1;
						}
						else {
							$newCreatorData->fieldMode = 0;
						}
						
						// Skip empty creators
						if (Zotero_Utilities::unicodeTrim($newCreatorData->firstName) === ""
								&& Zotero_Utilities::unicodeTrim($newCreatorData->lastName) === "") {
							break;
						}
						
						$orderIndex++;
						
						$newCreatorTypeID = Zotero_CreatorTypes::getID($newCreatorData->creatorType);
						
						// Same creator in this position
						$existingCreator = $item->getCreator($orderIndex);
						if ($existingCreator && $existingCreator['ref']->equals($newCreatorData)) {
							// Just change the creatorTypeID
							if ($existingCreator['creatorTypeID'] != $newCreatorTypeID) {
								$item->setCreator($orderIndex, $existingCreator['ref'], $newCreatorTypeID);
							}
							continue;
						}
						
						// Same creator in a different position, so use that
						$existingCreators = $item->getCreators();
						for ($i=0,$len=sizeOf($existingCreators); $i<$len; $i++) {
							if ($existingCreators[$i]['ref']->equals($newCreatorData)) {
								$item->setCreator($orderIndex, $existingCreators[$i]['ref'], $newCreatorTypeID);
								continue;
							}
						}
						
						// Make a fake creator to use for the data lookup
						$newCreator = new Zotero_Creator;
						$newCreator->libraryID = $item->libraryID;
						foreach ($newCreatorData as $key=>$val) {
							if ($key == 'creatorType') {
								continue;
							}
							$newCreator->$key = $val;
						}
						
						// Look for an equivalent creator in this library
						$candidates = Zotero_Creators::getCreatorsWithData($item->libraryID, $newCreator, true);
						if ($candidates) {
							$c = Zotero_Creators::get($item->libraryID, $candidates[0]);
							$item->setCreator($orderIndex, $c, $newCreatorTypeID);
							continue;
						}
						
						// None found, so make a new one
						$creatorID = $newCreator->save();
						$newCreator = Zotero_Creators::get($item->libraryID, $creatorID);
						$item->setCreator($orderIndex, $newCreator, $newCreatorTypeID);
					}
					
					// Remove all existing creators above the current index
					if ($exists && $indexes = array_keys($item->getCreators())) {
						$i = max($indexes);
						while ($i>$orderIndex) {
							$item->removeCreator($i);
							$i--;
						}
					}
					
					break;
				
				case 'tags':
					$item->setTags($val);
					break;
				
				case 'collections':
					$item->setCollections($val);
					break;
				
				case 'relations':
					$item->setRelations($val);
					break;
				
				case 'attachments':
				case 'notes':
					if (!$val) {
						continue;
					}
					$twoStage = true;
					break;
				
				case 'note':
					$item->setNote($val);
					break;
				
				// Attachment properties
				case 'linkMode':
					$item->attachmentLinkMode = Zotero_Attachments::linkModeNameToNumber($val, true);
					break;
				
				case 'contentType':
				case 'charset':
				case 'filename':
				case 'path':
					$k = "attachment" . ucwords($key);
					// Until classic sync is removed, store paths in Mozilla relative descriptor style,
					// and then batch convert and remove this
					if ($key == 'path') {
						$val = Zotero_Attachments::encodeRelativeDescriptorString($val);
					}
					$item->$k = $val;
					break;
				
				case 'md5':
					$item->attachmentStorageHash = $val;
					break;
					
				case 'mtime':
					$item->attachmentStorageModTime = $val;
					break;
				
				case 'dateModified':
					if ($apiVersion >= 3 && $tmpZoteroClientDateModifiedHack) {
						$item->setField($key, $val);
						$dateModifiedProvided = true;
					}
					else {
						$changedDateModified = $item->setField($key, $val);
					}
					break;
				
				default:
					$item->setField($key, $val);
					break;
			}
		}
		
		if ($parentItem) {
			$item->setSource($parentItem->id);
		}
		// Clear parent if not a partial update and a parentItem isn't provided
		else if ($apiVersion >= 2 && !$partialUpdate
				&& $item->getSourceKey() && !isset($json->parentItem)) {
			$item->setSourceKey(false);
		}
		
		$item->deleted = !empty($json->deleted);
		
		if (isset($json->inPublications) || !$partialUpdate) {
			$item->inPublications = !empty($json->inPublications);
		}
		
		// Skip "Date Modified" update if only certain fields were updated (e.g., collections)
		$skipDateModifiedUpdate = $dateModifiedProvided || !sizeOf(array_diff(
			$item->getChanged(),
			['collections', 'deleted', 'inPublications', 'relations', 'tags']
		));
		
		if ($item->hasChanged() && !$skipDateModifiedUpdate
				&& (($apiVersion >= 3 && $tmpZoteroClientDateModifiedHack) || !$changedDateModified)) {
			// Update item with the current timestamp
			$item->dateModified = Zotero_DB::getTransactionTimestamp();
		}
		
		$changed = $item->save($userID) || $changed;
		
		// Additional steps that have to be performed on a saved object
		if ($twoStage) {
			foreach ($json as $key=>$val) {
				switch ($key) {
					case 'attachments':
						if (!$val) {
							continue;
						}
						foreach ($val as $attachmentJSON) {
							$childItem = new Zotero_Item;
							$childItem->libraryID = $item->libraryID;
							self::updateFromJSON(
								$childItem,
								$attachmentJSON,
								$item,
								$requestParams,
								$userID
							);
						}
						break;
					
					case 'notes':
						if (!$val) {
							continue;
						}
						$noteItemTypeID = Zotero_ItemTypes::getID("note");
						
						foreach ($val as $note) {
							$childItem = new Zotero_Item;
							$childItem->libraryID = $item->libraryID;
							$childItem->itemTypeID = $noteItemTypeID;
							$childItem->setSource($item->id);
							$childItem->setNote($note->note);
							$childItem->save();
						}
						break;
				}
			}
		}
		
		if ($transactionStarted) {
			Zotero_DB::commit();
		}
		
		return $changed;
	}
	
	
	private static function validateJSONItem($json, $libraryID, Zotero_Item $item=null, $isChild, $requestParams, $partialUpdate=false) {
		$isNew = !$item || !$item->version;
		
		if (!is_object($json)) {
			throw new Exception("Invalid item object (found " . gettype($json) . " '" . $json . "')", Z_ERROR_INVALID_INPUT);
		}
		
		if (isset($json->items) && is_array($json->items)) {
			throw new Exception("An 'items' array is not valid for single-item updates", Z_ERROR_INVALID_INPUT);
		}
		
		$apiVersion = $requestParams['v'];
		
		// Check if child item is being converted to top-level or vice-versa, and update $isChild to the
		// target state so that, e.g., we properly check for the required property 'collections' below
		// when converting a child item to a top-level item
		if ($isChild) {
			// PATCH
			if (($partialUpdate && isset($json->parentItem) && $json->parentItem === false)
					// PUT
					|| (!$partialUpdate && (!isset($json->parentItem) || $json->parentItem === false))) {
				$isChild = false;
			}
		}
		else {
			if (isset($json->parentItem) && $json->parentItem !== false) {
				$isChild = true;
			}
		}
		
		if ($partialUpdate) {
			$requiredProps = [];
		}
		else if (isset($json->itemType) && $json->itemType == "attachment") {
			$requiredProps = array('linkMode', 'tags');
		}
		else if (isset($json->itemType) && $json->itemType == "attachment") {
			$requiredProps = array('tags');
		}
		else if ($isNew) {
			$requiredProps = array('itemType');
		}
		else if ($apiVersion < 2) {
			$requiredProps = array('itemType', 'tags');
		}
		else {
			$requiredProps = array('itemType', 'tags', 'relations');
			if (!$isChild) {
				$requiredProps[] = 'collections';
			}
		}
		
		foreach ($requiredProps as $prop) {
			if (!isset($json->$prop)) {
				throw new Exception("'$prop' property not provided", Z_ERROR_INVALID_INPUT);
			}
		}
		
		// For partial updates where item type isn't provided, use the existing item type
		if (!isset($json->itemType) && $partialUpdate) {
			$itemType = Zotero_ItemTypes::getName($item->itemTypeID);
		}
		else {
			$itemType = $json->itemType;
		}
		
		foreach ($json as $key=>$val) {
			switch ($key) {
				// Handled by Zotero_API::checkJSONObjectVersion()
				case 'key':
				case 'version':
					if ($apiVersion < 3) {
						throw new Exception("Invalid property '$key'", Z_ERROR_INVALID_INPUT);
					}
					break;
				case 'itemKey':
				case 'itemVersion':
					if ($apiVersion != 2) {
						throw new Exception("Invalid property '$key'", Z_ERROR_INVALID_INPUT);
					}
					break;
				
				case 'parentItem':
					if ($apiVersion < 2) {
						throw new Exception("Invalid property '$key'", Z_ERROR_INVALID_INPUT);
					}
					if (!Zotero_ID::isValidKey($val) && $val !== false) {
						throw new Exception("'$key' must be a valid item key or false", Z_ERROR_INVALID_INPUT);
					}
					break;
				
				case 'itemType':
					if (!is_string($val)) {
						throw new Exception("'itemType' must be a string", Z_ERROR_INVALID_INPUT);
					}
					
					// TODO: Don't allow changing item type
					
					if (!Zotero_ItemTypes::getID($val)) {
						throw new Exception("'$val' is not a valid itemType", Z_ERROR_INVALID_INPUT);
					}
					
					// Parent/child checks by item type
					if ($isChild || !empty($json->parentItem)) {
						switch ($val) {
							case 'note':
							case 'attachment':
								break;
							
							default:
								throw new Exception("Child item must be note or attachment", Z_ERROR_INVALID_INPUT);
						}
					}
					break;
				
				case 'tags':
					if (!is_array($val)) {
						throw new Exception("'$key' property must be an array", Z_ERROR_INVALID_INPUT);
					}
					
					foreach ($val as $tag) {
						$empty = true;
						
						if (is_string($tag)) {
							if ($tag === "") {
								throw new Exception("Tag cannot be empty", Z_ERROR_INVALID_INPUT);
							}
							continue;
						}
						
						if (!is_object($tag)) {
							throw new Exception("Tag must be an object", Z_ERROR_INVALID_INPUT);
						}
						
						foreach ($tag as $k=>$v) {
							switch ($k) {
								case 'tag':
									if (!is_scalar($v)) {
										throw new Exception("Invalid tag name", Z_ERROR_INVALID_INPUT);
									}
									if ($v === "") {
										throw new Exception("Tag cannot be empty", Z_ERROR_INVALID_INPUT);
									}
									break;
									
								case 'type':
									if (!is_numeric($v)) {
										throw new Exception("Invalid tag type '$v'", Z_ERROR_INVALID_INPUT);
									}
									break;
								
								default:
									throw new Exception("Invalid tag property '$k'", Z_ERROR_INVALID_INPUT);
							}
							
							$empty = false;
						}
						
						if ($empty) {
							throw new Exception("Tag object is empty", Z_ERROR_INVALID_INPUT);
						}
					}
					break;
				
				case 'collections':
					if (!is_array($val)) {
						throw new Exception("'$key' property must be an array", Z_ERROR_INVALID_INPUT);
					}
					if ($isChild && $val) {
						throw new Exception("Child items cannot be assigned to collections", Z_ERROR_INVALID_INPUT);
					}
					foreach ($val as $k) {
						if (!Zotero_ID::isValidKey($k)) {
							throw new Exception("'$k' is not a valid collection key", Z_ERROR_INVALID_INPUT);
						}
					}
					break;
				
				case 'relations':
					if ($apiVersion < 2) {
						throw new Exception("Invalid property '$key'", Z_ERROR_INVALID_INPUT);
					}
					
					if (!is_object($val)
							// Allow an empty array, because it's annoying for some clients otherwise
							&& !(is_array($val) && empty($val))) {
						throw new Exception("'$key' property must be an object", Z_ERROR_INVALID_INPUT);
					}
					foreach ($val as $predicate => $object) {
						switch ($predicate) {
						case 'owl:sameAs':
						case 'dc:replaces':
						case 'dc:relation':
							break;
						
						default:
							throw new Exception("Unsupported predicate '$predicate'", Z_ERROR_INVALID_INPUT);
						}
						
						$arr = is_string($object) ? [$object] : $object;
						foreach ($arr as $uri) {
							if (!preg_match('/^http:\/\/zotero.org\/(users|groups)\/[0-9]+\/(publications\/)?items\/[A-Z0-9]{8}$/', $uri)) {
								throw new Exception("'$key' values currently must be Zotero item URIs", Z_ERROR_INVALID_INPUT);
							}
						}
					}
					break;
				
				case 'creators':
					if (!is_array($val)) {
						throw new Exception("'$key' property must be an array", Z_ERROR_INVALID_INPUT);
					}
					
					foreach ($val as $creator) {
						$empty = true;
						
						if (!isset($creator->creatorType)) {
							throw new Exception("creator object must contain 'creatorType'", Z_ERROR_INVALID_INPUT);
						}
						
						if ((!isset($creator->name) || trim($creator->name) == "")
								&& (!isset($creator->firstName) || trim($creator->firstName) == "")
								&& (!isset($creator->lastName) || trim($creator->lastName) == "")) {
							// On item creation, ignore single nameless creator,
							// because that's in the item template that the API returns
							if (sizeOf($val) == 1 && $isNew) {
								continue;
							}
							else {
								throw new Exception("creator object must contain 'firstName'/'lastName' or 'name'", Z_ERROR_INVALID_INPUT);
							}
						}
						
						foreach ($creator as $k=>$v) {
							switch ($k) {
								case 'creatorType':
									$creatorTypeID = Zotero_CreatorTypes::getID($v);
									if (!$creatorTypeID) {
										throw new Exception("'$v' is not a valid creator type", Z_ERROR_INVALID_INPUT);
									}
									$itemTypeID = Zotero_ItemTypes::getID($itemType);
									if (!Zotero_CreatorTypes::isValidForItemType($creatorTypeID, $itemTypeID)) {
										// Allow 'author' in all item types, but reject other invalid creator types
										if ($creatorTypeID != Zotero_CreatorTypes::getID('author')) {
											throw new Exception("'$v' is not a valid creator type for item type '$itemType'", Z_ERROR_INVALID_INPUT);
										}
									}
									break;
								
								case 'firstName':
									if (!isset($creator->lastName)) {
										throw new Exception("'lastName' creator field must be set if 'firstName' is set", Z_ERROR_INVALID_INPUT);
									}
									if (isset($creator->name)) {
										throw new Exception("'firstName' and 'name' creator fields are mutually exclusive", Z_ERROR_INVALID_INPUT);
									}
									break;
								
								case 'lastName':
									if (!isset($creator->firstName)) {
										throw new Exception("'firstName' creator field must be set if 'lastName' is set", Z_ERROR_INVALID_INPUT);
									}
									if (isset($creator->name)) {
										throw new Exception("'lastName' and 'name' creator fields are mutually exclusive", Z_ERROR_INVALID_INPUT);
									}
									break;
								
								case 'name':
									if (isset($creator->firstName)) {
										throw new Exception("'firstName' and 'name' creator fields are mutually exclusive", Z_ERROR_INVALID_INPUT);
									}
									if (isset($creator->lastName)) {
										throw new Exception("'lastName' and 'name' creator fields are mutually exclusive", Z_ERROR_INVALID_INPUT);
									}
									break;
								
								default:
									throw new Exception("Invalid creator property '$k'", Z_ERROR_INVALID_INPUT);
							}
							
							$empty = false;
						}
						
						if ($empty) {
							throw new Exception("Creator object is empty", Z_ERROR_INVALID_INPUT);
						}
					}
					break;
				
				case 'note':
					switch ($itemType) {
						case 'note':
						case 'attachment':
							break;
						
						default:
							throw new Exception("'note' property is valid only for note and attachment items", Z_ERROR_INVALID_INPUT);
					}
					break;
				
				case 'attachments':
				case 'notes':
					if ($apiVersion > 1) {
						throw new Exception("'$key' property is no longer supported", Z_ERROR_INVALID_INPUT);
					}
					
					if (!$isNew) {
						throw new Exception("'$key' property is valid only for new items", Z_ERROR_INVALID_INPUT);
					}
					
					if (!is_array($val)) {
						throw new Exception("'$key' property must be an array", Z_ERROR_INVALID_INPUT);
					}
					
					foreach ($val as $child) {
						// Check child item type ('attachment' or 'note')
						$t = substr($key, 0, -1);
						if (isset($child->itemType) && $child->itemType != $t) {
							throw new Exception("Child $t must be of itemType '$t'", Z_ERROR_INVALID_INPUT);
						}
						if ($key == 'note') {
							if (!isset($child->note)) {
								throw new Exception("'note' property not provided for child note", Z_ERROR_INVALID_INPUT);
							}
						}
					}
					break;
				
				case 'deleted':
					break;
				
				case 'inPublications':
					if ($val && !$isChild && ($itemType == 'note' || $itemType == 'attachment')) {
						throw new Exception(
							"Top-level notes and attachments cannot be added to My Publications",
							Z_ERROR_INVALID_INPUT
						);
					}
					
					if ($val && $itemType == 'attachment') {
						$linkMode = isset($json->linkMode)
							? strtolower($json->linkMode)
							: $item->attachmentLinkMode;
						if ($linkMode == 'linked_file') {
							throw new Exception(
								"Linked-file attachments cannot be added to My Publications",
								Z_ERROR_INVALID_INPUT
							);
						}
					}
					break;
				
				// Attachment properties
				case 'linkMode':
					try {
						$linkMode = Zotero_Attachments::linkModeNumberToName(
							Zotero_Attachments::linkModeNameToNumber($val, true)
						);
					}
					catch (Exception $e) {
						throw new Exception("'$val' is not a valid linkMode", Z_ERROR_INVALID_INPUT);
					}
					// Don't allow changing of linkMode
					if (!$isNew && $linkMode != $item->attachmentLinkMode) {
						throw new Exception("Cannot change attachment linkMode", Z_ERROR_INVALID_INPUT);
					}
					break;
				
				case 'contentType':
				case 'charset':
				case 'filename':
				case 'md5':
				case 'mtime':
				case 'path':
					if ($itemType != 'attachment') {
						throw new Exception("'$key' is valid only for attachment items", Z_ERROR_INVALID_INPUT);
					}
					
					$linkMode = isset($json->linkMode)
						? strtolower($json->linkMode)
						: $item->attachmentLinkMode;
					
					switch ($key) {
						case 'filename':
						case 'md5':
						case 'mtime':
							if (strpos($linkMode, 'imported_') !== 0) {
								throw new Exception("'$key' is valid only for imported attachment items", Z_ERROR_INVALID_INPUT);
							}
							break;
						
						case 'path':
							if ($linkMode != 'linked_file') {
								throw new Exception("'$key' is valid only for linked file attachment items", Z_ERROR_INVALID_INPUT);
							}
							break;
					}
					
					switch ($key) {
						case 'contentType':
						case 'charset':
						case 'filename':
						case 'path':
							$propName = 'attachment' . ucwords($key);
							break;
							
						case 'md5':
							$propName = 'attachmentStorageHash';
							break;
							
						case 'mtime':
							$propName = 'attachmentStorageModTime';
							break;
					}
					
					if (($key == 'mtime' || $key == 'md5') && Zotero_Libraries::getType($libraryID) == 'group') {
						if (($item && $item->$propName !== $val) || (!$item && $val !== null && $val !== "")) {
							throw new Exception("Cannot change '$key' directly in group library", Z_ERROR_INVALID_INPUT);
						}
					}
					else if ($key == 'md5') {
						if ($val && !preg_match("/^[a-f0-9]{32}$/", $val)) {
							throw new Exception("'$val' is not a valid MD5 hash", Z_ERROR_INVALID_INPUT);
						}
					}
					break;
				
				case 'accessDate':
					if ($apiVersion >= 3
							&& $val !== ''
							&& $val != 'CURRENT_TIMESTAMP'
							&& !Zotero_Date::isSQLDate($val)
							&& !Zotero_Date::isSQLDateTime($val)
							&& !Zotero_Date::isISO8601($val)) {
						throw new Exception("'$key' must be in ISO 8601 or UTC 'YYYY-MM-DD[ hh-mm-dd]' format or 'CURRENT_TIMESTAMP' ($val)", Z_ERROR_INVALID_INPUT);
					}
					break;
				
				case 'dateAdded':
					if (!Zotero_Date::isSQLDateTime($val) && !Zotero_Date::isISO8601($val)) {
						throw new Exception("'$key' must be in ISO 8601 or UTC 'YYYY-MM-DD hh-mm-dd' format", Z_ERROR_INVALID_INPUT);
					}
					
					if (!$isNew) {
						// Convert ISO date to SQL date for equality comparison
						if (Zotero_Date::isISO8601($val)) {
							$val = Zotero_Date::iso8601ToSQL($val);
						}
						// Don't allow dateAdded to change
						if ($val != $item->$key) {
							// If passed dateAdded is exactly one hour off, assume it's from a DST bug
							// we haven't yet tracked down (https://github.com/zotero/zotero/issues/1201)
							// and ignore it
							if ((abs(strtotime($val) - strtotime($item->$key)) == 3600)
									// Allow for Quick Start Guide items from <=4.0
									|| $item->key == 'ABCD2345' || $item->key == 'ABCD3456') {
								$json->$key = $item->$key;
							}
							else {
								throw new Exception("'$key' cannot be modified for existing items", Z_ERROR_INVALID_INPUT);
							}
						}
					}
					break;
				
				case 'dateModified':
					if (!Zotero_Date::isSQLDateTime($val) && !Zotero_Date::isISO8601($val)) {
						throw new Exception("'$key' must be in ISO 8601 or UTC 'YYYY-MM-DD hh-mm-dd' format ($val)", Z_ERROR_INVALID_INPUT);
					}
					break;
				
				default:
					if (!Zotero_ItemFields::getID($key)) {
						throw new Exception("Invalid property '$key'", Z_ERROR_INVALID_INPUT);
					}
					if (is_array($val)) {
						throw new Exception("Unexpected array for property '$key'", Z_ERROR_INVALID_INPUT);
					}
					
					break;
			}
		}
	}
	
	
	private static function validateJSONURL($json) {
		if (!is_object($json)) {
			throw new Exception("Unexpected " . gettype($json) . " '" . $json . "'", Z_ERROR_INVALID_INPUT);
		}
		
		if (!isset($json->url)) {
			throw new Exception("URL not provided");
		}
		
		if (!is_string($json->url)) {
			throw new Exception("'url' must be a string", Z_ERROR_INVALID_INPUT);
		}
		
		if (isset($json->items) && !is_object($json->items)) {
			throw new Exception("'items' must be an object", Z_ERROR_INVALID_INPUT);
		}
		
		if (isset($json->token) && !is_string($json->token)) {
			throw new Exception("Invalid token", Z_ERROR_INVALID_INPUT);
		}
		
		foreach ($json as $key => $val) {
			if (!in_array($key, array('url', 'token', 'items'))) {
				throw new Exception("Invalid property '$key'", Z_ERROR_INVALID_INPUT);
			}
			
			if ($key == 'items' && sizeOf($val) > Zotero_API::$maxTranslateItems) {
				throw new Exception("Cannot translate more than " . Zotero_API::$maxTranslateItems . " items at a time", Z_ERROR_UPLOAD_TOO_LARGE);
			}
		}
	}
	
	
	private static function loadItems($libraryID, $itemIDs=array()) {
		$shardID = Zotero_Shards::getByLibraryID($libraryID);
		
		$sql = self::getPrimaryDataSQL() . "1";
		
		// TODO: optimize
		if ($itemIDs) {
			foreach ($itemIDs as $itemID) {
				if (!is_int($itemID)) {
					throw new Exception("Invalid itemID $itemID");
				}
			}
			$sql .= ' AND itemID IN ('
					. implode(',', array_fill(0, sizeOf($itemIDs), '?'))
					. ')';
		}
		
		$stmt = Zotero_DB::getStatement($sql, "loadItems_" . sizeOf($itemIDs), $shardID);
		$itemRows = Zotero_DB::queryFromStatement($stmt, $itemIDs);
		$loadedItemIDs = array();
		
		if ($itemRows) {
			foreach ($itemRows as $row) {
				if ($row['libraryID'] != $libraryID) {
					throw new Exception("Item $itemID isn't in library $libraryID", Z_ERROR_OBJECT_LIBRARY_MISMATCH);
				}
				
				$itemID = $row['id'];
				$loadedItemIDs[] = $itemID;
				
				// Item isn't loaded -- create new object and stuff in array
				if (!isset(self::$objectCache[$itemID])) {
					$item = new Zotero_Item;
					$item->loadFromRow($row, true);
					self::$objectCache[$itemID] = $item;
				}
				// Existing item -- reload in place
				else {
					self::$objectCache[$itemID]->loadFromRow($row, true);
				}
			}
		}
		
		if (!$itemIDs) {
			// If loading all items, remove old items that no longer exist
			$ids = array_keys(self::$objectCache);
			foreach ($ids as $id) {
				if (!in_array($id, $loadedItemIDs)) {
					throw new Exception("Unimplemented");
					//$this->unload($id);
				}
			}
		}
	}
	
	
	public static function getSortTitle($title) {
		if (!$title) {
			return '';
		}
		return mb_strcut(preg_replace('/^[[({\-"\'“‘ ]+(.*)[\])}\-"\'”’ ]*?$/Uu', '$1', $title), 0, Zotero_Notes::$MAX_TITLE_LENGTH);
	}
}

Zotero_Items::init();
