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

class Zotero_LoginSessions {
	public static $sessionDuration = 900; // 15 minutes
	public static $tokenLength = 32;


	/**
	 * Get a login session by token
	 *
	 * @param string $token
	 * @return Zotero_LoginSession|false
	 */
	public static function getByToken($token) {
		$sql = "SELECT * FROM loginSessions WHERE sessionToken=?";
		$row = Zotero_DB::rowQuery($sql, $token);
		if (!$row) {
			return false;
		}
		$session = new Zotero_LoginSession;
		$session->loadFromRow($row);
		return $session;
	}


	/**
	 * Create a new login session
	 *
	 * @param string $userAgent User-Agent header from client
	 * @param Zotero_Key $keyObj Optional existing key for key update flow
	 * @param int $userID Optional userID from client's local database
	 * @return Zotero_LoginSession
	 */
	public static function create($userAgent, $keyObj = null, $userID = null) {
		$session = new Zotero_LoginSession;
		$session->sessionToken = self::generateToken();
		$session->clientType = self::getClientTypeFromUserAgent($userAgent);
		$session->dateExpires = date('Y-m-d H:i:s', time() + self::$sessionDuration);

		// If existing key provided, tie session to that key's user
		if ($keyObj) {
			$session->userID = $keyObj->userID;
			$session->keyID = $keyObj->id;
		}
		// Otherwise use userID from client if provided
		else if ($userID) {
			$session->userID = $userID;
		}

		$session->save();
		return $session;
	}


	/**
	 * Generate a unique session token
	 *
	 * @return string
	 */
	public static function generateToken() {
		$tries = 5;
		while ($tries > 0) {
			$token = Zotero_Utilities::randomString(self::$tokenLength, 'mixed');
			$sql = "SELECT COUNT(*) FROM loginSessions WHERE sessionToken=?";
			if (Zotero_DB::valueQuery($sql, $token)) {
				$tries--;
				continue;
			}
			return $token;
		}
		throw new Exception("Unique session token could not be generated");
	}


	/**
	 * Complete a login session -- create or update API key
	 *
	 * @param string $token Session token
	 * @param int $userID User ID
	 * @param array $accessJSON Access permissions in JSON format
	 * @return Zotero_LoginSession
	 */
	public static function complete($token, $userID, $accessJSON) {
		$session = self::getByToken($token);
		if (!$session) {
			throw new Exception("Session not found", Z_ERROR_OBJECT_NOT_FOUND);
		}
		if ($session->isExpired()) {
			throw new Exception("Session expired", Z_ERROR_INVALID_INPUT);
		}
		if (!$session->isValid()) {
			throw new Exception("Session already completed or cancelled", Z_ERROR_INVALID_INPUT);
		}

		Zotero_DB::beginTransaction();

		// Ensure user exists in dataserver
		if (!Zotero_Users::exists($userID)) {
			Zotero_Users::addFromWWW($userID);
		}

		// Get or create key
		if ($session->keyID) {
			// Key update flow -- modify existing key
			$keyObj = new Zotero_Key;
			$keyObj->id = $session->keyID;
		}
		else {
			// New login flow -- create new key
			$keyObj = new Zotero_Key;
			$keyObj->userID = $userID;
			$keyObj->name = self::getKeyNameFromClientType($session->clientType);
		}

		// Set permissions from access JSON
		$keyObj->setPermissionsFromAccessJSON($userID, $accessJSON);
		$keyObj->save();

		// Update session
		$session->userID = $userID;
		$session->keyID = $keyObj->id;
		$session->status = 'completed';
		$session->dateCompleted = Zotero_DB::getTransactionTimestamp();
		$session->save();

		Zotero_DB::commit();

		// Send notification via Redis for WebSocket delivery
		self::sendLoginNotification($session, $keyObj);

		return $session;
	}


	/**
	 * Parse User-Agent string to determine client type
	 *
	 * @param string $userAgent
	 * @return string One of: mac, windows, linux, ios, android, unknown
	 */
	public static function getClientTypeFromUserAgent($userAgent) {
		if (strpos($userAgent, 'Macintosh') !== false) {
			return 'mac';
		}
		if (strpos($userAgent, 'Windows NT') !== false) {
			return 'windows';
		}
		if (strpos($userAgent, 'Linux') !== false) {
			return 'linux';
		}
		if (strpos($userAgent, 'org.zotero.ios') !== false || strpos($userAgent, 'iOS') !== false) {
			return 'ios';
		}
		if (strpos($userAgent, 'Android') !== false) {
			return 'android';
		}
		return 'unknown';
	}


	/**
	 * Get key name from client type
	 *
	 * @param string $clientType
	 * @return string
	 */
	public static function getKeyNameFromClientType($clientType) {
		switch ($clientType) {
			case 'mac':
				return 'Automatic Zotero Client Key (macOS)';
			case 'windows':
				return 'Automatic Zotero Client Key (Windows)';
			case 'linux':
				return 'Automatic Zotero Client Key (Linux)';
			case 'ios':
				return 'Automatic Zotero Client Key (iOS)';
			case 'android':
				return 'Automatic Zotero Client Key (Android)';
			default:
				return 'Automatic Zotero Client Key';
		}
	}


	/**
	 * Send Redis notification for login completion
	 *
	 * @param Zotero_LoginSession $session
	 * @param Zotero_Key $keyObj
	 */
	private static function sendLoginNotification($session, $keyObj) {
		$redis = Z_Redis::get('notifications');
		if (!$redis) {
			Z_Core::logError('Error: Failed to get Redis client for login notification');
			return;
		}

		$message = [
			'event' => 'loginComplete',
			'sessionToken' => $session->sessionToken,
			'apiKey' => $keyObj->key,
			'userID' => $session->userID,
			'username' => Zotero_Users::getUsername($session->userID)
		];

		$channel = "login-session:" . $session->sessionToken;
		$redis->publish($channel, json_encode($message, JSON_UNESCAPED_SLASHES));
	}


	/**
	 * Clean up expired sessions (for cron job)
	 *
	 * @return int Number of sessions updated
	 */
	public static function cleanUpExpired() {
		$sql = "UPDATE loginSessions SET status='expired'
			WHERE status='pending' AND dateExpires < NOW()";
		return Zotero_DB::query($sql);
	}
}
