<?php
/*
    ***** BEGIN LICENSE BLOCK *****
    
    This file is part of the Zotero Data Server.
    
    Copyright © 2017 Center for History and New Media
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

class Zotero_GlobalItems {
	const endpointTimeout = 3;
	
	public static function getGlobalItems($params) {
		$requestURL = Z_CONFIG::$GLOBAL_ITEMS_ENDPOINT;
		if ($requestURL[strlen($requestURL) - 1] != "/") {
			$requestURL .= "/";
		}
		$requestURL .= 'global/items';
		
		// If a single-object query
		if (!empty($params['id'])) {
			$requestURL .= '/' . rawurlencode($params['id']);
		}
		// If a multi-object query
		else {
			if (!empty($params['q'])) {
				$requestURL .= '?q=' . rawurlencode($params['q']);
			}
			else if (!empty($params['doi'])) {
				$requestURL .= '?doi=' . rawurlencode($params['doi']);
			}
			else if (!empty($params['isbn'])) {
				$requestURL .= '?isbn=' . rawurlencode($params['isbn']);
			}
			else if (!empty($params['url'])) {
				$requestURL .= '?url=' . rawurlencode($params['url']);
			}
			else {
				throw new Exception("Missing query parameter");
			}
			
			if (!empty($params['start'])) {
				$requestURL .= '&start=' . $params['start'];
			}
			
			if (!empty($params['limit'])) {
				$requestURL .= '&limit=' . $params['limit'];
			}
		}
		
		$start = microtime(true);
		
		$ch = curl_init($requestURL);
		curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 1);
		curl_setopt($ch, CURLOPT_TIMEOUT, self::endpointTimeout);
		curl_setopt($ch, CURLOPT_HEADER, 0); // do not return HTTP headers
		curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
		// Allow an invalid ssl certificate (Todo: remove)
		curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
		curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, 0);
		$response = curl_exec($ch);
		
		$time = microtime(true) - $start;
		StatsD::timing("api.globalitems", $time * 1000);
		
		$code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
		
		if ($code != 200) {
			throw new Exception($code . " from Global Items server "
				. "[requestURL: '$requestURL'] [RESPONSE: '$response']");
		}
		return $response;
	}
	
	public static function getGlobalItemLibraryItems($id) {
		$params = [
			'id' => $id
		];
		$json = self::getGlobalItems($params);
		$json = json_decode($json);
		$libraryItems = $json->libraryItems;
		return $libraryItems;
	}
}
