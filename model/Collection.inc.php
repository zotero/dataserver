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

class Zotero_Collection extends Zotero_DataObject {
	protected $objectType = 'collection';
	protected $dataTypesExtended = ['childCollections', 'childItems', 'relations'];
	
	protected $_name;
	protected $_dateAdded;
	protected $_dateModified;
	
	private $_hasChildCollections;
	private $childCollections = [];
	
	private $_hasChildItems;
	private $childItems = [];
	
	public function __get($field) {
		switch ($field) {
		case 'relations':
			return $this->getRelations();
		
		case 'etag':
			return $this->getETag();
		
		default:
			return parent::__get($field);
		}
	}
	
	
	/**
	 * Check if collection exists in the database
	 *
	 * @return	bool			TRUE if the item exists, FALSE if not
	 */
	public function exists() {
		if (!$this->id) {
			trigger_error('$this->id not set');
		}
		
		$sql = "SELECT COUNT(*) FROM collections WHERE collectionID=?";
		return !!Zotero_DB::valueQuery($sql, $this->id, Zotero_Shards::getByLibraryID($this->libraryID));
	}
	
	
	public function save($userID=false) {
		if (!$this->_libraryID) {
			trigger_error("Library ID must be set before saving", E_USER_ERROR);
		}
		
		Zotero_Collections::editCheck($this, $userID);
		
		if (!$this->hasChanged()) {
			Z_Core::debug("Collection $this->_id has not changed");
			return false;
		}
		
		$env = [];
		$isNew = $env['isNew'] = !$this->_id;
		
		Zotero_DB::beginTransaction();
		
		try {
			$collectionID = $env['id'] = $this->_id = $this->_id ? $this->_id : Zotero_ID::get('collections');
			
			Z_Core::debug("Saving collection $this->_id");
			
			$key = $env['key'] = $this->_key = $this->_key ? $this->_key : Zotero_ID::getKey();
			
			$timestamp = Zotero_DB::getTransactionTimestamp();
			$dateAdded = $this->_dateAdded ? $this->_dateAdded : $timestamp;
			$dateModified = $this->_dateModified ? $this->_dateModified : $timestamp;
			$version = Zotero_Libraries::getUpdatedVersion($this->_libraryID);
			
			// Verify parent
			if ($this->_parentKey) {
				$newParentCollection = Zotero_Collections::getByLibraryAndKey(
					$this->_libraryID, $this->_parentKey
				);
				
				if (!$newParentCollection) {
					// TODO: clear caches
					throw new Exception(
						"Parent collection $this->_libraryID/$this->_parentKey doesn't exist",
						Z_ERROR_COLLECTION_NOT_FOUND
					);
				}
				
				if (!$isNew) {
					if ($newParentCollection->id == $collectionID) {
						trigger_error("Cannot move collection $this->_id into itself!", E_USER_ERROR);
					}
					
					// If the designated parent collection is already within this
					// collection (which shouldn't happen), move it to the root
					if (!$isNew && $this->hasDescendent('collection', $newParentCollection->id)) {
						$newParentCollection->parentKey = null;
						$newParentCollection->save();
					}
				}
				
				$parent = $newParentCollection->id;
			}
			else {
				$parent = null;
			}
			
			$fields = "collectionName=?, parentCollectionID=?, libraryID=?, `key`=?,
						dateAdded=?, dateModified=?, serverDateModified=?, version=?";
			$params = array(
				$this->_name,
				$parent,
				$this->_libraryID,
				$key,
				$dateAdded,
				$dateModified,
				$timestamp,
				$version
			);
			
			$params = array_merge(array($collectionID), $params, $params);
			$shardID = Zotero_Shards::getByLibraryID($this->_libraryID);
			
			$sql = "INSERT INTO collections SET collectionID=?, $fields
					ON DUPLICATE KEY UPDATE $fields";
			Zotero_DB::query($sql, $params, $shardID);
			
			// Remove from delete log if it's there
			$sql = "DELETE FROM syncDeleteLogKeys WHERE libraryID=? AND objectType='collection' AND `key`=?";
			Zotero_DB::query($sql, array($this->_libraryID, $key), $shardID);
			
			Zotero_DB::commit();
			
			if (!empty($this->changed['parentKey'])) {
				$objectsClass = $this->objectsClass;
				
				// Add this item to the parent's cached item lists after commit,
				// if the parent was loaded
				if ($this->_parentKey) {
					$parentCollectionID = $objectsClass::getIDFromLibraryAndKey(
						$this->_libraryID, $this->_parentKey
					);
					$objectsClass::registerChildCollection($parentCollectionID, $collectionID);
				}
				// Remove this from the previous parent's cached collection lists
				// if the parent was loaded
				else if (!$isNew && !empty($this->previousData['parentKey'])) {
					$parentCollectionID = $objectsClass::getIDFromLibraryAndKey(
						$this->_libraryID, $this->previousData['parentKey']
					);
					$objectsClass::unregisterChildCollection($parentCollectionID, $collectionID);
				}
			}
			
			// Related items
			if (!empty($this->changed['relations'])) {
				$removed = [];
				$new = [];
				$current = $this->relations;
				
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
				
				$uri = Zotero_URI::getCollectionURI($this);
				
				if ($removed) {
					$sql = "DELETE FROM relations WHERE libraryID=? AND `key`=?";
					$deleteStatement = Zotero_DB::getStatement($sql, false, $shardID);
					
					foreach ($removed as $rel) {
						$params = [
							$this->_libraryID,
							Zotero_Relations::makeKey($uri, $rel[0], $rel[1])
						];
						$deleteStatement->execute($params);
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
								$this->_libraryID,
								Zotero_Relations::makeKey($uri, $rel[0], $rel[1]),
								$uri,
								$rel[0],
								$rel[1]
							)
						);
					}
				}
			}
		}
		catch (Exception $e) {
			Zotero_DB::rollback();
			throw ($e);
		}
		
		$this->finalizeSave($env);
		
		return $isNew ? $this->_id : true;
	}
	
	
	/**
	 * Update the collection's version without changing any data
	 */
	public function updateVersion($userID) {
		$this->changed['primaryData'] = true;
		$this->save($userID);
	}
	
	
	/**
	 * Returns child collections
	 *
	 * @return {Integer[]}	Array of collectionIDs
	 */
	public function getChildCollections() {
		$this->loadChildCollections();
		return $this->childCollections;
	}
	
	
	/*
	public function setChildCollections($collectionIDs) {
		Zotero_DB::beginTransaction();
		
		if (!$this->childCollectionsLoaded) {
			$this->loadChildCollections();
		}
		
		$current = $this->childCollections;
		$removed = array_diff($current, $collectionIDs);
		$new = array_diff($collectionIDs, $current);
		
		if ($removed) {
			$sql = "UPDATE collections SET parentCollectionID=NULL
					WHERE userID=? AND collectionID IN (";
			$q = array();
			$params = array($this->userID, $this->id);
			foreach ($removed as $collectionID) {
				$q[] = '?';
				$params[] = $collectionID;
			}
			$sql .= implode(',', $q) . ")";
			Zotero_DB::query($sql, $params);
		}
		
		if ($new) {
			$sql = "UPDATE collections SET parentCollectionID=?
					WHERE userID=? AND collectionID IN (";
			$q = array();
			$params = array($this->userID);
			foreach ($new as $collectionID) {
				$q[] = '?';
				$params[] = $collectionID;
			}
			$sql .= implode(',', $q) . ")";
			Zotero_DB::query($sql, $params);
		}
		
		$this->childCollections = $new;
		
		Zotero_DB::commit();
	}
	*/
	
	
	public function numCollections() {
		if ($this->loaded['childCollections']) {
			return sizeOf($this->childCollections);
		}
		$sql = "SELECT COUNT(*) FROM collections WHERE parentCollectionID=?";
		$num = Zotero_DB::valueQuery($sql, $this->id, Zotero_Shards::getByLibraryID($this->libraryID));
		return $num;
	}
	
	
	public function numItems($includeDeleted=false) {
		$sql = "SELECT COUNT(*) FROM collectionItems ";
		if (!$includeDeleted) {
			$sql .= "LEFT JOIN deletedItems DI USING (itemID)";
		}
		$sql .= "WHERE collectionID=?";
		if (!$includeDeleted) {
			$sql .= " AND DI.itemID IS NULL";
		}
		return Zotero_DB::valueQuery($sql, $this->id, Zotero_Shards::getByLibraryID($this->libraryID));
	}
	
	
	/**
	 * Returns child items
	 *
	 * @return {Integer[]}	Array of itemIDs
	 */
	public function getItems($includeChildItems=false) {
		$this->loadChildItems();
		
		if ($includeChildItems) {
			$sql = "(SELECT INo.itemID FROM itemNotes INo "
				. "JOIN items I ON (INo.sourceItemID=I.itemID) "
				. "JOIN collectionItems CI ON (I.itemID=CI.itemID) "
				. "WHERE collectionID=?)"
				. " UNION "
				. "(SELECT IA.itemID FROM itemAttachments IA "
				. "JOIN items I ON (IA.sourceItemID=I.itemID) "
				. "JOIN collectionItems CI ON (I.itemID=CI.itemID) "
				. "WHERE collectionID=?)";
			$childItemIDs = Zotero_DB::columnQuery(
				$sql, array($this->id, $this->id), Zotero_Shards::getByLibraryID($this->libraryID)
			);
			if ($childItemIDs) {
				return array_merge($this->childItems, $childItemIDs);
			}
		}
		
		return $this->childItems;
	}
	
	
	public function setItems($itemIDs) {
		$shardID = Zotero_Shards::getByLibraryID($this->libraryID);
		
		Zotero_DB::beginTransaction();
		
		$this->loadChildItems();
		
		$current = $this->childItems;
		$removed = array_diff($current, $itemIDs);
		$new = array_diff($itemIDs, $current);
		
		if ($removed) {
			$arr = $removed;
			$sql = "DELETE FROM collectionItems WHERE collectionID=? AND itemID IN (";
			while ($chunk = array_splice($arr, 0, 500)) {
				array_unshift($chunk, $this->id);
				Zotero_DB::query(
					$sql . implode(', ', array_fill(0, sizeOf($chunk) - 1, '?')) . ")",
					$chunk,
					$shardID
				);
			}
		}
		
		if ($new) {
			$arr = $new;
			$sql = "INSERT INTO collectionItems (collectionID, itemID) VALUES ";
			while ($chunk = array_splice($arr, 0, 250)) {
				Zotero_DB::query(
					$sql . implode(',', array_fill(0, sizeOf($chunk), '(?,?)')),
					call_user_func_array(
						'array_merge',
						array_map(function ($itemID) {
							return [$this->id, $itemID];
						}, $chunk)
					),
					$shardID
				);
			}
		}
		
		$this->childItems = array_values(array_unique($itemIDs));
		
		//
		// TODO: remove UPDATE statements below once classic syncing is removed
		//
		// Update timestamp of collection
		$sql = "UPDATE collections SET serverDateModified=? WHERE collectionID=?";
		$ts = Zotero_DB::getTransactionTimestamp();
		Zotero_DB::query($sql, array($ts, $this->id), $shardID);
		
		// Update version of new and removed items
		if ($new || $removed) {
			$sql = "UPDATE items SET version=? WHERE itemID IN ("
				. implode(', ', array_fill(0, sizeOf($new) + sizeOf($removed), '?'))
				. ")";
			Zotero_DB::query(
				$sql,
				array_merge(
					array(Zotero_Libraries::getUpdatedVersion($this->libraryID)),
					$new,
					$removed
				),
				$shardID
			);
		}
		
		Zotero_DB::commit();
	}
	
	
	/**
	 * Add an item to the collection. The item's version must be updated
	 * separately.
	 */
	public function addItem($itemID) {
		if ($this->hasItem($itemID)) {
			Z_Core::debug("Item $itemID is already a child of collection $this->id");
			return;
		}
		
		$this->setItems(array_merge($this->getItems(), array($itemID)));
	}
	
	
	/**
	 * Add items to the collection. The items' versions must be updated
	 * separately.
	 */
	public function addItems($itemIDs) {
		$items = array_merge($this->getItems(), $itemIDs);
		$this->setItems($items);
	}
	
	
	/**
	 * Remove an item from the collection. The item's version must be updated
	 * separately.
	 */
	public function removeItem($itemID) {
		if (!$this->hasItem($itemID)) {
			Z_Core::debug("Item $itemID is not a child of collection $this->id");
			return false;
		}
		
		$items = $this->getItems();
		array_splice($items, array_search($itemID, $items), 1);
		$this->setItems($items);
		
		return true;
	}

	
	
	/**
	 * Check if an item belongs to the collection
	 */
	public function hasItem($itemID) {
		$this->loadChildItems();
		return in_array($itemID, $this->childItems);
	}
	
	
	public function hasDescendent($type, $id) {
		$descendents = $this->getChildren(true, false, $type);
		for ($i=0, $len=sizeOf($descendents); $i<$len; $i++) {
			if ($descendents[$i]['id'] == $id) {
				return true;
			}
		}
		return false;
	}
	
	
	/**
	 * Returns an array of descendent collections and items
	 *	(rows of 'id', 'type' ('item' or 'collection'), 'parent', and,
	 * 	if collection, 'name' and the nesting 'level')
	 *
	 * @param	bool		$recursive	Descend into subcollections
	 * @param	bool		$nested		Return multidimensional array with 'children'
	 *									nodes instead of flat array
	 * @param	string	$type		'item', 'collection', or FALSE for both
	 */
	public function getChildren($recursive=false, $nested=false, $type=false, $level=1) {
		$toReturn = array();
		
		// 0 == collection
		// 1 == item
		$children = Zotero_DB::query('SELECT collectionID AS id, 
				0 AS type, collectionName AS collectionName, `key`
				FROM collections WHERE parentCollectionID=?
				UNION SELECT itemID AS id, 1 AS type, NULL AS collectionName, `key`
				FROM collectionItems JOIN items USING (itemID) WHERE collectionID=?',
				array($this->id, $this->id),
				Zotero_Shards::getByLibraryID($this->libraryID)
		);
		
		if ($type) {
			switch ($type) {
				case 'item':
				case 'collection':
					break;
				default:
					throw ("Invalid type '$type'");
			}
		}
		
		for ($i=0, $len=sizeOf($children); $i<$len; $i++) {
			// This seems to not work without parseInt() even though
			// typeof children[i]['type'] == 'number' and
			// children[i]['type'] === parseInt(children[i]['type']),
			// which sure seems like a bug to me
			switch ($children[$i]['type']) {
				case 0:
					if (!$type || $type == 'collection') {
						$toReturn[] = array(
							'id' => $children[$i]['id'],
							'name' =>  $children[$i]['collectionName'],
							'key' => $children[$i]['key'],
							'type' =>  'collection',
							'level' =>  $level,
							'parent' =>  $this->id
						);
					}
					
					if ($recursive) {
						$col = Zotero_Collections::getByLibraryAndKey($this->libraryID, $children[$i]['key']);
						$descendents = $col->getChildren(true, $nested, $type, $level+1);
						
						if ($nested) {
							$toReturn[sizeOf($toReturn) - 1]['children'] = $descendents;
						}
						else {
							for ($j=0, $len2=sizeOf($descendents); $j<$len2; $j++) {
								$toReturn[] = $descendents[$j];
							}
						}
					}
				break;
				
				case 1:
					if (!$type || $type == 'item') {
						$toReturn[] = array(
							'id' => $children[$i]['id'],
							'key' => $children[$i]['key'],
							'type' => 'item',
							'parent' => $this->id
						);
					}
				break;
			}
		}
		
		return $toReturn;
	}
	
	
	//
	// Methods dealing with relations
	//
	// save() is not required for relations functions
	//
	/**
	 * Returns all relations of the collection
	 *
	 * @return object Object with predicates as keys and URIs as values
	 */
	public function getRelations() {
		if (!$this->_id) {
			return array();
		}
		$relations = Zotero_Relations::getByURIs(
			$this->libraryID,
			Zotero_URI::getCollectionURI($this)
		);
		
		$toReturn = new stdClass;
		foreach ($relations as $relation) {
			$toReturn->{$relation->predicate} = $relation->object;
		}
		return $toReturn;
	}
	
	
	/**
	 * Returns all tags assigned to items in this collection
	 */
	public function getTags($asIDs=false) {
		$sql = "SELECT tagID FROM tags JOIN itemTags USING (tagID)
				JOIN collectionItems USING (itemID) WHERE collectionID=? ORDER BY name";
		$tagIDs = Zotero_DB::columnQuery($sql, $this->id, Zotero_Shards::getByLibraryID($this->libraryID));
		if (!$tagIDs) {
			return false;
		}
		
		if ($asIDs) {
			return $tagIDs;
		}
		
		$tagObjs = array();
		foreach ($tagIDs as $tagID) {
			$tag = Zotero_Tags::get($tagID, true);
			$tagObjs[] = $tag;
		}
		return $tagObjs;
	}
	
	
	/*
	 * Returns an array keyed by tagID with the number of linked items for each tag
	 * in this collection
	 */
	public function getTagItemCounts() {
		$sql = "SELECT tagID, COUNT(*) AS numItems FROM tags JOIN itemTags USING (tagID)
				JOIN collectionItems USING (itemID) WHERE collectionID=? GROUP BY tagID";
		$rows = Zotero_DB::query($sql, $this->id, Zotero_Shards::getByLibraryID($this->libraryID));
		if (!$rows) {
			return false;
		}
		
		$counts = array();
		foreach ($rows as $row) {
			$counts[$row['tagID']] = $row['numItems'];
		}
		return $counts;
	}
	
	
	public function toResponseJSON($requestParams=[]) {
		$t = microtime(true);
		
		// Child collections and items can't be cached (easily)
		$numCollections = $this->numCollections();
		$numItems = $this->numItems();
		
		if (!$requestParams['uncached']) {
			$cacheKey = $this->getCacheKey($requestParams);
			$cached = Z_Core::$MC->get($cacheKey);
			if ($cached) {
				Z_Core::debug("Using cached JSON for $this->libraryKey");
				$cached['meta']->numCollections = $numCollections;
				$cached['meta']->numItems = $numItems;
				
				StatsD::timing("api.collections.toResponseJSON.cached", (microtime(true) - $t) * 1000);
				StatsD::increment("memcached.collections.toResponseJSON.hit");
				return $cached;
			}
		}
		
		$json = [
			'key' => $this->key,
			'version' => $this->version,
			'library' => Zotero_Libraries::toJSON($this->libraryID)
		];
		
		// 'links'
		$json['links'] = [
			'self' => [
				'href' => Zotero_API::getCollectionURI($this),
				'type' => 'application/json'
			],
			'alternate' => [
				'href' => Zotero_URI::getCollectionURI($this, true),
				'type' => 'text/html'
			]
		];
		
		$parentID = $this->getParentID();
		if ($parentID) {
			$parentCol = Zotero_Collections::get($this->libraryID, $parentID);
			$json['links']['up'] = [
				'href' => Zotero_API::getCollectionURI($parentCol),
				'type' => "application/atom+xml"
			];
		}
		
		// 'meta'
		$json['meta'] = new stdClass;
		$json['meta']->numCollections = $numCollections;
		$json['meta']->numItems = $numItems;
		
		// 'include'
		$include = $requestParams['include'];
		
		foreach ($include as $type) {
			if ($type == 'data') {
				$json[$type] = $this->toJSON($requestParams);
			}
		}
		
		if (!$requestParams['uncached']) {
			Z_Core::$MC->set($cacheKey, $json);
			
			StatsD::timing("api.collections.toResponseJSON.uncached", (microtime(true) - $t) * 1000);
			StatsD::increment("memcached.collections.toResponseJSON.miss");
		}
		
		return $json;
	}
	
	
	public function toJSON(array $requestParams=[]) {
		if (!$this->loaded) {
			$this->load();
		}
		
		if ($requestParams['v'] >= 3) {
			$arr['key'] = $this->key;
			$arr['version'] = $this->version;
		}
		else {
			$arr['collectionKey'] = $this->key;
			$arr['collectionVersion'] = $this->version;
		}
		
		$arr['name'] = $this->name;
		$parentKey = $this->getParentKey();
		if ($requestParams['v'] >= 2) {
			$arr['parentCollection'] = $parentKey ? $parentKey : false;
			$arr['relations'] = $this->getRelations();
		}
		else {
			$arr['parent'] = $parentKey ? $parentKey : false;
		}
		
		return $arr;
	}
	
	
	protected function loadChildCollections($reload = false) {
		if ($this->loaded['childCollections'] && !$reload) return;
		
		Z_Core::debug("Loading subcollections for collection $this->id");
		
		if (!$this->id) {
			trigger_error('$this->id not set', E_USER_ERROR);
		}
		
		$sql = "SELECT collectionID FROM collections WHERE parentCollectionID=?";
		$ids = Zotero_DB::columnQuery($sql, $this->id, Zotero_Shards::getByLibraryID($this->libraryID));
		
		$this->childCollections = $ids ? $ids : [];
		$this->loaded['childCollections'] = true;
		$this->clearChanged('childCollections');
	}
	
	
	protected function loadChildItems($reload = false) {
		if ($this->loaded['childItems'] && !$reload) return;
		
		Z_Core::debug("Loading child items for collection $this->id");
		
		if (!$this->id) {
			trigger_error('$this->id not set', E_USER_ERROR);
		}
		
		$sql = "SELECT itemID FROM collectionItems WHERE collectionID=?";
		$ids = Zotero_DB::columnQuery($sql, $this->id, Zotero_Shards::getByLibraryID($this->libraryID));
		
		$this->childItems = $ids ? $ids : [];
		
		$this->loaded['childItems'] = true;
		$this->clearChanged('childItems');
	}
	
	
	/**
	 * Add a collection to the cached child collections list if loaded
	 */
	public function registerChildCollection($collectionID) {
		if ($this->loaded['childCollections']) {
			$collection = Zotero_Collections::get($this->libraryID, $collectionID);
			if ($collection) {
				$this->_hasChildCollections = true;
				$this->childCollections[] = $collection;
			}
		}
	}
	
	
	/**
	 * Remove a collection from the cached child collections list if loaded
	 */
	public function unregisterChildCollection($collectionID) {
		if ($this->loaded['childCollections']) {
			for ($i = 0; $i < sizeOf($this->childCollections); $i++) {
				if ($this->childCollections[$i]->id == $collectionID) {
					unset($this->childCollections[$i]);
					break;
				}
			}
			$this->_hasChildCollections = !!$this->childCollections;
		}
	}
	
	
	/**
	 * Add an item to the cached child items list if loaded
	 */
	public function registerChildItem($itemID) {
		if ($this->loaded['childItems']) {
			$item = Zotero_Items::get($this->libraryID, $itemID);
			if ($item) {
				$this->_hasChildItems = true;
				$this->childItems[] = $item;
			}
		}
	}
	
	
	/**
	 * Remove an item from the cached child items list if loaded
	 */
	public function unregisterChildItem($itemID) {
		if ($this->loaded['childItems']) {
			for ($i = 0; $i < sizeOf($this->childItems); $i++) {
				if ($this->childItems[$i]->id == $itemID) {
					unset($this->childItems[$i]);
					break;
				}
			}
			$this->_hasChildItems = !!$this->childItems;
		}
	}
	
	
	protected function loadRelations($reload = false) {
		if ($this->loaded['relations'] && !$reload) return;
		
		if (!$this->id) {
			return;
		}
		
		Z_Core::debug("Loading relations for collection $this->id");
		
		if (!$this->loaded) {
			$this->load();
		}
		
		$collectionURI = Zotero_URI::getCollectionURI($this);
		
		$relations = Zotero_Relations::getByURIs($this->libraryID, $collectionURI);
		$relations = array_map(function ($rel) {
			return [$rel->predicate, $rel->object];
		}, $relations);
		
		$this->relations = $relations;
		$this->loaded['relations'] = true;
		$this->clearChanged('relations');
	}
	
	
	protected function checkValue($field, $value) {
		parent::checkValue($field, $value);
		
		switch ($field) {
			case 'name':
				if (mb_strlen($value) > Zotero_Collections::$maxLength) {
					throw new Exception("Collection '" . $value . "' too long", Z_ERROR_COLLECTION_TOO_LONG);
				}
				break;
		}
	}
	
	
	private function getCacheKey($requestParams) {
		$cacheKey = implode("\n", [
			$this->libraryID,
			$this->key,
			$this->version,
			implode(',', $requestParams['include']),
			$requestParams['v']
		]);
		return md5($cacheKey);
	}
	
	
	private function getETag() {
		if (!$this->loaded) {
			$this->load();
		}
		
		return md5($this->name . "_" . $this->getParentID());
	}
	
	
	private function invalidValueError($field, $value) {
		trigger_error("Invalid '$field' value '$value'", E_USER_ERROR);
	}
}
?>
