<?php
/*
    Add license block if adding additional code
*/

class Zotero_URL {
	/**
	 * Handle multiple identical parameters in the CGI-standard way instead of
	 * PHP's foo[]=bar way
	 *
	 * By Evan K on http://us.php.net/manual/en/function.parse-str.php
	 */
	public static function proper_parse_str($str) {
		if (!$str) {
			return array();
		}
		$arr = array();
		
		$pairs = explode('&', $str);
		
		foreach ($pairs as $i) {
			// Skip if no equals sign
			if (strpos($i, '=') === false) {
				continue;
			}
			
			list($name, $value) = explode('=', $i, 2);
			
			// Skip if empty value
			if (!$value && $value !== '0') {
				continue;
			}
			
			// Added by Dan S.
			$value = urldecode($value);
			
			// if name already exists
			if (isset($arr[$name])) {
				// stick multiple values into an array
				if (is_array($arr[$name])) {
					$arr[$name][] = $value;
				}
				else {
					$arr[$name] = array($arr[$name], $value);
				}
			}
			// otherwise, simply stick it in a scalar
			else {
				$arr[$name] = $value;
			}
		}
		return $arr;
	}
}
