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

use Aws\DynamoDb\DynamoDbClient;

class TTSController extends ApiController {
	private bool $testMode = false;

	// Must match ExpirationInDays in cloudformation/tts/template.yaml.j2
	const AUDIO_CACHE_DAYS = 90;

	// Minimal valid silent audio files (~50ms) for unspeakable input
	private static $silentAudio = [
		'audio/mpeg' => '//sQxAADwAABpAAAACAAADSAAAAETEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+xLEKYPAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/+xDEU4PAAAGkAAAAIAAANIAAAARVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQ==',
		'audio/ogg' => 'T2dnUwACAAAAAAAAAADmyJxRAAAAADIdjKABE09wdXNIZWFkAQE4AYC7AAAAAABPZ2dTAAAAAAAAAAAAAObInFEBAAAAvMkyTgE9T3B1c1RhZ3MMAAAATGF2ZjYyLjMuMTAwAQAAAB0AAABlbmNvZGVyPUxhdmM2Mi4xMS4xMDAgbGlib3B1c09nZ1MABJgKAAAAAAAA5sicUQIAAACSXv09AwcGBggL5jsjq2AICKyzDsYICKyzDsY=',
	];

	// Arena config is loaded from model/tts/ArenaConfig.inc.php
	// If absent, arena mode is disabled and core TTS functionality is unaffected.
	private static $arenaConfig = null;
	private static $arenaConfigLoaded = false;

	private static function getArenaConfig(): ?array {
		if (!self::$arenaConfigLoaded) {
			$path = Z_ENV_MODEL_PATH . 'tts/ArenaConfig.inc.php';
			self::$arenaConfig = file_exists($path) ? require($path) : null;
			self::$arenaConfigLoaded = true;
		}
		return self::$arenaConfig;
	}

	private static function getTestKey(): ?string {
		$path = Z_ENV_BASE_PATH . 'tests/remote/config/local.json';
		if (!file_exists($path)) return null;
		$config = json_decode(file_get_contents($path), true);
		return $config['ttsTestKey'] ?? null;
	}

	private static $providerClasses = null;

	public function voices() {
		$this->allowMethods(['GET']);

		if (!empty($this->userID)) {
			$standardUsage = $this->getCreditsRemaining($this->userID, 'standard');
			$premiumUsage = $this->getCreditsRemaining($this->userID, 'premium');
		}

		header("Content-Type: application/json");
		if (!empty($this->userID)) {
			header("Zotero-TTS-Standard-Credits-Remaining: {$standardUsage['monthlyRemaining']}");
			header("Zotero-TTS-Premium-Credits-Remaining: {$premiumUsage['monthlyRemaining']}");
		}

		if (!empty($this->userID) && in_array($this->userID, Z_CONFIG::$TTS_DEV_USERS)) {
			header("Zotero-TTS-Dev: 1");
		}
		$lang = $_GET['lang'] ?? 'en-US';
		echo json_encode(self::getVoices($this->userID, $lang), JSON_PRETTY_PRINT);
	}


	public function sample() {
		$hexID = $_GET['voice'] ?? '';
		if (empty($hexID)) {
			$this->e400("'voice' not provided");
		}

		// Resolve hex ID to provider voice
		$resolved = self::resolveVoice($hexID);
		if (!$resolved) {
			$this->e400("Invalid voice '$hexID'");
		}
		$lang = $resolved['locale'] ?? 'en-US';

		$langPrefix = explode('-', $lang)[0];
		$templates = self::$sampleTexts[$langPrefix] ?? self::$sampleTexts['en'];
		$text = sprintf($templates[$resolved['tier']], $resolved['number']);

		$cacheKey = $this->computeCacheKey(
			$resolved['voiceID'], $text, null, $lang,
			$resolved['cacheVersion'], $resolved['audioFormat']
		);

		// Check S3 cache
		$cached = $this->checkS3Cache($cacheKey);
		if ($cached) {
			header("Location: " . $this->getCloudFrontURL($cacheKey), true, 302);
			return;
		}

		// Cache miss -- synthesize, upload, redirect
		$options = array_merge($resolved, ['locale' => $lang]);
		try {
			$result = $resolved['class']::synthesize($resolved['voice'], $text, $options);
		}
		catch (\Exception $e) {
			$this->logProviderError($resolved['provider']);
			throw $e;
		}
		$duration = $this->getAudioDuration($result['audio']);
		$this->uploadToS3Cache($cacheKey, $result['audio'], $result['mimeType'], $duration);

		header("Location: " . $this->getCloudFrontURL($cacheKey), true, 302);
	}


