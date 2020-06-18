<?php
/*
    ***** BEGIN LICENSE BLOCK *****
    
    This file is part of the Zotero Data Server.
    
    Copyright © 2013 Center for History and New Media
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

class Z_SNS {
	private static $sns;
	
	public static function sendAlert($subject, $message) {
		if (empty(Z_CONFIG::$SNS_ALERT_TOPIC)) {
			error_log("SNS alert topic not set -- not sending message");
			error_log($subject . ": " . $message);
			return;
		}
		
		self::load();
		
		$result = self::$sns->publish([
			'TopicArn' => Z_CONFIG::$SNS_ALERT_TOPIC,
			'Subject' => $subject,
			'Message' => $message,
		]);
	}
	
	private static function load() {
		if (!self::$sns) {
			self::$sns = Z_Core::$AWS->createSNS();
		}
	}
}
