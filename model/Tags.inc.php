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

class Zotero_Tags extends Zotero_ClassicDataObjects {
	public static $maxLength = 255;
	
	protected static $ZDO_object = 'tag';
	
	protected static $primaryFields = array(
		'id' => 'tagID',
		'libraryID' => '',
		'key' => '',
		'name' => '',
		'type' => '',
		'dateAdded' => '',
		'dateModified' => '',
		'version' => ''
	);
	
	private static $tagsByID = array();
	private static $namesByHash = array();
	
	/*
	 * Returns a tag and type for a given tagID
	 */
	public static function get($libraryID, $tagID, $skipCheck=false) {
		if (!$libraryID) {
			throw new Exception("Library ID not provided");
		}
		
		if (!$tagID) {
			throw new Exception("Tag ID not provided");
		}
		
		if (isset(self::$tagsByID[$tagID])) {
			return self::$tagsByID[$tagID];
		}
		
		if (!$skipCheck) {
			$sql = 'SELECT COUNT(*) FROM tags WHERE tagID=?';
			$result = Zotero_DB::valueQuery($sql, $tagID, Zotero_Shards::getByLibraryID($libraryID));
			if (!$result) {
				return false;
			}
		}
		
		$tag = new Zotero_Tag;
		$tag->libraryID = $libraryID;
		$tag->id = $tagID;
		
		self::$tagsByID[$tagID] = $tag;
		return self::$tagsByID[$tagID];
	}
	
	
	/*
	 * Returns tagID for this tag
	 */
	public static function getID($libraryID, $name, $type, $caseInsensitive=false) {
		if (!$libraryID) {
			throw new Exception("Library ID not provided");
		}
		
		$name = trim($name);
		$type = (int) $type;
		
		// TODO: cache
		
		$sql = "SELECT tagID FROM tags WHERE ";
		if ($caseInsensitive) {
			$sql .= "LOWER(name)=?";
			$params = [strtolower($name)];
		}
		else {
			$sql .= "name=?";
			$params = [$name];
		}
		$sql .= " AND type=? AND libraryID=?";
		array_push($params, $type, $libraryID);
		$tagID = Zotero_DB::valueQuery($sql, $params, Zotero_Shards::getByLibraryID($libraryID));
		
		return $tagID;
	}
	
	
	/*
	 * Returns array of all tagIDs for this tag (of all types)
	 */
	public static function getIDs($libraryID, $name, $caseInsensitive=false) {
		// Default empty library
		if ($libraryID === 0) return [];
		
		$sql = "SELECT tagID FROM tags WHERE libraryID=? AND name";
		if ($caseInsensitive) {
			$sql .= " COLLATE utf8mb4_unicode_ci ";
		}
		$sql .= "=?";
		$tagIDs = Zotero_DB::columnQuery($sql, array($libraryID, $name), Zotero_Shards::getByLibraryID($libraryID));
		if (!$tagIDs) {
			return array();
		}
		return $tagIDs;
	}
	
	
	public static function search($libraryID, $params) {
		$results = array('results' => array(), 'total' => 0);
		
		// Default empty library
		if ($libraryID === 0) {
			return $results;
		}
		
		$shardID = Zotero_Shards::getByLibraryID($libraryID);
		
		$sql = "SELECT SQL_CALC_FOUND_ROWS DISTINCT tagID FROM tags "
			. "JOIN itemTags USING (tagID) WHERE libraryID=? ";
		$sqlParams = array($libraryID);
		
		// Pass a list of tagIDs, for when the initial search is done via SQL
		$tagIDs = !empty($params['tagIDs']) ? $params['tagIDs'] : array();
		// Filter for specific tags with "?tag=foo || bar"
		$tagNames = [];
		if (!empty($params['tag'])) {
			// tag=foo&tag=bar (AND) doesn't make sense in this context
			if (is_array($params['tag'])) {
				throw new Exception("Cannot specify 'tag' more than once", Z_ERROR_INVALID_INPUT);
			}
			$tagNames = explode(' || ', $params['tag']);
		}
		// Filter for tags associated with a set of items
		$itemIDs = $params['itemIDs'] ?? [];
		
		if ($tagIDs) {
			$sql .= "AND tagID IN ("
					. implode(', ', array_fill(0, sizeOf($tagIDs), '?'))
					. ") ";
			$sqlParams = array_merge($sqlParams, $tagIDs);
		}
		
		if ($tagNames) {
			$sql .= "AND `name` IN ("
					. implode(', ', array_fill(0, sizeOf($tagNames), '?'))
					. ") ";
			$sqlParams = array_merge($sqlParams, $tagNames);
		}
		
		if ($itemIDs) {
			$sql .= "AND itemID IN ("
					. implode(', ', array_fill(0, sizeOf($itemIDs), '?'))
					. ") ";
			$sqlParams = array_merge($sqlParams, $itemIDs);
		}
		
		if (!empty($params['q'])) {
			if (!is_array($params['q'])) {
				$params['q'] = array($params['q']);
			}
			foreach ($params['q'] as $q) {
				$sql .= "AND name LIKE ? ";
				if ($params['qmode'] == 'startswith') {
					$sqlParams[] = "$q%";
				}
				else {
					$sqlParams[] = "%$q%";
				}
			}
		}
		
		$tagTypeSets = Zotero_API::getSearchParamValues($params, 'tagType');
		if ($tagTypeSets) {
			$positives = array();
			$negatives = array();
			
			foreach ($tagTypeSets as $set) {
				if ($set['negation']) {
					$negatives = array_merge($negatives, $set['values']);
				}
				else {
					$positives = array_merge($positives, $set['values']);
				}
			}
			
			if ($positives) {
				$sql .= "AND type IN (" . implode(',', array_fill(0, sizeOf($positives), '?')) . ") ";
				$sqlParams = array_merge($sqlParams, $positives);
			}
			
			if ($negatives) {
				$sql .= "AND type NOT IN (" . implode(',', array_fill(0, sizeOf($negatives), '?')) . ") ";
				$sqlParams = array_merge($sqlParams, $negatives);
			}
		}
		
		if (!empty($params['since'])) {
			$sql .= "AND version > ? ";
			$sqlParams[] = $params['since'];
		}
		
		if (!empty($params['sort'])) {
			$order = $params['sort'];
			if ($order == 'title') {
				// Force a case-insensitive sort
				$sql .= "ORDER BY name COLLATE utf8mb4_unicode_ci ";
			}
			else if ($order == 'numItems') {
				$sql .= "GROUP BY tags.tagID ORDER BY COUNT(tags.tagID)";
			}
			else {
				$sql .= "ORDER BY $order ";
			}
			if (!empty($params['direction'])) {
				$sql .= " " . $params['direction'] . " ";
			}
		}
		
		if (!empty($params['limit'])) {
			$sql .= "LIMIT ?, ?";
			$sqlParams[] = $params['start'] ? $params['start'] : 0;
			$sqlParams[] = $params['limit'];
		}
		
		$ids = Zotero_DB::columnQuery($sql, $sqlParams, $shardID);
		
		$results['total'] = Zotero_DB::valueQuery("SELECT FOUND_ROWS()", false, $shardID);
		if ($ids) {
			$tags = array();
			foreach ($ids as $id) {
				$tags[] = Zotero_Tags::get($libraryID, $id);
			}
			$results['results'] = $tags;
		}
		
		return $results;
	}
	
	
	public static function cache(Zotero_Tag $tag) {
		if (isset($tagsByID[$tag->id])) {
			error_log("Tag $tag->id is already cached");
		}
		
		self::$tagsByID[$tag->id] = $tag;
	}
}
