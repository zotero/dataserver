/**
 * Test assertion helpers for API v2
 * These assertions check Atom feed elements instead of HTTP headers
 */

import { assert } from 'chai';
import { DOMParser } from '@xmldom/xmldom';
import { xpathSelect } from './xpath.js';

// Re-export common status assertions from the main assertions module
export {
	assert200,
	assert201,
	assert204,
	assert300,
	assert302,
	assert304,
	assert400,
	assert401,
	assert403,
	assert404,
	assert405,
	assert409,
	assert412,
	assert413,
	assert428,
	assert200ForObject,
	assertUnchangedForObject,
	assertFailedForObject,
	assert400ForObject,
	assert404ForObject,
	assert409ForObject,
	assert412ForObject,
	assert413ForObject,
	assert428ForObject,
	assertContentType
} from './assertions3.js';

/**
 * Assert total results from Atom feed's zapi:totalResults element
 * API v2 returns this in the feed body, not the HTTP header
 */
function assertTotalResults(response, expected) {
	let contentType = response.getHeader('Content-Type');
	if (contentType !== 'application/atom+xml') {
		throw new Error(`assertTotalResults (v2) expects Atom feed, got ${contentType}`);
	}
	let parser = new DOMParser();
	let xml = parser.parseFromString(response.getBody(), 'text/xml');
	let node = xpathSelect(xml, '//zapi:totalResults/text()', true);
	let totalResults = node ? node.nodeValue : null;
	assert.equal(parseInt(totalResults), expected, `Expected ${expected} total results, got ${totalResults}`);
}

/**
 * Assert number of results in response based on content type
 */
function assertNumResults(response, expected) {
	let contentType = response.getHeader('Content-Type');
	let count;

	if (contentType === 'application/json') {
		let json = JSON.parse(response.getBody());
		count = Array.isArray(json) ? json.length : Object.keys(json).length;
	}
	else if (contentType && contentType.startsWith('text/plain')) {
		let rows = response.getBody().trim().split('\n').filter(line => line);
		count = rows.length;
	}
	else if (contentType === 'application/atom+xml') {
		let parser = new DOMParser();
		let xml = parser.parseFromString(response.getBody(), 'text/xml');
		let entries = xpathSelect(xml, '//atom:entry');
		count = entries.length;
	}
	else if (contentType === 'application/x-bibtex') {
		// Count @-prefixed entries
		let matches = response.getBody().match(/\n@/g);
		count = matches ? matches.length : 0;
	}
	else {
		throw new Error(`Unknown content type for assertNumResults: ${contentType}`);
	}

	assert.equal(count, expected, `Expected ${expected} results, got ${count}`);
}

export {
	assertTotalResults,
	assertNumResults
};
