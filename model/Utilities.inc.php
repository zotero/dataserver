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

class Zotero_Utilities {
	/**
	 * Generates random string of given length
	 *
	 * @param int    $length
	 * @param string [$mode='lower']              'key', 'lower', 'upper', 'mixed'
	 * @param bool   [$exclude_ambiguous=false]   Exclude letters that are hard to distinguish visually
	 **/
	public static function randomString($length, $mode='lower', $exclude_ambiguous=false) {
		// if you want extended ascii, then add the characters to the array
		$upper = array('A','B','C','D','E','F','G','H','I','J','K','L','M','N','P','Q','R','S','T','U','V','W','X','Y','Z');
		$lower = array('a','b','c','d','e','f','g','h','i','j','k','m','n','o','p','q','r','s','t','u','v','w','x','y','z');
		$numbers = array('2','3','4','5','6','7','8','9');
		
		switch ($mode) {
			// Special case for object ids, which don't use 'O'
			// (and are inadvertently missing 'L' and 'Y')
			case 'key':
				$characters = array_merge(
					array('A','B','C','D','E','F','G','H','I','J','K','M','N','P','Q','R','S','T','U','V','W','X','Z'),
					$numbers
				);
				break;
			
			case 'mixed':
				$characters = array_merge($lower, $upper, $numbers);
				if (!$exclude_ambiguous){
					$characters = array_merge($characters, array('l','1','0','O'));
				}
				break;
			case 'upper':
				$characters = array_merge($upper, $numbers);
				if (!$exclude_ambiguous){
					// This should include 'I', but the client uses it, so too late
					$characters = array_merge($characters, array('1','0','O'));
				}
				break;
			
			case 'lower':
			default:
				$characters = array_merge($lower, $numbers);
				if (!$exclude_ambiguous){
					$characters = array_merge($characters, array('l','1','0'));
				}
				break;
		}
		
		$random_str = "";
		for ($i = 0; $i < $length; $i++) {
			$random_str .= $characters[array_rand($characters)];
		}
		return $random_str;
	}
	
	
	public static function isPosInt($val) {
		// From http://us.php.net/manual/en/function.is-int.php#93560
		return ctype_digit((string) $val);
	}
	
	
    /**
     * Generate url friendly slug from name
     *
     * @param string $input name to generate slug from
     * @return string
     */
    public static function slugify($input) {
        $slug = trim($input);
        $slug = strtolower($slug);
        $slug = preg_replace("/[^a-z0-9 ._-]/", "", $slug);
        $slug = str_replace(" ", "_", $slug);
        return $slug;
    }
    
    
	public static function ellipsize($str, $len) {
		if (!$len) {
			throw new Exception("Length not specified");
		}
		if (mb_strlen($str) > $len) {
			return mb_substr($str, 0, $len) . '…';
		}
		return $str;
	}
    
	
	public static function formatJSON($jsonObj) {
		$mask = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT;
		return json_encode($jsonObj, $mask);
	}
	
	
	/**
	 * Strip control characters from string
	 */
	public static function cleanString($str) {
		$chars = array();
		for ($i = 0; $i < 32; $i++) {
			// Don't strip line feed and tab
			if ($i != 9 && $i != 10) {
				$chars[] = chr($i);
			}
		}
		$chars[] = chr(127);
		return str_replace($chars, '', $str);
	}
	
	
	/**
	 * Recursively call cleanString() on an object's scalar properties
	 */
	public static function cleanStringRecursive($obj) {
		foreach ($obj as &$val) {
			if (is_scalar($val) || $val === null) {
				if (is_string($val)) {
					$val = self::cleanString($val);
				}
			}
			else {
				self::{__FUNCTION__}($val);
			}
		}
	}
	
	
	/**
	 * JavaScript-equivalent trim, which strips all Unicode whitespace
	 */
	public static function unicodeTrim($str) {
		return preg_replace('/^[\pZ\pC]+|[\pZ\pC]+$/u','', $str);
	}
	
	
	/**
	 * Much faster implementation of array_diff, but limited to
	 * comparing two arrays of integers or strings
	 *
	 * From http://php.net/array_diff#107928
	 *
	 * @return {Array}  Values from array1 that aren't in array2
	 */
	public static function arrayDiffFast($arrayFrom, $arrayAgainst) {
		$arrayAgainst = array_flip($arrayAgainst);
		foreach ($arrayFrom as $key => $value) {
			if (isset($arrayAgainst[$value])) {
				unset($arrayFrom[$key]);
			}
		}
		return $arrayFrom;
	}
}
?>
