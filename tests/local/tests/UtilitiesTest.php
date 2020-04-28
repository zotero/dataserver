<?
/*
    ***** BEGIN LICENSE BLOCK *****
    
    This file is part of the Zotero Data Server.
    
    Copyright © 2020 Center for History and New Media
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

class UtilitiesTests extends \PHPUnit\Framework\TestCase {
	public function testParseSearchString() {
		$str = "foo bar";
		$parts = Zotero_Utilities::parseSearchString($str);
		$this->assertCount(2, $parts);
		$this->assertEquals("foo", $parts[0]['text']);
		$this->assertFalse($parts[0]['inQuotes']);
		$this->assertEquals("bar", $parts[1]['text']);
		$this->assertFalse($parts[1]['inQuotes']);
		
		$str = 'foo "bar baz" qux';
		$parts = Zotero_Utilities::parseSearchString($str);
		$this->assertCount(3, $parts);
		$this->assertEquals("foo", $parts[0]['text']);
		$this->assertFalse($parts[0]['inQuotes']);
		$this->assertEquals("bar baz", $parts[1]['text']);
		$this->assertTrue($parts[1]['inQuotes']);
		$this->assertEquals("qux", $parts[2]['text']);
		$this->assertFalse($parts[2]['inQuotes']);
	}
}