	public function speak() {
		$this->allowMethods(['GET', 'POST']);

		// Arena mode (GET only) -- disabled if ArenaConfig.inc.php is absent
		if ($_GET['arena'] ?? null) {
			$arenaConfig = self::getArenaConfig();
			if (!$arenaConfig || $_GET['arena'] !== $arenaConfig['token']) {
				$this->e403();
			}
			$this->speakArena($arenaConfig['sampleTexts']);
			return;
		}

		// For POST, read params from JSON body; for GET, use query string
		if ($this->method == 'POST') {
			$params = json_decode($this->body, true) ?? [];
		}
		else {
			$params = $_GET;
		}

		// Test mode -- bypasses quota enforcement
		if ($params['test'] ?? null) {
			$testKey = self::getTestKey();
			if (!$testKey || $params['test'] !== $testKey) {
				$this->e403();
			}
			$this->testMode = true;
		}

		if (empty($this->userID)) {
			$this->e400("API key not provided");
		}

		$hexID = $params['voice'] ?? '';
		$text = $params['text'] ?? '';
		$prompt = $params['prompt'] ?? null;

		if (empty($hexID)) {
			$this->e400("'voice' not provided");
		}
		if (empty($text)) {
			$this->e400("'text' not provided");
		}
		if (strlen($text) > 5000) {
			$this->e400("'text' must not exceed 5000 bytes");
		}

		$text = self::normalizeText($text);

		// Resolve hex ID to provider voice
		$resolved = self::resolveVoice($hexID);
		if (!$resolved) {
			$this->e400("Invalid voice '$hexID'");
		}
		$lang = $resolved['locale'] ?? 'en-US';
		$tier = $resolved['tier'];
		$creditRate = $resolved['creditsPerMinute'];

		// Provider-specific text adjustments (e.g., pronunciation fixes)
		if (method_exists($resolved['class'], 'fixPronunciation')) {
			$text = $resolved['class']::fixPronunciation($text);
		}

		$cacheKey = $this->computeCacheKey(
			$resolved['voiceID'], $text, $prompt, $lang,
			$resolved['cacheVersion'], $resolved['audioFormat']
		);

		// Check S3 cache
		$cached = $this->checkS3Cache($cacheKey);
		if ($cached) {
			// Cache hit -- use stored duration for exact credit cost
			$duration = $cached['duration'];
			$creditCost = $duration * $creditRate / 60;

			// Quota check
			$this->checkQuota($this->userID, $tier, $creditCost, $duration);

			$this->logUsage($this->userID, $tier, $creditCost, [
				'voiceID' => $resolved['voiceID'],
				'provider' => $resolved['provider'],
	
				'creditsPerMinute' => $creditRate,
				'duration' => $duration,
				'lang' => $lang,
				'text' => $text,
				'cacheHit' => true,
			]);
			$maxAge = self::AUDIO_CACHE_DAYS * 86400 - (time() - $cached['lastModified']);
			if ($maxAge > 0) {
				header("Cache-Control: private, max-age=$maxAge, immutable");
			}
			header("Location: " . $this->getCloudFrontURL($cacheKey), true, 302);
			return;
		}

		// Cache miss -- pre-flight quota check (estimate ~15 chars/sec)
		$estimatedDuration = strlen($text) / 15;
		$estimatedCreditCost = $estimatedDuration * $creditRate / 60;
		$this->checkQuota($this->userID, $tier, $estimatedCreditCost, $estimatedDuration);

		// Synthesize audio
		$options = array_merge($resolved, [
			'prompt' => $prompt,
			'locale' => $lang,
		]);
		$synthesisStart = hrtime(true);
		try {
			$result = $resolved['class']::synthesize($resolved['voice'], $text, $options);
		}
		catch (\Exception $e) {
			$this->logProviderError($resolved['provider']);
			throw $e;
		}
		$synthesisMS = (hrtime(true) - $synthesisStart) / 1e6;

		// If the provider returned empty audio (e.g., unspeakable input like punctuation),
		// substitute a minimal valid silent audio file so clients can play it without errors
		if (empty($result['audio'])) {
			$result['audio'] = base64_decode(self::$silentAudio[$result['mimeType']] ?? self::$silentAudio['audio/mpeg']);
		}

		// Parse audio duration
		$audioDuration = $this->getAudioDuration($result['audio']);
		if ($audioDuration > 0) {
			$creditCost = $audioDuration * $creditRate / 60;
		}
		else {
			$creditCost = $estimatedCreditCost;
		}

		// Upload to S3 and log usage
		$this->uploadToS3Cache($cacheKey, $result['audio'], $result['mimeType'], $audioDuration);
		$this->logUsage($this->userID, $tier, $creditCost, [
			'voiceID' => $resolved['voiceID'],
			'provider' => $resolved['provider'],

			'creditsPerMinute' => $creditRate,
			'duration' => $audioDuration,
			'lang' => $lang,
			'text' => $text,
			'cacheHit' => false,
			'synthesisMS' => $synthesisMS,
		]);

		header("Cache-Control: private, max-age=" . (self::AUDIO_CACHE_DAYS * 86400) . ", immutable");
		header("Location: " . $this->getCloudFrontURL($cacheKey), true, 302);
	}


	/**
	 * Arena mode for speak() -- no auth, no quota, fixed sample texts.
	 */
	private function speakArena(array $sampleTexts) {
		$hexID = $_GET['voice'] ?? '';

		if (empty($hexID)) {
			$this->e400("'voice' not provided");
		}

		$resolved = self::resolveVoice($hexID);
		if (!$resolved) {
			$this->e400("Invalid voice '$hexID'");
		}
		$lang = $resolved['locale'] ?? 'en-US';

		// Look up sample texts by language prefix, falling back to English
		$langPrefix = explode('-', $lang)[0];
		$samples = $sampleTexts[$langPrefix] ?? $sampleTexts['en'];
		$sampleIndex = (int) ($_GET['sample'] ?? 0);
		$sampleIndex = max(0, min($sampleIndex, count($samples) - 1));
		$text = $samples[$sampleIndex];

		$cacheKey = $this->computeCacheKey(
			$resolved['voiceID'], $text, null, $lang,
			$resolved['cacheVersion'], $resolved['audioFormat']
		);

		// Check S3 cache
		$cached = $this->checkS3Cache($cacheKey);
		if ($cached) {
			$maxAge = self::AUDIO_CACHE_DAYS * 86400 - (time() - $cached['lastModified']);
			if ($maxAge > 0) {
				header("Cache-Control: private, max-age=$maxAge, immutable");
			}
			header("Location: " . $this->getCloudFrontURL($cacheKey), true, 302);
			return;
		}

		// Synthesize, upload, redirect
		$options = array_merge($resolved, ['locale' => $lang]);
		try {
			$result = $resolved['class']::synthesize($resolved['voice'], $text, $options);
		}
		catch (\Exception $e) {
			$this->logProviderError($resolved['provider']);
			throw $e;
		}
		$audioDuration = $this->getAudioDuration($result['audio']);
		$this->uploadToS3Cache($cacheKey, $result['audio'], $result['mimeType'], $audioDuration);

		header("Cache-Control: private, max-age=" . (self::AUDIO_CACHE_DAYS * 86400) . ", immutable");
		header("Location: " . $this->getCloudFrontURL($cacheKey), true, 302);
	}


	public function credits() {
		$this->allowMethods(['GET']);

		if (empty($this->userID)) {
			$this->e400("API key not provided");
		}

		$standardUsage = $this->getCreditsRemaining($this->userID, 'standard');
		$premiumUsage = $this->getCreditsRemaining($this->userID, 'premium');

		header("Content-Type: application/json");
		echo json_encode([
			'standardCreditsRemaining' => $standardUsage['monthlyRemaining'],
			'premiumCreditsRemaining' => $premiumUsage['monthlyRemaining'],
		]);
	}


