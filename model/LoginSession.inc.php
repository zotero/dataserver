<?
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

class Zotero_LoginSession {
	private $sessionToken;
	private $userID;
	private $keyID;
	private $clientType;
	private $status = 'pending';
	private $dateCreated;
	private $dateExpires;
	private $dateCompleted;

	private $loaded = false;
	private $changed = [];


	public function __get($field) {
		switch ($field) {
			case 'sessionToken':
			case 'userID':
			case 'keyID':
			case 'clientType':
			case 'status':
			case 'dateCreated':
			case 'dateExpires':
			case 'dateCompleted':
				break;

			default:
				throw new Exception("Invalid login session field '$field'");
		}

		return $this->$field;
	}


	public function __set($field, $value) {
		switch ($field) {
			case 'sessionToken':
			case 'userID':
			case 'keyID':
			case 'clientType':
			case 'status':
			case 'dateExpires':
			case 'dateCompleted':
				break;

			default:
				throw new Exception("Invalid login session field '$field'");
		}

		if (!$this->loaded) {
			$this->loaded = true;
		}

		if ($this->$field == $value) {
			return;
		}
		$this->$field = $value;
		$this->changed[$field] = true;
	}


	/**
	 * Check if session is valid (pending and not expired)
	 */
	public function isValid() {
		return $this->status === 'pending' && !$this->isExpired();
	}


	/**
	 * Check if session is completed
	 */
	public function isCompleted() {
		return $this->status === 'completed';
	}


	/**
	 * Check if session is expired
	 */
	public function isExpired() {
		if ($this->status === 'expired') {
			return true;
		}
		return strtotime($this->dateExpires) < time();
	}


	public function save() {
		if (!$this->loaded) {
			Z_Core::debug("Not saving unloaded login session");
			return;
		}

		if (!$this->sessionToken) {
			throw new Exception("Cannot save login session without sessionToken");
		}

		if (!$this->clientType) {
			throw new Exception("Cannot save login session without clientType");
		}

		if (!$this->dateExpires) {
			throw new Exception("Cannot save login session without dateExpires");
		}

		$sql = "INSERT INTO loginSessions (sessionToken, userID, keyID, clientType, status, dateExpires, dateCompleted) "
			. "VALUES (?, ?, ?, ?, ?, ?, ?) "
			. "ON DUPLICATE KEY UPDATE userID=?, keyID=?, clientType=?, status=?, dateExpires=?, dateCompleted=?";
		$params = [
			$this->sessionToken,
			$this->userID,
			$this->keyID,
			$this->clientType,
			$this->status,
			$this->dateExpires,
			$this->dateCompleted,
			// ON DUPLICATE KEY UPDATE values
			$this->userID,
			$this->keyID,
			$this->clientType,
			$this->status,
			$this->dateExpires,
			$this->dateCompleted
		];
		Zotero_DB::query($sql, $params);

		$this->changed = [];
	}


	/**
	 * Cancel the login session
	 */
	public function cancel() {
		$this->status = 'cancelled';
		$this->save();
	}


	/**
	 * Convert to JSON for public responses
	 *
	 * @param bool $includeKey Include API key in response (for completed sessions)
	 * @return array
	 */
	public function toJSON($includeKey = false) {
		$json = [
			'status' => $this->status
		];

		if ($includeKey && $this->isCompleted() && $this->keyID) {
			$keyObj = new Zotero_Key;
			$keyObj->id = $this->keyID;
			$json['apiKey'] = $keyObj->key;
			$json['userID'] = $this->userID;
			$json['username'] = Zotero_Users::getUsername($this->userID);
		}

		return $json;
	}


	/**
	 * Convert to JSON for internal/super-user responses
	 * Includes userID, username, and existing key permissions
	 *
	 * @return array
	 */
	public function toInfoJSON() {
		$json = [
			'status' => $this->status,
			'userID' => $this->userID,
			'access' => null
		];

		// If there's an existing key, include its permissions
		if ($this->keyID) {
			$keyObj = new Zotero_Key;
			$keyObj->id = $this->keyID;
			$keyJSON = $keyObj->toJSON();
			if (isset($keyJSON['access'])) {
				$json['access'] = $keyJSON['access'];
			}
		}

		return $json;
	}


	public function loadFromRow($row) {
		foreach ($row as $field => $val) {
			$this->$field = $val;
		}

		$this->loaded = true;
		$this->changed = [];
	}
}
