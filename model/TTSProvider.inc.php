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

/**
 * Provider-internal alignment shape (what synthesize() returns in 'timestamps'):
 *   ['word' => string, 'start' => float, 'end' => float]
 *
 * Public response shape (what the controller emits, after coalesceAlignment):
 *   ['start' => float, 'end' => float, 'charStart' => int, 'charEnd' => int]
 *   - start/end: seconds from the start of the audio
 *   - charStart/charEnd: codepoint offsets into the (post-normalizeText) text
 *     the client sent; half-open like JS substring()
 */
class Zotero_TTSProvider {
	// Subclasses override to true if synthesize() returns 'timestamps'.
	const SUPPORTS_WORD_TIMESTAMPS = false;


	/**
	 * @return array{httpCode: int, body: string}
	 */
	protected static function curlPost(string $url, array $headers, string $body): array {
		$ch = curl_init($url);
		curl_setopt($ch, CURLOPT_POST, true);
		curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
		curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
		curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
		curl_setopt($ch, CURLOPT_TIMEOUT, 20);
		$response = curl_exec($ch);
		$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
		$error = curl_error($ch);
		curl_close($ch);

		if ($error) {
			throw new \Exception("cURL error: $error");
		}

		return ['body' => $response, 'httpCode' => $httpCode];
	}


	/**
	 * Convert provider alignment for the transformed (post-fixPronunciation)
	 * text into the public response shape, with codepoint offsets into the
	 * original text.
	 *
	 * $originalText: text the client sent (after normalizeText, before
	 *                fixPronunciation). charStart/charEnd index into this.
	 * $segments:     ordered list returned by fixPronunciation() whose pieces
	 *                concatenate to the text passed to the provider; each is
	 *                ['original' => string, 'replacement' => string|null].
	 *                When null/empty, the original text was sent unchanged.
	 *
	 * Substituted spans collapse: all alignment words inside a replacement
	 * become a single output entry whose [charStart, charEnd] covers the full
	 * original substring and whose [start, end] spans the substitution's audio.
	 */
	public static function coalesceAlignment(
		array $alignment, string $originalText, ?array $segments = null
	): array {
		if (empty($alignment)) {
			return [];
		}
		if (empty($segments)) {
			$segments = [['original' => $originalText, 'replacement' => null]];
		}

		// Compute parallel byte ranges for each segment in the original text
		// and the transformed text. Concatenating replacement (or original
		// when no replacement) yields the transformed text.
		$built = [];
		$origPos = 0;
		$transPos = 0;
		$transformed = '';
		foreach ($segments as $seg) {
			$origLen = strlen($seg['original']);
			$piece = $seg['replacement'] ?? $seg['original'];
			$transLen = strlen($piece);
			$built[] = [
				'origStart' => $origPos,
				'origEnd' => $origPos + $origLen,
				'transStart' => $transPos,
				'transEnd' => $transPos + $transLen,
				'isReplacement' => isset($seg['replacement']) && $seg['replacement'] !== null,
			];
			$transformed .= $piece;
			$origPos += $origLen;
			$transPos += $transLen;
		}

		$out = [];
		$cursor = 0;
		$pending = null;
		$pendingSegIdx = -1;

		foreach ($alignment as $a) {
			$word = $a['word'] ?? '';
			if ($word === '' || preg_match('/^\s*$/u', $word)) {
				continue;
			}

			$pos = strpos($transformed, $word, $cursor);
			if ($pos === false) {
				// Couldn't locate -- skip; flush any pending replacement.
				if ($pending !== null) {
					$out[] = $pending;
					$pending = null;
					$pendingSegIdx = -1;
				}
				continue;
			}
			$cursor = $pos + strlen($word);

			$segIdx = null;
			foreach ($built as $i => $b) {
				if ($pos >= $b['transStart'] && $pos < $b['transEnd']) {
					$segIdx = $i;
					break;
				}
			}
			if ($segIdx === null) {
				if ($pending !== null) {
					$out[] = $pending;
					$pending = null;
					$pendingSegIdx = -1;
				}
				continue;
			}
			$b = $built[$segIdx];

			if ($b['isReplacement']) {
				if ($pending === null || $pendingSegIdx !== $segIdx) {
					if ($pending !== null) {
						$out[] = $pending;
					}
					$pending = [
						'start' => $a['start'],
						'end' => $a['end'],
						'charStart' => self::byteToCharOffset($originalText, $b['origStart']),
						'charEnd' => self::byteToCharOffset($originalText, $b['origEnd']),
					];
					$pendingSegIdx = $segIdx;
				}
				else {
					$pending['end'] = $a['end'];
				}
			}
			else {
				if ($pending !== null) {
					$out[] = $pending;
					$pending = null;
					$pendingSegIdx = -1;
				}
				// Kept span: byte offset within segment is identical in both
				// transformed and original; segment-relative shift is
				// origStart - transStart.
				$origByteStart = $b['origStart'] + ($pos - $b['transStart']);
				$origByteEnd = $origByteStart + strlen($word);
				$out[] = [
					'start' => $a['start'],
					'end' => $a['end'],
					'charStart' => self::byteToCharOffset($originalText, $origByteStart),
					'charEnd' => self::byteToCharOffset($originalText, $origByteEnd),
				];
			}
		}

		if ($pending !== null) {
			$out[] = $pending;
		}

		return $out;
	}


	private static function byteToCharOffset(string $text, int $byteOffset): int {
		if ($byteOffset <= 0) return 0;
		return mb_strlen(substr($text, 0, $byteOffset));
	}
}