	public function addCredits() {
		$this->allowMethods(['POST']);

		if (!$this->permissions->isSuper()) {
			$this->e403();
		}

		if (empty($this->userID)) {
			$this->e400("Zotero-User header not provided");
		}

		$json = json_decode($this->body, true);
		if (!$json || !isset($json['credits'])) {
			$this->e400("'credits' not provided");
		}

		$credits = $json['credits'];
		if (!is_int($credits) || $credits <= 0) {
			$this->e400("'credits' must be a positive integer");
		}

		$tableName = Z_CONFIG::$TTS_TABLE;
		$now = gmdate('c');

		$ddb = Z_Core::$AWS->createDynamoDb();

		$ddb->putItem([
			'TableName' => $tableName,
			'Item' => [
				'PK' => ['S' => "USER#$this->userID"],
				'SK' => ['S' => "BUNDLE#PREMIUM#$now"],
				'creditsRemaining' => ['N' => (string) $credits],
				'creditsOriginal' => ['N' => (string) $credits],
				'createdAt' => ['S' => $now],
			],
		]);

		$premiumUsage = $this->getCreditsRemaining($this->userID, 'premium');

		header("Content-Type: application/json");
		echo json_encode([
			'creditsAdded' => $credits,
			'premiumCreditsRemaining' => $premiumUsage['monthlyRemaining'],
		]);
	}


	//
	// Provider loading and aggregation
	//

	private static function loadProviders(): void {
		if (self::$providerClasses !== null) return;
		self::$providerClasses = [];
		foreach (glob(Z_ENV_MODEL_PATH . 'tts/*.inc.php') as $file) {
			require_once($file);
			$className = 'Zotero_TTS_' . basename($file, '.inc.php');
			if (class_exists($className, false) && method_exists($className, 'getVoices')) {
				self::$providerClasses[] = $className;
			}
		}
	}


	private static function getVoices(?int $userID = null, string $lang = 'en-US', bool $includeArenaOnly = false): array {
		self::loadProviders();
		$isDev = $userID && in_array($userID, Z_CONFIG::$TTS_DEV_USERS);
		// Localized label templates
		$langPrefix = explode('-', $lang)[0];
		$labels = self::$voiceLabels[$lang] ?? self::$voiceLabels[$langPrefix] ?? self::$voiceLabels['en'];
		$result = [];
		foreach (self::$providerClasses as $class) {
			$provider = $class::getVoices($userID, $includeArenaOnly);
			$tier = $provider['tier'];
			// Add labels to each voice and remove number/gender
			foreach ($provider['voices'] as $hexID => &$v) {
				$v['label'] = sprintf($labels[$tier], $v['number']);
				if ($isDev) {
					$resolved = self::resolveVoice($hexID);
					if ($resolved) {
						$v['label'] .= ' (' . $resolved['voiceID'] . ')';
					}
				}
				unset($v['number']);
				unset($v['gender']);
			}
			unset($v);
			// Remove tier from provider object -- it's already the key
			unset($provider['tier']);
			$result[$tier][] = $provider;
		}
		// Sort providers within each tier by creditsPerMinute
		foreach ($result as &$providers) {
			usort($providers, function ($a, $b) {
				return $a['creditsPerMinute'] - $b['creditsPerMinute'];
			});
		}
		unset($providers);
		return $result;
	}


	private static function resolveVoice(string $hexID): ?array {
		self::loadProviders();
		foreach (self::$providerClasses as $class) {
			$resolved = $class::resolveVoiceID($hexID);
			if ($resolved !== null) {
				$resolved['class'] = $class;
				return $resolved;
			}
		}
		return null;
	}


	//
	// Quota and usage
	//

	private function getMonthlyPeriodKey(): string {
		$now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
		return $now->format('Y-m'); // e.g. "2025-12"
	}


	private function getDailyPeriodKey(): string {
		$now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
		return $now->format('Y-m-d'); // e.g. "2025-12-18"
	}


	private function getTTSCreditLimits(int $userID): array {
		$personalQuota = Zotero_Storage::getUserValues($userID);
		$hasPersonal = $personalQuota && $personalQuota['expiration'] >= time();

		$instQuota = Zotero_Storage::getInstitutionalUserQuota($userID);
		$hasInstitutional = !empty($instQuota);

		$limits = Z_CONFIG::$TTS_CREDIT_LIMITS;

		if ($hasInstitutional) {
			$subType = 'institutional';
		}
		else if ($hasPersonal) {
			$subType = 'personal';
		}
		else {
			$subType = 'free';
		}

		return [
			'standard' => $limits['standard'][$subType],
			'premium' => $limits['premium'][$subType],
		];
	}


	/**
	 * @return array{monthlyUsed:int, monthlyRemaining:int}
	 */
	private function getCreditsRemaining(int $userID, string $tier): array {
		$tableName = Z_CONFIG::$TTS_TABLE;
		$monthlyKey = $this->getMonthlyPeriodKey();
		$feature = $tier === 'standard' ? 'STANDARD' : 'PREMIUM';

		$ddb = Z_Core::$AWS->createDynamoDb();

		$result = $ddb->getItem([
			'TableName' => $tableName,
			'Key' => [
				'PK' => ['S' => "USER#$userID"],
				'SK' => ['S' => "COUNTER#{$feature}#{$monthlyKey}"],
			],
			'ConsistentRead' => true,
		]);

		$monthlyUsed = isset($result['Item']['creditsUsed']['N'])
			? (float) $result['Item']['creditsUsed']['N']
			: 0;

		$limits = $this->getTTSCreditLimits($userID);
		$subscriptionRemaining = (int) floor(max($limits[$tier] - $monthlyUsed, 0));

		// For premium tier, also include bundle credits
		$bundleCredits = 0;
		if ($tier === 'premium') {
			$bundleCredits = $this->getBundleCredits($ddb, $userID);
		}

		return [
			'monthlyUsed' => $monthlyUsed,
			'monthlyRemaining' => $subscriptionRemaining + $bundleCredits,
		];
	}


