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

require('ApiController.php');

class GlobalItemsController extends ApiController {
	// Elastic search has a default 'index.max_result_window=10000' limit,
	// therefore start+limit can not be more than 10000
	const maxResultWindow = 10000;
	const endpointTimeout = 3; // In seconds
	
	public function globalItems() {
		$this->allowMethods(array('GET'));
		
		if (empty($this->queryParams['q'])) {
			$this->e400("Query parameter must be set");
		}
		$query = $this->queryParams['q'];
		
		if (strlen($query) < 3) {
			$this->e400("Query string must be at least 3 character length");
		}
		
		$start = $this->queryParams['start'];
		$limit = $this->queryParams['limit'];
		
		if ($start + $limit > self::maxResultWindow) {
			$this->e400("Maximum result window exceeded");
		}
		
		$requestURL = Z_CONFIG::$GLOBAL_ITEMS_ENDPOINT;
		if ($requestURL[strlen($requestURL) - 1] != "/") {
			$requestURL .= "/";
		}
		$requestURL .= 'global/items?q=' . urlencode($query)
			. '&start=' . $start . '&limit=' . $limit;
		
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
			$response = null;
			Z_Core::logError("HTTP $code from Global Items API $requestURL");
			Z_Core::logError($response);
			$this->e500("Endpoint error");
		}
		
		header("Content-Type: application/json");
		echo $response;
	}
}
