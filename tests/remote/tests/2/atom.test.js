/**
 * Atom API tests for API v2
 * Port of tests/remote/tests/API/2/AtomTest.php
 */

import { assert } from 'chai';
import config from 'config';
import { API } from '../../api2.js';
import {
	assert200
} from '../../assertions3.js';
import { xpathSelect } from '../../xpath.js';
import { setup } from '../../setup.js';

describe('Atom (API v2)', function() {
	this.timeout(30000);

	let itemKeys = [];

	before(async function() {
		await setup();
		API.useAPIKey(config.get('apiKey'));
		API.useAPIVersion(2);
		await API.userClear(config.get('userID'));

		// Create test data
		let key = await API.createItem('book', {
			title: 'Title',
			creators: [
				{
					creatorType: 'author',
					firstName: 'First',
					lastName: 'Last'
				}
			]
		}, 'key');
		itemKeys.push(key);

		key = await API.createItem('book', {
			title: 'Title 2',
			creators: [
				{
					creatorType: 'author',
					firstName: 'First',
					lastName: 'Last'
				},
				{
					creatorType: 'editor',
					firstName: 'Ed',
					lastName: 'McEditor'
				}
			]
		}, 'key');
		itemKeys.push(key);
	});

	after(async function() {
		await API.userClear(config.get('userID'));
	});

	// PHP: testFeedURIs
	it('should return correct feed URIs', async function() {
		let userID = config.get('userID');

		let response = await API.userGet(
			userID,
			`items?key=${config.get('apiKey')}`
		);
		assert200(response);
		let xml = API.getXMLFromResponse(response);
		let links = xpathSelect(xml, '/atom:feed/atom:link');
		assert.equal(links[0].getAttribute('href'), `${config.get('apiURLPrefix')}users/${userID}/items`);

		// 'order'/'sort' should stay as-is (not turn into 'sort'/'direction' like in v3)
		response = await API.userGet(
			userID,
			`items?key=${config.get('apiKey')}&order=dateModified&sort=asc`
		);
		assert200(response);
		xml = API.getXMLFromResponse(response);
		links = xpathSelect(xml, '/atom:feed/atom:link');
		assert.equal(links[0].getAttribute('href'), `${config.get('apiURLPrefix')}users/${userID}/items?order=dateModified&sort=asc`);
	});

	// PHP: testMultiContent
	it('should return multi-content', async function() {
		let keyStr = itemKeys.join(',');

		let response = await API.userGet(
			config.get('userID'),
			`items?key=${config.get('apiKey')}&itemKey=${keyStr}&content=bib,json`
		);
		assert200(response);
		let xml = API.getXMLFromResponse(response);
		let totalResults = xpathSelect(xml, '/atom:feed/zapi:totalResults/text()', true);
		assert.equal(parseInt(totalResults.nodeValue), itemKeys.length);

		let entries = xpathSelect(xml, '//atom:entry');
		assert.lengthOf(entries, itemKeys.length);

		for (let entry of entries) {
			let keyNode = xpathSelect(entry, 'zapi:key/text()', true);
			let key = keyNode ? keyNode.nodeValue : '';
			assert.include(itemKeys, key);

			// Check content has both bib and json subcontents
			let contentNodes = xpathSelect(entry, 'atom:content');
			assert.lengthOf(contentNodes, 1);

			let subcontents = xpathSelect(entry, 'atom:content/zapi:subcontent');
			assert.lengthOf(subcontents, 2);
		}
	});

	// PHP: testMultiContentCached
	it('should return cached multi-content', async function() {
		// Re-run the multi-content test to verify caching
		let keyStr = itemKeys.join(',');

		let response = await API.userGet(
			config.get('userID'),
			`items?key=${config.get('apiKey')}&itemKey=${keyStr}&content=bib,json`
		);
		assert200(response);
		let xml = API.getXMLFromResponse(response);
		let totalResults = xpathSelect(xml, '/atom:feed/zapi:totalResults/text()', true);
		assert.equal(parseInt(totalResults.nodeValue), itemKeys.length);
	});
});