	/**
	 * Query all active bundles for a user and return total remaining credits.
	 */
	private function getBundleCredits(DynamoDbClient $ddb, int $userID): int {
		$tableName = Z_CONFIG::$TTS_TABLE;

		$result = $ddb->query([
			'TableName' => $tableName,
			'KeyConditionExpression' => 'PK = :pk AND begins_with(SK, :skPrefix)',
			'ExpressionAttributeValues' => [
				':pk' => ['S' => "USER#$userID"],
				':skPrefix' => ['S' => 'BUNDLE#PREMIUM#'],
			],
			'ConsistentRead' => true,
		]);

		$total = 0;
		foreach ($result['Items'] as $item) {
			$total += (int) $item['creditsRemaining']['N'];
		}
		return $total;
	}


	/**
	 * Deduct credits from the oldest bundles (FIFO).
	 */
	private function deductFromBundles(DynamoDbClient $ddb, int $userID, float $toDeduct): void {
		$tableName = Z_CONFIG::$TTS_TABLE;

		// Get all bundles sorted by SK (oldest first -- default DynamoDB sort)
		$result = $ddb->query([
			'TableName' => $tableName,
			'KeyConditionExpression' => 'PK = :pk AND begins_with(SK, :skPrefix)',
			'ExpressionAttributeValues' => [
				':pk' => ['S' => "USER#$userID"],
				':skPrefix' => ['S' => 'BUNDLE#PREMIUM#'],
			],
			'ConsistentRead' => true,
		]);

		$remaining = $toDeduct;
		foreach ($result['Items'] as $item) {
			if ($remaining <= 0) break;

			$sk = $item['SK']['S'];
			$bundleRemaining = (int) $item['creditsRemaining']['N'];
			$deductFromThis = min($remaining, $bundleRemaining);

			if ($deductFromThis >= $bundleRemaining) {
				// Bundle will be fully depleted -- delete it
				$ddb->deleteItem([
					'TableName' => $tableName,
					'Key' => [
						'PK' => ['S' => "USER#$userID"],
						'SK' => ['S' => $sk],
					],
				]);
			}
			else {
				// Deduct partial amount with conditional update
				try {
					$ddb->updateItem([
						'TableName' => $tableName,
						'Key' => [
							'PK' => ['S' => "USER#$userID"],
							'SK' => ['S' => $sk],
						],
						'UpdateExpression' => 'ADD creditsRemaining :neg',
						'ConditionExpression' => 'creditsRemaining >= :cost',
						'ExpressionAttributeValues' => [
							':neg' => ['N' => (string) -$deductFromThis],
							':cost' => ['N' => (string) $deductFromThis],
						],
					]);
				}
				catch (\Aws\DynamoDb\Exception\DynamoDbException $e) {
					if ($e->getAwsErrorCode() === 'ConditionalCheckFailedException') {
						// Bundle was depleted concurrently -- delete and continue
						$ddb->deleteItem([
							'TableName' => $tableName,
							'Key' => [
								'PK' => ['S' => "USER#$userID"],
								'SK' => ['S' => $sk],
							],
						]);
					}
					else {
						throw $e;
					}
				}
			}

			$remaining -= $deductFromThis;
		}
	}


	private function getDailyMinutesRemaining(int $userID): int {
		$tableName = Z_CONFIG::$TTS_TABLE;
		$dailyKey = $this->getDailyPeriodKey();

		$ddb = Z_Core::$AWS->createDynamoDb();

		$result = $ddb->getItem([
			'TableName' => $tableName,
			'Key' => [
				'PK' => ['S' => "USER#$userID"],
				'SK' => ['S' => "COUNTER#DAILY#$dailyKey"],
			],
			'ConsistentRead' => true,
		]);

		$minutesUsed = isset($result['Item']['minutesUsed']['N'])
			? (int) $result['Item']['minutesUsed']['N']
			: 0;

		return max(Z_CONFIG::$TTS_DAILY_LIMIT_MINUTES - $minutesUsed, 0);
	}


	private function checkQuota(int $userID, string $tier, float $estimatedCreditCost, float $estimatedDuration): void {
		$usage = $this->getCreditsRemaining($userID, $tier);
		if ($estimatedCreditCost > $usage['monthlyRemaining'] && !$this->testMode) {
			$this->e402("quota_exceeded");
		}
		$estimatedMinutes = (int) ceil($estimatedDuration / 60);
		$dailyMinutes = $this->getDailyMinutesRemaining($userID);
		if ($estimatedMinutes > $dailyMinutes && !$this->testMode) {
			$this->e402("daily_limit_exceeded");
		}
	}


	private function logProviderError(string $provider): void {
		if (!$provider) return;
		try {
			$ddb = Z_Core::$AWS->createDynamoDb();
			$dailyKey = $this->getDailyPeriodKey();
			$ddb->updateItem([
				'TableName' => Z_CONFIG::$TTS_TABLE,
				'Key' => [
					'PK' => ['S' => 'DAILY_STATS'],
					'SK' => ['S' => $dailyKey],
				],
				'UpdateExpression' => 'ADD #err :one',
				'ExpressionAttributeNames' => [
					'#err' => "{$provider}Errors",
				],
				'ExpressionAttributeValues' => [
					':one' => ['N' => '1'],
				],
			]);
		}
		catch (\Exception $e) {
			// Don't let stats logging prevent the original error from propagating
			error_log("Failed to log TTS provider error: " . $e->getMessage());
		}
	}


