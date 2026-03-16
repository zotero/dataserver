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
	private $name;
	private $type;
	private $version;
	
	private $changed;
	
	private $linkedItemsCount;

	
	public function __construct($id, $libraryID, $name, $type, $version) {
		$this->__set("id", $id);
		$this->__set("libraryID", $libraryID);
		$this->__set("name", $name);
		$this->__set("type", $type);
		$this->__set("version", $version);		
		
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
			return null;
			//throw new Exception("Zotero_Tag property '$field' doesn't exist");
		}
		
		return $this->$field;
	}
	
	
	public function __set($field, $value) {
		
		$this->checkValue($field, $value);
		
		if ($this->$field !== $value) {
			$this->$field = $value;
		}
	}
	
	public function getLinkedItemsCount() { 
		if (!$this->linkedItemsCount) {
			$this->loadLinkedItemsCount();
		}
		return $this->linkedItemsCount;
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
				: $this->getLinkedItemsCount()
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
			$numItems = sizeOf($this->getLinkedItemsCount());
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
	
	
	
	private function loadLinkedItemsCount() {
		Z_Core::debug("Loading linked items count for tag $this->id");
		
		if (!$this->id) {
			throw new Exception("id is required to fetch linked items count");
		}
		
		$sql = "SELECT COUNT(*) FROM itemTags JOIN items USING (itemID) WHERE name=? AND libraryID=?";
		$stmt = Zotero_DB::getStatement($sql, true, Zotero_Shards::getByLibraryID($this->libraryID));
		$this->linkedItemsCount = Zotero_DB::columnQueryFromStatement($stmt, [$this->name, $this->libraryID]);
	}
	
	
	private function checkValue($field, $value) {
		if (!property_exists($this, $field)) {
			trigger_error("Invalid property '$field'", E_USER_ERROR);
		}
		if (!isset($value)) {
			return;
		}
		// Data validation
		switch ($field) {
			case 'id':
			case 'libraryID':
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
	
	
	
	private function invalidValueError($field, $value) {
		trigger_error("Invalid '$field' value '$value'", E_USER_ERROR);
	}
}
?>
