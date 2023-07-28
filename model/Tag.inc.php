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

class Zotero_Tag {
	private $id;
	private $libraryID;
	private $itemID;
	private $name;
	private $type;
	private $version;
	
	private $changed;
	private $previousData;
	
	private $linkedItemsLoaded = false;
	private $linkedItems = array();
	
	public function __construct($id, $libraryID, $itemID, $name, $type, $version) {
		$this->id = $id;
		$this->libraryID = $libraryID;
		$this->itemID = $itemID;
		$this->name = $name;
		$this->type = $type;
		$this->version = $version;

		$this->previousData = array();
		$this->linkedItemsLoaded = false;
		
		$this->changed = array();
		$props = array(
			'name',
			'type',
			'linkedItems'
		);
		foreach ($props as $prop) {
			$this->changed[$prop] = false;
		}
	}
	
	public function __get($field) {
		
		if (!property_exists('Zotero_Tag', $field)) {
			throw new Exception("Zotero_Tag property '$field' doesn't exist");
		}
		
		return $this->$field;
	}
	
	
	public function __set($field, $value) {
		switch ($field) {
			case 'id':
			case 'libraryID':
			case 'itemID':
				$this->checkValue($field, $value);
				$this->$field = $value;
				return;
		}
		
		
		$this->checkValue($field, $value);
		
		if ($this->$field != $value) {
			$this->prepFieldChange($field);
			$this->$field = $value;
		}
	}
	
	
	
	
	public function addItem($key) {
		$current = $this->getLinkedItems(true);
		if (in_array($key, $current)) {
			Z_Core::debug("Item $key already has tag {$this->libraryID}/{$this->key}");
			return false;
		}
		
		$this->prepFieldChange('linkedItems');
		$this->linkedItems[] = $key;
		return true;
	}
	
	
	public function removeItem($key) {
		$current = $this->getLinkedItems(true);
		$index = array_search($key, $current);
		
		if ($index === false) {
			Z_Core::debug("Item {$this->libraryID}/$key doesn't have tag {$this->key}");
			return false;
		}
		
		$this->prepFieldChange('linkedItems');
		array_splice($this->linkedItems, $index, 1);
		return true;
	}
	
	
	public function hasChanged() {
		// Exclude 'dateg' from test
		$changed = $this->changed;
		// if (!empty($changed['dateModified'])) {
		// 	unset($changed['dateModified']);
		// }
		return in_array(true, array_values($changed));
	}
	
	
	public function save($userID=false, $full=false) {
		if (!$this->libraryID) {
			trigger_error("Library ID must be set before saving", E_USER_ERROR);
		}
		
		Zotero_Tags::editCheck($this, $userID);
		
		if (!$this->hasChanged()) {
			Z_Core::debug("Tag $this->id has not changed");
			return false;
		}
		
		$shardID = Zotero_Shards::getByLibraryID($this->libraryID);
		
		Zotero_DB::beginTransaction();
		
		try {
			$tagID = $this->id ? $this->id : Zotero_ID::get('tags');
			$isNew = !$this->id;
			
			Z_Core::debug("Saving tag $tagID");
			
			$key = $this->key ? $this->key : Zotero_ID::getKey();
			$timestamp = Zotero_DB::getTransactionTimestamp();
			$dateAdded = $this->dateAdded ? $this->dateAdded : $timestamp;
			$version = ($this->changed['name'] || $this->changed['type'])
				? Zotero_Libraries::getUpdatedVersion($this->libraryID)
				: $this->version;
			
			$fields = "name=?, itemID=?, `type`=?, version=?";
			$params = array(
				$this->name,
				$this->itemID,
				$this->type ? $this->type : 0,
				$version
			);
			
			try {
				if ($isNew) {
					$sql = "INSERT INTO tags SET tagID=?, $fields";
					$stmt = Zotero_DB::getStatement($sql, true, $shardID);
					Zotero_DB::queryFromStatement($stmt, array_merge(array($tagID), $params));
					
					// Remove from delete log if it's there
					$sql = "DELETE FROM syncDeleteLogKeys WHERE libraryID=?
					        AND objectType='tag' AND `key`=?";
					Zotero_DB::query(
						$sql, array($this->libraryID, $key), $shardID
					);
					$sql = "DELETE FROM syncDeleteLogKeys WHERE libraryID=?
					        AND objectType='tagName' AND `key`=?";
					Zotero_DB::query(
						$sql, array($this->libraryID, $this->name), $shardID
					);
				}
				else {
					$sql = "UPDATE tags SET $fields WHERE tagID=?";
					$stmt = Zotero_DB::getStatement($sql, true, Zotero_Shards::getByLibraryID($this->libraryID));
					Zotero_DB::queryFromStatement($stmt, array_merge($params, array($tagID)));
				}
			}
			catch (Exception $e) {
				// If an incoming tag is the same as an existing tag, but with a different key,
				// then delete the old tag and add its linked items to the new tag
				if (preg_match("/Duplicate entry .+ for key 'uniqueTags'/", $e->getMessage())) {
					// GET existing tag
					$existing = Zotero_Tags::getIDs($this->libraryID, $this->name);
					if (!$existing) {
						throw new Exception("Existing tag not found");
					}
					foreach ($existing as $id) {
						$tag = Zotero_Tags::get($this->libraryID, $id, true);
						if ($tag->__get('type') == $this->type) {
							$linked = $tag->getLinkedItems(true);
							Zotero_Tags::delete($this->libraryID, $tag->key);
							break;
						}
					}
					
					// Save again
					if ($isNew) {
						$sql = "INSERT INTO tags SET tagID=?, $fields";
						$stmt = Zotero_DB::getStatement($sql, true, $shardID);
						Zotero_DB::queryFromStatement($stmt, array_merge(array($tagID), $params));
						
						// Remove from delete log if it's there
						$sql = "DELETE FROM syncDeleteLogKeys WHERE libraryID=?
						        AND objectType='tag' AND `key`=?";
						Zotero_DB::query(
							$sql, array($this->libraryID, $key), $shardID
						);
						$sql = "DELETE FROM syncDeleteLogKeys WHERE libraryID=?
						        AND objectType='tagName' AND `key`=?";
						Zotero_DB::query(
							$sql, array($this->libraryID, $this->name), $shardID
						);

					}
					else {
						$sql = "UPDATE tags SET $fields WHERE tagID=?";
						$stmt = Zotero_DB::getStatement($sql, true, Zotero_Shards::getByLibraryID($this->libraryID));
						Zotero_DB::queryFromStatement($stmt, array_merge($params, array($tagID)));
					}
					
					$new = array_unique(array_merge($linked, $this->getLinkedItems(true)));
					$this->setLinkedItems($new);
				}
				else {
					throw $e;
				}
			}
			
			// Linked items
			if ($full || $this->changed['linkedItems']) {
				$removeKeys = array();
				$currentKeys = $this->getLinkedItems(true);
				
				if ($full) {
					$sql = "SELECT `key` FROM itemTags JOIN items "
						. "USING (itemID) WHERE tagID=?";
					$stmt = Zotero_DB::getStatement($sql, true, $shardID);
					$dbKeys = Zotero_DB::columnQueryFromStatement($stmt, $tagID);
					if ($dbKeys) {
						$removeKeys = array_diff($dbKeys, $currentKeys);
						$newKeys = array_diff($currentKeys, $dbKeys);
					}
					else {
						$newKeys = $currentKeys;
					}
				}
				else {
					if (!empty($this->previousData['linkedItems'])) {
						$removeKeys = array_diff(
							$this->previousData['linkedItems'], $currentKeys
						);
						$newKeys = array_diff(
							$currentKeys, $this->previousData['linkedItems']
						);
					}
					else {
						$newKeys = $currentKeys;
					}
				}
				
				if ($removeKeys) {
					$sql = "DELETE itemTags FROM itemTags JOIN items USING (itemID) "
						. "WHERE tagID=? AND items.key IN ("
						. implode(', ', array_fill(0, sizeOf($removeKeys), '?'))
						. ")";
					Zotero_DB::query(
						$sql,
						array_merge(array($this->id), $removeKeys),
						$shardID
					);
				}
				
				if ($newKeys) {
					$sql = "INSERT INTO itemTags (tagID, itemID) "
						. "SELECT ?, itemID FROM items "
						. "WHERE libraryID=? AND `key` IN ("
						. implode(', ', array_fill(0, sizeOf($newKeys), '?'))
						. ")";
					Zotero_DB::query(
						$sql,
						array_merge(array($tagID, $this->libraryID), $newKeys),
						$shardID
					);
				}
				
				//Zotero.Notifier.trigger('add', 'collection-item', $this->id . '-' . $itemID);
			}
			
			Zotero_DB::commit();
			
		}
		catch (Exception $e) {
			Zotero_DB::rollback();
			throw ($e);
		}
		
		// If successful, set values in object
		if (!$this->id) {
			$this->id = $tagID;
		}
		if (!$this->key) {
			$this->key = $key;
		}
		
		$this->init();
		
		if ($isNew) {
			Zotero_Tags::cache($this);
		}
		
		return $this->id;
	}
	
	
	public function getLinkedItems($asKeys=false) {
		if (!$this->linkedItemsLoaded) {
			$this->loadLinkedItems();
		}
		
		if ($asKeys) {
			return $this->linkedItems;
		}
		
		return array_map(function ($key) {
			return Zotero_Items::getByLibraryAndKey($this->libraryID, $key);
		}, $this->linkedItems);
	}
	
	
	public function setLinkedItems($newKeys) {
		if (!$this->linkedItemsLoaded) {
			$this->loadLinkedItems();
		}
		
		if (!is_array($newKeys))  {
			throw new Exception('$newKeys must be an array');
		}
		
		$oldKeys = $this->getLinkedItems(true);
		
		if (!$newKeys && !$oldKeys) {
			Z_Core::debug("No linked items added", 4);
			return false;
		}
		
		$addKeys = array_diff($newKeys, $oldKeys);
		$removeKeys = array_diff($oldKeys, $newKeys);
		
		// Make sure all new keys exist
		foreach ($addKeys as $key) {
			if (!Zotero_Items::existsByLibraryAndKey($this->libraryID, $key)) {
				// Return a specific error for a wrong-library tag issue
				// that I can't reproduce
				throw new Exception("Linked item $key of tag "
					. "{$this->libraryID}/{$this->key} not found",
					Z_ERROR_TAG_LINKED_ITEM_NOT_FOUND);
			}
		}
		
		if ($addKeys || $removeKeys) {
			$this->prepFieldChange('linkedItems');
		}
		else {
			Z_Core::debug('Linked items not changed', 4);
			return false;
		}
		
		$this->linkedItems = $newKeys;
		return true;
	}
	
	
	public function serialize() {
		$obj = array(
			'tagID' => $this->id,
			'name' => $this->name,
			'type' => $this->type,
			'linkedItems' => $this->getLinkedItems(true),
		);
		
		return $obj;
	}
	
	
	public function toResponseJSON() {
		
		$json = [
			'tag' => $this->name
		];
		
		// 'links'
		$json['links'] = [
			'self' => [
				'href' => Zotero_API::getTagURI($this),
				'type' => 'application/json'
			],
			'alternate' => [
				'href' => Zotero_URI::getTagURI($this, true),
				'type' => 'text/html'
			]
		];
		
		// 'library'
		// Don't bother with library for tags
		//$json['library'] = Zotero_Libraries::toJSON($this->libraryID);
		
		// 'meta'
		$json['meta'] = [
			'type' => $this->type,
			'numItems' => isset($fixedValues['numItems'])
				? $fixedValues['numItems']
				: sizeOf($this->getLinkedItems(true))
		];
		
		return $json;
	}
	
	
	public function toJSON() {
		$arr['tag'] = $this->name;
		$arr['type'] = $this->type;
		
		return $arr;
	}
	
	
	/**
	 * Converts a Zotero_Tag object to a SimpleXMLElement Atom object
	 *
	 * @return	SimpleXMLElement					Tag data as SimpleXML element
	 */
	public function toAtom($queryParams, $fixedValues=null) {
		if (!empty($queryParams['content'])) {
			$content = $queryParams['content'];
		}
		else {
			$content = array('none');
		}
		// TEMP: multi-format support
		$content = $content[0];
		
		$xml = new SimpleXMLElement(
			'<?xml version="1.0" encoding="UTF-8"?>'
			. '<entry xmlns="' . Zotero_Atom::$nsAtom
			. '" xmlns:zapi="' . Zotero_Atom::$nsZoteroAPI . '"/>'
		);
		
		$xml->title = $this->name;
		
		$author = $xml->addChild('author');
		$author->name = Zotero_Libraries::getName($this->libraryID);
		$author->uri = Zotero_URI::getLibraryURI($this->libraryID, true);
		
		$xml->id = Zotero_URI::getTagURI($this);
		
		$xml->published = Zotero_Date::sqlToISO8601($this->dateAdded);
		
		$link = $xml->addChild("link");
		$link['rel'] = "self";
		$link['type'] = "application/atom+xml";
		$link['href'] = Zotero_API::getTagURI($this);
		
		$link = $xml->addChild('link');
		$link['rel'] = 'alternate';
		$link['type'] = 'text/html';
		$link['href'] = Zotero_URI::getTagURI($this, true);
		
		// Count user's linked items
		if (isset($fixedValues['numItems'])) {
			$numItems = $fixedValues['numItems'];
		}
		else {
			$numItems = sizeOf($this->getLinkedItems(true));
		}
		$xml->addChild(
			'zapi:numItems',
			$numItems,
			Zotero_Atom::$nsZoteroAPI
		);
		
		if ($content == 'html') {
			$xml->content['type'] = 'xhtml';
			
			$contentXML = new SimpleXMLElement("<div/>");
			$contentXML->addAttribute(
				"xmlns", Zotero_Atom::$nsXHTML
			);
			$fNode = dom_import_simplexml($xml->content);
			$subNode = dom_import_simplexml($contentXML);
			$importedNode = $fNode->ownerDocument->importNode($subNode, true);
			$fNode->appendChild($importedNode);
		}
		else if ($content == 'json') {
			$xml->content['type'] = 'application/json';
			$xml->content = Zotero_Utilities::formatJSON($this->toJSON());
		}
		
		return $xml;
	}
	
	
	