	private function logUsage(int $userID, string $tier, float $creditCost, array $meta = []): void {
		$creditCost = round($creditCost, 4);
		$tableName = Z_CONFIG::$TTS_TABLE;
		$monthlyKey = $this->getMonthlyPeriodKey();
		$dailyKey = $this->getDailyPeriodKey();
		$feature = $tier === 'standard' ? 'STANDARD' : 'PREMIUM';
		$now = gmdate('c');
		$durationMinutes = isset($meta['duration']) ? round($meta['duration'] / 60, 4) : 0;

		$ddb = Z_Core::$AWS->createDynamoDb();

		// Create event log entry
		$item = [
			'PK' => ['S' => "USER#$userID"],
			'SK' => ['S' => "EVENT#$now"],
			'timestamp' => ['S' => $now],
			'creditCost' => ['N' => (string) $creditCost],
			'tier' => ['S' => $tier],
		];
		if (!empty($meta['voiceID'])) {
			$item['voiceID'] = ['S' => $meta['voiceID']];
		}
		if (!empty($meta['provider'])) {
			$item['provider'] = ['S' => $meta['provider']];
		}
		if (isset($meta['creditsPerMinute'])) {
			$item['creditsPerMinute'] = ['N' => (string) $meta['creditsPerMinute']];
		}
		if (isset($meta['duration'])) {
			$item['duration'] = ['N' => (string) round($meta['duration'], 2)];
		}
		if (!empty($meta['lang'])) {
			$item['lang'] = ['S' => $meta['lang']];
		}
		if (isset($meta['cacheHit'])) {
			$item['cacheHit'] = ['BOOL' => $meta['cacheHit']];
		}
		$ddb->putItem([
			'TableName' => $tableName,
			'Item' => $item,
		]);

		// Update monthly credit counter
		$counterResult = $ddb->updateItem([
			'TableName' => $tableName,
			'Key' => [
				'PK' => ['S' => "USER#$userID"],
				'SK' => ['S' => "COUNTER#{$feature}#{$monthlyKey}"],
			],
			'UpdateExpression' => 'SET updatedAt = :now ADD creditsUsed :creditCost, requests :one',
			'ExpressionAttributeValues' => [
				':now' => ['S' => $now],
				':creditCost' => ['N' => (string) $creditCost],
				':one' => ['N' => '1'],
			],
			'ReturnValues' => 'ALL_NEW',
		]);

		// For premium tier, deduct from bundles if subscription credits exhausted
		if ($tier === 'premium') {
			$newMonthlyUsed = (float) $counterResult['Attributes']['creditsUsed']['N'];
			$limits = $this->getTTSCreditLimits($userID);
			$subscriptionLimit = $limits['premium'];
			$overage = $newMonthlyUsed - $subscriptionLimit;
			if ($overage > 0) {
				$toDeduct = min($creditCost, $overage);
				$this->deductFromBundles($ddb, $userID, $toDeduct);
			}
		}

		// Update daily minutes counter (across all tiers)
		$ddb->updateItem([
			'TableName' => $tableName,
			'Key' => [
				'PK' => ['S' => "USER#$userID"],
				'SK' => ['S' => "COUNTER#DAILY#$dailyKey"],
			],
			'UpdateExpression' => 'SET updatedAt = :now ADD minutesUsed :minutes, requests :one',
			'ExpressionAttributeValues' => [
				':now' => ['S' => $now],
				':minutes' => ['N' => (string) $durationMinutes],
				':one' => ['N' => '1'],
			],
		]);

		//
		// Aggregate stats -- skip for dev users so internal testing doesn't skew metrics
		//
		if (in_array($userID, Z_CONFIG::$TTS_DEV_USERS)) {
			return;
		}

		$voiceID = $meta['voiceID'] ?? '';
		$lang = $meta['lang'] ?? '';
		$provider = $meta['provider'] ?? '';
		$durationSeconds = isset($meta['duration']) ? round($meta['duration'], 2) : 0;
		$cacheHit = !empty($meta['cacheHit']);

		// Per-voice monthly stats
		if ($voiceID && $lang) {
			$voiceStatsSK = "$monthlyKey#$lang#$voiceID";

			$voiceStatsSetExpr = 'SET updatedAt = :now, tier = :tier';
			$voiceStatsValues = [
				':now' => ['S' => $now],
				':one' => ['N' => '1'],
				':dur' => ['N' => (string) $durationSeconds],
				':tier' => ['S' => $tier],
			];
			if ($provider) {
				$voiceStatsSetExpr .= ', provider = :provider';
				$voiceStatsValues[':provider'] = ['S' => $provider];
			}
			$ddb->updateItem([
				'TableName' => $tableName,
				'Key' => [
					'PK' => ['S' => 'VOICE_STATS'],
					'SK' => ['S' => $voiceStatsSK],
				],
				'UpdateExpression' => $voiceStatsSetExpr
					. " ADD requests :one, totalDurationSeconds :dur",
				'ExpressionAttributeValues' => $voiceStatsValues,
			]);

		}

		// Per-locale monthly stats
		if ($lang) {
			$localeUpdateExpr = 'SET updatedAt = :now'
				. ' ADD requests :one, totalDurationSeconds :dur';
			if ($provider) {
				$localeUpdateExpr .= ", {$provider}Requests :one, {$provider}DurationSeconds :dur";
			}
			$ddb->updateItem([
				'TableName' => $tableName,
				'Key' => [
					'PK' => ['S' => 'LOCALE_STATS'],
					'SK' => ['S' => "$monthlyKey#$lang"],
				],
				'UpdateExpression' => $localeUpdateExpr,
				'ExpressionAttributeValues' => [
					':now' => ['S' => $now],
					':one' => ['N' => '1'],
					':dur' => ['N' => (string) $durationSeconds],
				],
			]);
		}

		// Global daily stats
		$synthesisMS = isset($meta['synthesisMS']) ? round($meta['synthesisMS']) : 0;
		$dailyUpdateExpr = 'SET updatedAt = :now'
			. " ADD requests :one, totalDurationSeconds :dur";
		$dailyValues = [
			':now' => ['S' => $now],
			':one' => ['N' => '1'],
			':dur' => ['N' => (string) $durationSeconds],
		];
		if ($provider) {
			$dailyUpdateExpr .= ", {$provider}Requests :one, {$provider}DurationSeconds :dur";
			if (!$cacheHit && $synthesisMS > 0) {
				$dailyUpdateExpr .= ", {$provider}SynthesisMS :ms, {$provider}SynthesisCalls :one";
				$dailyValues[':ms'] = ['N' => (string) $synthesisMS];
			}
		}
		$ddb->updateItem([
			'TableName' => $tableName,
			'Key' => [
				'PK' => ['S' => 'DAILY_STATS'],
				'SK' => ['S' => $dailyKey],
			],
			'UpdateExpression' => $dailyUpdateExpr,
			'ExpressionAttributeValues' => $dailyValues,
		]);

		// Per-user monthly usage by provider (for setting credit limits)
		if ($provider) {
			$ddb->updateItem([
				'TableName' => $tableName,
				'Key' => [
					'PK' => ['S' => 'MONTHLY_USERS'],
					'SK' => ['S' => "$monthlyKey#$userID"],
				],
				'UpdateExpression' => 'SET updatedAt = :now'
					. " ADD {$provider}Requests :one, {$provider}DurationSeconds :dur",
				'ExpressionAttributeValues' => [
					':now' => ['S' => $now],
					':one' => ['N' => '1'],
					':dur' => ['N' => (string) $durationSeconds],
				],
			]);
		}

		// Text deduplication stats (cache ceiling analysis) -- only on cache misses
		if (!$cacheHit && $lang && $provider && !empty($meta['text'])) {
			$textHash = hash('sha256', json_encode([
				'text' => $meta['text'],
				'lang' => $lang,
			], JSON_UNESCAPED_UNICODE));
			try {
				$ddb->putItem([
					'TableName' => $tableName,
					'Item' => [
						'PK' => ['S' => 'TEXT_SEEN'],
						'SK' => ['S' => "$monthlyKey#$lang#$provider#$textHash"],
					],
					'ConditionExpression' => 'attribute_not_exists(PK)',
				]);
			}
			catch (\Aws\DynamoDb\Exception\DynamoDbException $e) {
				if ($e->getAwsErrorCode() === 'ConditionalCheckFailedException') {
					// Text already synthesized for a different voice -- track as duplicate
					$ddb->updateItem([
						'TableName' => $tableName,
						'Key' => [
							'PK' => ['S' => 'DAILY_STATS'],
							'SK' => ['S' => $dailyKey],
						],
						'UpdateExpression' => 'ADD #dup :one, #dupDur :dur',
						'ExpressionAttributeNames' => [
							'#dup' => "{$provider}DuplicateSyntheses",
							'#dupDur' => "{$provider}DuplicateDurationSeconds",
						],
						'ExpressionAttributeValues' => [
							':one' => ['N' => '1'],
							':dur' => ['N' => (string) $durationSeconds],
						],
					]);
				}
				else {
					throw $e;
				}
			}
		}
	}


