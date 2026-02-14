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

class Zotero_Creator {
	private $libraryID;
	private $firstName = '';
	private $lastName = '';
	private $shortName = '';
	private $fieldMode = 0;
	private $creatorTypeID;
	private $orderIndex;
	private $changed = array();

	
	
	public function __construct($libraryID, $firstName, $lastName, $fieldMode, $creatorTypeID, $orderIndex) {
		$this->libraryID = $libraryID;
		$this->firstName = $firstName;
		$this->lastName = $lastName;
		$this->fieldMode = $fieldMode;
		$this->creatorTypeID = $creatorTypeID;
		$this->orderIndex = $orderIndex;
		$this->changed = array();
		$props = array(
			'libraryID',
			'firstName',
			'lastName',
			'shortName',
			'fieldMode',
			'creatorTypeID',
			'orderIndex'
		);
		foreach ($props as $prop) {
			$this->changed[$prop] = false;
		}
	}
	
	
	public function __get($field) {

		if (!property_exists('Zotero_Creator', $field)) {
			throw new Exception("Zotero_Creator property '$field' doesn't exist");
		}
		
		return $this->$field;
	}
	
	
	public function __set($field, $value) {
		switch ($field) {
			case 'libraryID':
				$this->checkValue($field, $value);
				$this->$field = $value;
				return;
			
			case 'firstName':
			case 'lastName':
				$value = Zotero_Utilities::unicodeTrim($value);
				break;
		}
		
		$this->checkValue($field, $value);
		
		if ($this->$field !== $value) {
			$this->changed[$field] = true;
			$this->$field = $value;
		}
	}
	
	
	
	public function hasChanged() {
		return in_array(true, array_values($this->changed));
	}
	
	
	
	
	public function equals($creator) {		
		return
			($creator->firstName === $this->firstName) &&
			($creator->lastName === $this->lastName) &&
			($creator->fieldMode == $this->fieldMode);
	}
	
	
	private function checkValue($field, $value) {
		if (!property_exists($this, $field)) {
			throw new Exception("Invalid property '$field'");
		}
		
		// Data validation
		switch ($field) {
			case 'libraryID':
			case 'creatorTypeID':
				if (!Zotero_Utilities::isPosInt($value)) {
					$this->invalidValueError($field, $value);
				}
				break;
			
			case 'fieldMode':
				if ($value !== 0 && $value !== 1) {
					$this->invalidValueError($field, $value);
				}
				break;
		}
	}
	
	
	
	private function invalidValueError($field, $value) {
		throw new Exception("Invalid '$field' value '$value'");
	}
}
?>
