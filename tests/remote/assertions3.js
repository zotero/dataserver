/**
 * Test assertion helpers
 * Used by API internally and available for direct use in tests
 */

import { assert } from 'chai';
import { DOMParser } from '@xmldom/xmldom';
import { xpathSelect } from './xpath.js';

// Factory for HTTP status code assertions
function assertStatus(expected) {
	return function (response, expectedMessage = false) {
		let status = response.getStatus();
		let message = `Expected ${expected}, got ${status}: ${response.getBody()}`;
		if (expectedMessage) {
			message = expectedMessage;
		}
		assert.equal(status, expected, message);
	};
}

// Generate status code assertions
let assert200 = assertStatus(200);
let assert201 = assertStatus(201);
let assert204 = assertStatus(204);
let assert300 = assertStatus(300);
let assert302 = assertStatus(302);
let assert304 = assertStatus(304);
let assert400 = assertStatus(400);
let assert401 = assertStatus(401);
let assert403 = assertStatus(403);
let assert404 = assertStatus(404);
let assert405 = assertStatus(405);
let assert409 = assertStatus(409);
let assert412 = assertStatus(412);
let assert413 = assertStatus(413);
let assert428 = assertStatus(428);

function assert200ForObject(response, _expectedMessage = false, index = 0) {
	assert200(response);
	let json = JSON.parse(response.getBody());
	assert.isNotNull(json);
	// API v3 uses 'successful', API v2 uses 'success'
	if (json.successful) {
		assert.property(json.successful, index);
	}
	// Both versions have 'success' (v3 has it for backwards compat)
	assert.property(json, 'success');
	assert.property(json.success, index);
}

function assertUnchangedForObject(response, index = 0) {
	assert200(response);
	let json = JSON.parse(response.getBody());
	assert.isNotNull(json);
	assert.property(json, 'unchanged');
	assert.property(json.unchanged, index);
}

function assertFailedForObject(response, expectedCode, expectedMessage = false, index = 0) {
	// Batch API returns 200 with errors in the 'failed' object
	assert200(response);
	let json = JSON.parse(response.getBody());
	assert.isNotNull(json);
	assert.property(json, 'failed');
	assert.property(json.failed, index);
	assert.equal(json.failed[index].code, expectedCode, `Expected error code ${expectedCode}, got ${json.failed[index].code}`);
	if (expectedMessage) {
		assert.equal(json.failed[index].message, expectedMessage);
	}
}

// Factory for object-level failure assertions
function assertFailedForObjectWithCode(code) {
	return function (response, expectedMessage = false, index = 0) {
		assertFailedForObject(response, code, expectedMessage, index);
	};
}

let assert400ForObject = assertFailedForObjectWithCode(400);
let assert404ForObject = assertFailedForObjectWithCode(404);
let assert409ForObject = assertFailedForObjectWithCode(409);
let assert412ForObject = assertFailedForObjectWithCode(412);
let assert413ForObject = assertFailedForObjectWithCode(413);
let assert428ForObject = assertFailedForObjectWithCode(428);

/**
 * Assert total results from HTTP Total-Results header
 * API v3 returns this as an HTTP header
 * For API v2 tests, use assertTotalResults from assertions2.js instead
 */
function assertTotalResults(response, expected) {
	let totalResults = response.getHeader('Total-Results');
	assert.equal(parseInt(totalResults), expected, `Expected ${expected} total results, got ${totalResults}`);
}

function assertNumResults(response, expected) {
	let contentType = response.getHeader('Content-Type');
	let body = response.getBody();
	let count;

	if (contentType === 'application/json') {
		let json = JSON.parse(body);
		count = Array.isArray(json) ? json.length : Object.keys(json).length;
	}
	else if (contentType && contentType.startsWith('text/plain')) {
		let rows = body.trim().split('\n').filter(line => line);
		count = rows.length;
	}
	else if (contentType === 'application/atom+xml' || body.trimStart().startsWith('<?xml')) {
		// Handle Atom XML - also check body for XML since API v1 may return wrong Content-Type
		let parser = new DOMParser();
		let xml = parser.parseFromString(body, 'text/xml');
		let entries = xpathSelect(xml, '//atom:entry');
		count = entries.length;
	}
	else if (contentType === 'application/x-bibtex') {
		// Count @-prefixed entries
		let matches = body.match(/\n@/g);
		count = matches ? matches.length : 0;
	}
	else {
		throw new Error(`Unknown content type for assertNumResults: ${contentType}`);
	}

	assert.equal(count, expected, `Expected ${expected} results, got ${count}`);
}

function assertContentType(response, expected) {
	let contentType = response.getHeader('Content-Type');
	assert.equal(contentType, expected, `Expected Content-Type ${expected}, got ${contentType}`);
}

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
	assertTotalResults,
	assertNumResults,
	assertContentType
};