	//
	// Cache
	//

	/**
	 * Compute a cache key for the given synthesis parameters.
	 * Returns "{hash}.{ext}" where ext is based on the provider's output format.
	 */
	/**
	 * Normalize text before cache-key computation and synthesis so that
	 * equivalent inputs share the same cache entry.
	 */
	private static function normalizeText(string $text): string {
		// Unicode NFC normalization
		if (class_exists('Normalizer')) {
			$text = \Normalizer::normalize($text, \Normalizer::FORM_C);
		}
		// Normalize line endings to \n
		$text = str_replace("\r\n", "\n", $text);
		$text = str_replace("\r", "\n", $text);
		// Collapse runs of whitespace (excluding newlines) to a single space
		$text = preg_replace('/[^\S\n]+/', ' ', $text);
		// Collapse runs of blank lines to a single newline
		$text = preg_replace('/\n{3,}/', "\n\n", $text);
		// Trim leading/trailing whitespace
		$text = trim($text);
		return $text;
	}


	private function computeCacheKey(
		string $voiceID, string $text, ?string $prompt, string $lang,
		int $cacheVersion, string $audioFormat
	): string {
		$canonical = json_encode([
			'v' => $cacheVersion,
			'voice' => $voiceID,
			'text' => $text,
			'prompt' => $prompt,
			'lang' => $lang,
		], JSON_UNESCAPED_UNICODE);
		$hash = hash('sha256', $canonical);

		$ext = $audioFormat === 'mp3' ? 'mp3' : 'ogg';

		return "$hash.$ext";
	}


	/**
	 * Check S3 for a cached audio file.
	 * Returns ['duration' => float, 'lastModified' => int] on hit, null on miss.
	 */
	private function checkS3Cache(string $key): ?array {
		$s3Client = Z_Core::$AWS->createS3();
		try {
			$result = $s3Client->headObject([
				'Bucket' => Z_CONFIG::$S3_BUCKET_TTS,
				'Key' => $key,
			]);
			$duration = (float) ($result['Metadata']['duration'] ?? 0);
			$lastModified = $result['LastModified']->getTimestamp();
			return ['duration' => $duration, 'lastModified' => $lastModified];
		}
		catch (\Aws\S3\Exception\S3Exception $e) {
			if ($e->getAwsErrorCode() == 'NoSuchKey' || $e->getAwsErrorCode() == 'NotFound') {
				return null;
			}
			throw $e;
		}
	}


	/**
	 * Upload synthesized audio to S3 with duration metadata.
	 */
	private function uploadToS3Cache(string $key, string $audioData, string $mimeType, float $duration): void {
		$s3Client = Z_Core::$AWS->createS3();
		$s3Client->putObject([
			'Bucket' => Z_CONFIG::$S3_BUCKET_TTS,
			'Key' => $key,
			'Body' => $audioData,
			'ContentType' => $mimeType,
			'Metadata' => [
				'duration' => (string) $duration,
			],
		]);
	}


	private function getCloudFrontURL(string $key): string {
		return 'https://' . Z_CONFIG::$TTS_AUDIO_DOMAIN . '/' . $key;
	}


	private function getAudioDuration(string $audioData): float {
		$getID3 = new \getID3();
		$tmpFile = tempnam(sys_get_temp_dir(), 'tts');
		file_put_contents($tmpFile, $audioData);
		$info = $getID3->analyze($tmpFile);
		unlink($tmpFile);
		return $info['playtime_seconds'] ?? 0;
	}


	//
	// Localized sample text
	//