	private function loadLinkedItems() {
		Z_Core::debug("Loading linked items for tag $this->id");
		
		// if (!$this->id) {
		// 	$this->linkedItemsLoaded = true;
		// 	return;
		// }
		
		// if (!$this->id) {
		// 	$this->linkedItemsLoaded = true;
		// 	return;
		// }
		
		$sql = "SELECT itemID FROM itemTags WHERE name=?";
		$stmt = Zotero_DB::getStatement($sql, true, Zotero_Shards::getByLibraryID($this->libraryID));
		$itemIds = Zotero_DB::columnQueryFromStatement($stmt, $this->name);
		
		$this->linkedItems = $itemIds ? $itemIds : array();
		$this->linkedItemsLoaded = true;
	}
	
	
	private function checkValue($field, $value) {
		if (!property_exists($this, $field)) {
			trigger_error("Invalid property '$field'", E_USER_ERROR);
		}
		
		// Data validation
		switch ($field) {
			case 'id':
			case 'libraryID':
			case 'itemID':
				if (!Zotero_Utilities::isPosInt($value)) {
					$this->invalidValueError($field, $value);
				}
				break;
			
			case 'name':
				if (mb_strlen($value) > Zotero_Tags::$maxLength) {
					throw new Exception("Tag '" . $value . "' too long", Z_ERROR_TAG_TOO_LONG);
				}
				break;
		}
	}
	
	
	private function prepFieldChange($field) {
		$this->changed[$field] = true;
		
		// Save a copy of the data before changing
		// TODO: only save previous data if tag exists
		if ($this->id && $this->exists() && !$this->previousData) {
			$this->previousData = $this->serialize();
		}
	}
	
	
	private function invalidValueError($field, $value) {
		trigger_error("Invalid '$field' value '$value'", E_USER_ERROR);
	}
}
?>
