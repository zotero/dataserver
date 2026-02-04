<?php
/*
    ***** BEGIN LICENSE BLOCK *****

    This file is part of the Zotero Data Server.

    Copyright © 2026 Corporation for Digital Scholarship
                     Vienna, Virginia, USA
                     https://digitalscholar.org

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

class LoginSessionsController extends ApiController {

	/**
	 * Handle /keys/sessions and /keys/sessions/:token
	 *
	 * POST /keys/sessions -- Create new login session
	 * GET /keys/sessions/:token -- Check session status
	 * DELETE /keys/sessions/:token -- Cancel session
	 */
	public function sessions() {
		$this->allowMethods(['GET', 'POST', 'DELETE']);

		if ($this->objectKey) {
			// GET or DELETE specific session
			$session = Zotero_LoginSessions::getByToken($this->objectKey);

			if (!$session) {
				$this->e404("Session not found");
			}

			if ($this->method == 'GET') {
				if ($session->isExpired()) {
					$this->e410("Session expired");
				}
				$json = $session->toJSON($session->isCompleted());
				header('Content-Type: application/json');
				echo Zotero_Utilities::formatJSON($json);
				$this->end();
			}
			else if ($this->method == 'DELETE') {
				if (!$session->isValid()) {
					$this->e409("Session already completed, expired, or cancelled");
				}
				$session->cancel();
				$this->e204();
			}
		}
		else if ($this->method == 'POST') {
			// Create new session
			$userAgent = $_SERVER['HTTP_USER_AGENT'] ?? '';

			// If authenticated with API key, tie session to that key
			$keyObj = null;
			if ($this->apiKey) {
				$keyObj = Zotero_Keys::getByKey($this->apiKey);
			}

			// Client can pass userID if they have a local database tied to a user
			$userID = null;
			if ($this->body) {
				$json = json_decode($this->body, true);
				if ($json && !empty($json['userID'])) {
					$userID = (int) $json['userID'];
				}
			}

			$session = Zotero_LoginSessions::create($userAgent, $keyObj, $userID);

			$response = [
				'sessionToken' => $session->sessionToken,
				'loginURL' => Z_CONFIG::$WWW_BASE_URI . 'login?session=' . $session->sessionToken
			];

			header('Content-Type: application/json');
			header("HTTP/1.1 201 Created");
			echo Zotero_Utilities::formatJSON($response);
			$this->end();
		}

		$this->e400("Invalid request");
	}


	/**
	 * Handle /keys/sessions/:token/info
	 *
	 * GET /keys/sessions/:token/info -- Internal endpoint for www to get session details
	 * Requires super-user authentication
	 */
	public function info() {
		$this->allowMethods(['GET']);

		if (!$this->permissions->isSuper()) {
			$this->e403();
		}

		$session = Zotero_LoginSessions::getByToken($this->objectKey);

		if (!$session) {
			$this->e404("Session not found");
		}

		if ($session->isExpired()) {
			$this->e410("Session expired");
		}

		$json = $session->toInfoJSON();

		header('Content-Type: application/json');
		echo Zotero_Utilities::formatJSON($json);
		$this->end();
	}


	/**
	 * Handle /keys/sessions/complete
	 *
	 * POST /keys/sessions/complete -- Internal endpoint to complete login
	 * Requires super-user authentication
	 *
	 * Request body:
	 * {
	 *   "sessionToken": "...",
	 *   "userID": 12345,  // Required for new login, ignored for key update
	 *   "access": { "user": {...}, "groups": {...} }
	 * }
	 */
	public function complete() {
		$this->allowMethods(['POST']);

		if (!$this->permissions->isSuper()) {
			$this->e403();
		}

		$json = json_decode($this->body, true);
		if (!$json) {
			$this->e400("Invalid JSON");
		}

		if (empty($json['sessionToken'])) {
			$this->e400("'sessionToken' required");
		}
		if (empty($json['access'])) {
			$this->e400("'access' required");
		}

		$session = Zotero_LoginSessions::getByToken($json['sessionToken']);
		if (!$session) {
			$this->e404("Session not found");
		}
		if ($session->isExpired()) {
			$this->e410("Session expired");
		}
		if (!$session->isValid()) {
			$this->e409("Session already completed or cancelled");
		}

		// For new logins, userID is required
		// For key updates, userID is already in session
		$userID = $session->userID;
		if (!$userID) {
			if (empty($json['userID'])) {
				$this->e400("'userID' required for new login");
			}
			$userID = $json['userID'];
		}

		try {
			Zotero_LoginSessions::complete(
				$json['sessionToken'],
				$userID,
				$json['access']
			);
		}
		catch (Exception $e) {
			if ($e->getCode() == Z_ERROR_OBJECT_NOT_FOUND) {
				$this->e404($e->getMessage());
			}
			if ($e->getCode() == Z_ERROR_INVALID_INPUT) {
				$this->e400($e->getMessage());
			}
			throw $e;
		}

		$this->e204();
	}
}