	// "I'm [Standard/Premium] Voice N." keyed by language prefix and tier.
	// %d is the voice number.
	private static $sampleTexts = [
		'ar' => [
			'standard' => "أنا الصوت القياسي %d.",
			'premium' => "أنا الصوت المميز %d.",
		],
		'bg' => [
			'standard' => "Аз съм стандартен глас %d.",
			'premium' => "Аз съм премиум глас %d.",
		],
		'bn' => [
			'standard' => "আমি স্ট্যান্ডার্ড ভয়েস %d।",
			'premium' => "আমি প্রিমিয়াম ভয়েস %d।",
		],
		'cs' => [
			'standard' => "Jsem standardní hlas číslo %d.",
			'premium' => "Jsem prémiový hlas číslo %d.",
		],
		'da' => [
			'standard' => "Jeg er standardstemme %d.",
			'premium' => "Jeg er premiumstemme %d.",
		],
		'de' => [
			'standard' => "Ich bin Standardstimme %d.",
			'premium' => "Ich bin Premiumstimme %d.",
		],
		'el' => [
			'standard' => "Είμαι η τυπική φωνή νούμερο %d.",
			'premium' => "Είμαι η premium φωνή νούμερο %d.",
		],
		'en' => [
			'standard' => "I'm Standard Voice %d.",
			'premium' => "I'm Premium Voice %d.",
		],
		'es' => [
			'standard' => "Soy la voz estándar %d.",
			'premium' => "Soy la voz premium %d.",
		],
		'et' => [
			'standard' => "Olen standardhääl %d.",
			'premium' => "Olen premiumhääl %d.",
		],
		'fi' => [
			'standard' => "Olen standardiääni %d.",
			'premium' => "Olen premium-ääni %d.",
		],
		'fr' => [
			'standard' => "Je suis la voix standard %d.",
			'premium' => "Je suis la voix premium %d.",
		],
		'gu' => [
			'standard' => "હું સ્ટાન્ડર્ડ વૉઇસ %d છું.",
			'premium' => "હું પ્રીમિયમ વૉઇસ %d છું.",
		],
		'he' => [
			'standard' => "אני קול רגיל %d.",
			'premium' => "אני קול פרימיום %d.",
		],
		'hi' => [
			'standard' => "मैं स्टैंडर्ड वॉइस %d हूँ।",
			'premium' => "मैं प्रीमियम वॉइस %d हूँ।",
		],
		'hr' => [
			'standard' => "Ja sam standardni glas %d.",
			'premium' => "Ja sam premium glas %d.",
		],
		'hu' => [
			'standard' => "Standard hang %d vagyok.",
			'premium' => "Prémium hang %d vagyok.",
		],
		'id' => [
			'standard' => "Saya suara standar nomor %d.",
			'premium' => "Saya suara premium nomor %d.",
		],
		'it' => [
			'standard' => "Sono la voce standard %d.",
			'premium' => "Sono la voce premium %d.",
		],
		'ja' => [
			'standard' => "スタンダードボイス%dです。",
			'premium' => "プレミアムボイス%dです。",
		],
		'kn' => [
			'standard' => "ನಾನು ಸ್ಟ್ಯಾಂಡರ್ಡ್ ವಾಯ್ಸ್ %d.",
			'premium' => "ನಾನು ಪ್ರೀಮಿಯಂ ವಾಯ್ಸ್ %d.",
		],
		'ko' => [
			'standard' => "저는 스탠다드 음성 %d입니다.",
			'premium' => "저는 프리미엄 음성 %d입니다.",
		],
		'lt' => [
			'standard' => "Aš esu standartinis balsas %d.",
			'premium' => "Aš esu premium balsas %d.",
		],
		'lv' => [
			'standard' => "Es esmu standarta balss %d.",
			'premium' => "Es esmu premium balss %d.",
		],
		'ml' => [
			'standard' => "ഞാൻ സ്റ്റാൻഡേർഡ് വോയ്‌സ് %d ആണ്.",
			'premium' => "ഞാൻ പ്രീമിയം വോയ്‌സ് %d ആണ്.",
		],
		'mr' => [
			'standard' => "मी स्टँडर्ड व्हॉइस %d आहे.",
			'premium' => "मी प्रीमियम व्हॉइस %d आहे.",
		],
		'nb' => [
			'standard' => "Jeg er standardstemme %d.",
			'premium' => "Jeg er premiumstemme %d.",
		],
		'nl' => [
			'standard' => "Ik ben standaardstem %d.",
			'premium' => "Ik ben premiumstem %d.",
		],
		'pa' => [
			'standard' => "ਮੈਂ ਸਟੈਂਡਰਡ ਵੌਇਸ %d ਹਾਂ।",
			'premium' => "ਮੈਂ ਪ੍ਰੀਮੀਅਮ ਵੌਇਸ %d ਹਾਂ।",
		],
		'pl' => [
			'standard' => "Jestem standardowy głos numer %d.",
			'premium' => "Jestem głos premium numer %d.",
		],
		'pt' => [
			'standard' => "Eu sou a voz padrão %d.",
			'premium' => "Eu sou a voz premium %d.",
		],
		'ro' => [
			'standard' => "Eu sunt vocea standard %d.",
			'premium' => "Eu sunt vocea premium %d.",
		],
		'ru' => [
			'standard' => "Я — стандартный голос номер %d.",
			'premium' => "Я — премиум голос номер %d.",
		],
		'sk' => [
			'standard' => "Som štandardný hlas číslo %d.",
			'premium' => "Som prémiový hlas číslo %d.",
		],
		'sl' => [
			'standard' => "Jaz sem standardni glas številka %d.",
			'premium' => "Jaz sem premium glas številka %d.",
		],
		'sr' => [
			'standard' => "Ја сам стандардни глас број %d.",
			'premium' => "Ја сам премиум глас број %d.",
		],
		'sv' => [
			'standard' => "Jag är standardröst %d.",
			'premium' => "Jag är premiumröst %d.",
		],
		'sw' => [
			'standard' => "Mimi ni sauti ya kawaida nambari %d.",
			'premium' => "Mimi ni sauti ya premium nambari %d.",
		],
		'ta' => [
			'standard' => "நான் ஸ்டாண்டர்ட் குரல் %d.",
			'premium' => "நான் பிரீமியம் குரல் %d.",
		],
		'te' => [
			'standard' => "నేను స్టాండర్డ్ వాయిస్ %dని.",
			'premium' => "నేను ప్రీమియం వాయిస్ %dని.",
		],
		'th' => [
			'standard' => "ฉันคือเสียงมาตรฐานหมายเลข %d",
			'premium' => "ฉันคือเสียงพรีเมียมหมายเลข %d",
		],
		'tr' => [
			'standard' => "Ben standart ses %d.",
			'premium' => "Ben premium ses %d.",
		],
		'uk' => [
			'standard' => "Я — стандартний голос номер %d.",
			'premium' => "Я — преміум голос номер %d.",
		],
		'ur' => [
			'standard' => "میں معیاری آواز %d ہوں۔",
			'premium' => "میں پریمیم آواز %d ہوں۔",
		],
		'vi' => [
			'standard' => "Tôi là giọng tiêu chuẩn số %d.",
			'premium' => "Tôi là giọng cao cấp số %d.",
		],
		'yue' => [
			'standard' => "我係標準語音%d。",
			'premium' => "我係高端語音%d。",
		],
		'zh' => [
			'standard' => "我是标准语音%d。",
			'premium' => "我是高端语音%d。",
		],
	];

