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
require_once 'include/bootstrap.inc.php';

class ItemsTests extends \PHPUnit\Framework\TestCase {
	protected static $config;
	
	public static function setUpBeforeClass(): void {
		require("include/config.inc.php");
		self::$config = $config;
		self::$config['userLibraryID'] = Zotero_Users::getLibraryIDFromUserID($config['userID']);
	}
	
	public function setUp(): void {
		Zotero_Users::clearAllData(self::$config['userID']);
	}
	
	
	public function testExistsByLibraryAndKey() {
		$this->assertFalse(Zotero_Items::existsByLibraryAndKey(self::$config['userLibraryID'], "AAAAAAAA"));
		
		$item = new Zotero_Item;
		$item->libraryID = self::$config['userLibraryID'];
		$item->itemTypeID = Zotero_ItemTypes::getID("book");
		$item->save();
		$key = $item->key;
		
		$this->assertTrue(Zotero_Items::existsByLibraryAndKey(self::$config['userLibraryID'], $key));
		
		Zotero_Items::delete(self::$config['userLibraryID'], $key);
		
		$this->assertFalse(Zotero_Items::existsByLibraryAndKey(self::$config['userLibraryID'], $key));
	}
}
