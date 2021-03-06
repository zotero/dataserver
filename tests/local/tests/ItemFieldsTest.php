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
require_once 'include/bootstrap.inc.php';

class ItemFieldsTests extends \PHPUnit\Framework\TestCase {
	public function testGetID() {
		$this->assertInternalType('integer', Zotero_ItemFields::getID('title'));
	}
	
	public function testGetLocalizedString() {
		$this->assertEquals('Title', Zotero_ItemFields::getLocalizedString('title'));
	}
	
	public function testIsDate() {
		$this->assertTrue(Zotero_ItemFields::isDate('date'));
		$this->assertFalse(Zotero_ItemFields::isDate('title'));
	}
}