	// Localized voice labels for the /voices endpoint, keyed by language prefix
	// (or full locale where needed, e.g. zh-TW). %d is the voice number.
	private static $voiceLabels = [
		'af' => [
			'standard' => "Standaard Stem %d",
			'premium' => "Premium Stem %d",
		],
		'ar' => [
			'standard' => "الصوت القياسي %d",
			'premium' => "الصوت المميز %d",
		],
		'bg' => [
			'standard' => "Стандартен глас %d",
			'premium' => "Премиум глас %d",
		],
		'br' => [
			'standard' => "Mouezh standart %d",
			'premium' => "Mouezh premium %d",
		],
		'ca' => [
			'standard' => "Veu estàndard %d",
			'premium' => "Veu premium %d",
		],
		'cs' => [
			'standard' => "Standardní hlas číslo %d",
			'premium' => "Prémiový hlas číslo %d",
		],
		'da' => [
			'standard' => "Standardstemme %d",
			'premium' => "Premiumstemme %d",
		],
		'de' => [
			'standard' => "Standardstimme %d",
			'premium' => "Premiumstimme %d",
		],
		'el' => [
			'standard' => "Τυπική φωνή νούμερο %d",
			'premium' => "Premium φωνή νούμερο %d",
		],
		'en' => [
			'standard' => "Standard Voice %d",
			'premium' => "Premium Voice %d",
		],
		'es' => [
			'standard' => "Voz estándar %d",
			'premium' => "Voz premium %d",
		],
		'et' => [
			'standard' => "Standardhääl %d",
			'premium' => "Premiumhääl %d",
		],
		'eu' => [
			'standard' => "Ahots estandarra %d",
			'premium' => "Premium ahotsa %d",
		],
		'fa' => [
			'standard' => "صدای استاندارد شماره %d",
			'premium' => "صدای پریمیوم شماره %d",
		],
		'fi' => [
			'standard' => "Standardiääni %d",
			'premium' => "Premium-ääni %d",
		],
		'fr' => [
			'standard' => "Voix standard %d",
			'premium' => "Voix premium %d",
		],
		'gl' => [
			'standard' => "Voz estándar %d",
			'premium' => "Voz premium %d",
		],
		'he' => [
			'standard' => "קול רגיל %d",
			'premium' => "קול פרימיום %d",
		],
		'hr' => [
			'standard' => "Standardni glas %d",
			'premium' => "Premium glas %d",
		],
		'hu' => [
			'standard' => "Standard hang %d",
			'premium' => "Prémium hang %d",
		],
		'id' => [
			'standard' => "Suara standar nomor %d",
			'premium' => "Suara premium nomor %d",
		],
		'is' => [
			'standard' => "Staðalrödd %d",
			'premium' => "Úrvalsrödd %d",
		],
		'it' => [
			'standard' => "Voce standard %d",
			'premium' => "Voce premium %d",
		],
		'ja' => [
			'standard' => "スタンダードボイス%d",
			'premium' => "プレミアムボイス%d",
		],
		'km' => [
			'standard' => "សំឡេងស្តង់ដារ លេខ %d",
			'premium' => "សំឡេងព្រីមៀម លេខ %d",
		],
		'ko' => [
			'standard' => "스탠다드 음성 %d",
			'premium' => "프리미엄 음성 %d",
		],
		'lt' => [
			'standard' => "Standartinis balsas %d",
			'premium' => "Premium balsas %d",
		],
		'mn' => [
			'standard' => "Стандарт дуу хоолой %d",
			'premium' => "Премиум дуу хоолой %d",
		],
		'nb' => [
			'standard' => "Standardstemme %d",
			'premium' => "Premiumstemme %d",
		],
		'nl' => [
			'standard' => "Standaardstem %d",
			'premium' => "Premiumstem %d",
		],
		'nn' => [
			'standard' => "Standardrøyst %d",
			'premium' => "Premiumrøyst %d",
		],
		'pl' => [
			'standard' => "Standardowy głos numer %d",
			'premium' => "Głos premium numer %d",
		],
		'pt' => [
			'standard' => "Voz padrão %d",
			'premium' => "Voz premium %d",
		],
		'ro' => [
			'standard' => "Voce standard %d",
			'premium' => "Voce premium %d",
		],
		'ru' => [
			'standard' => "Стандартный голос номер %d",
			'premium' => "Премиум-голос номер %d",
		],
		'sk' => [
			'standard' => "Štandardný hlas číslo %d",
			'premium' => "Prémiový hlas číslo %d",
		],
		'sl' => [
			'standard' => "Standardni glas številka %d",
			'premium' => "Premium glas številka %d",
		],
		'sr' => [
			'standard' => "Стандардни глас број %d",
			'premium' => "Премиум глас број %d",
		],
		'sv' => [
			'standard' => "Standardröst %d",
			'premium' => "Premiumröst %d",
		],
		'ta' => [
			'standard' => "ஸ்டாண்டர்ட் குரல் %d",
			'premium' => "பிரீமியம் குரல் %d",
		],
		'th' => [
			'standard' => "เสียงมาตรฐานหมายเลข %d",
			'premium' => "เสียงพรีเมียมหมายเลข %d",
		],
		'tr' => [
			'standard' => "Standart ses %d",
			'premium' => "Premium ses %d",
		],
		'uk' => [
			'standard' => "Стандартний голос номер %d",
			'premium' => "Преміум-голос номер %d",
		],
		'vi' => [
			'standard' => "Giọng tiêu chuẩn số %d",
			'premium' => "Giọng cao cấp số %d",
		],
		'zh' => [
			'standard' => "标准语音%d",
			'premium' => "高端语音%d",
		],
		'zh-TW' => [
			'standard' => "標準語音%d",
			'premium' => "高端語音%d",
		],
	];
}
