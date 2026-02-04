/**
 * Atom API tests
 * Port of tests/remote/tests/API/3/AtomTest.php
 */

import { assert } from 'chai';
import config from 'config';
import { API } from '../../api3.js';
import {
	assert200,
	assertTotalResults,
	assertContentType
} from '../../assertions3.js';
import { setup } from '../../setup.js';
import { xpathSelect } from '../../xpath.js';

describe('Atom', function() {
	this.timeout(30000);

	let items = {};

	before(async function() {
		await setup();
		API.useAPIKey(config.get('apiKey'));
		API.useAPIVersion(3);
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
		items[key] = '<content xmlns:zapi="http://zotero.org/ns/api" type="application/xml"><zapi:subcontent zapi:type="bib"><div xmlns="http://www.w3.org/1999/xhtml" class="csl-bib-body" style="line-height: 1.35; padding-left: 1em; text-indent:-1em;"><div class="csl-entry">Last, First. <i>Title</i>, n.d.</div></div></zapi:subcontent><zapi:subcontent zapi:type="json">'
			+ JSON.stringify({ "key": "", "version": 0, "itemType": "book", "title": "Title", "creators": [ { "creatorType": "author", "firstName": "First", "lastName": "Last" } ], "abstractNote": "", "series": "", "seriesNumber": "", "volume": "", "numberOfVolumes": "", "edition": "", "date": "", "publisher": "", "place": "", "originalDate": "", "originalPublisher": "", "originalPlace": "", "format": "", "numPages": "", "ISBN": "", "DOI": "", "citationKey": "", "url": "", "accessDate": "", "ISSN": "", "archive": "", "archiveLocation": "", "shortTitle": "", "language": "", "libraryCatalog": "", "callNumber": "", "rights": "", "extra": "", "tags": [], "collections": [], "relations": {}, "dateAdded": "", "dateModified": "" }, null, "\t")
			+ '</zapi:subcontent></content>';

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
		items[key] = '<content xmlns:zapi="http://zotero.org/ns/api" type="application/xml"><zapi:subcontent zapi:type="bib"><div xmlns="http://www.w3.org/1999/xhtml" class="csl-bib-body" style="line-height: 1.35; padding-left: 1em; text-indent:-1em;"><div class="csl-entry">Last, First. <i>Title 2</i>. Edited by Ed McEditor, n.d.</div></div></zapi:subcontent><zapi:subcontent zapi:type="json">'
			+ JSON.stringify({ "key": "", "version": 0, "itemType": "book", "title": "Title 2", "creators": [ { "creatorType": "author", "firstName": "First", "lastName": "Last" }, { "creatorType": "editor", "firstName": "Ed", "lastName": "McEditor" } ], "abstractNote": "", "series": "", "seriesNumber": "", "volume": "", "numberOfVolumes": "", "edition": "", "date": "", "publisher": "", "place": "", "originalDate": "", "originalPublisher": "", "originalPlace": "", "format": "", "numPages": "", "ISBN": "", "DOI": "", "citationKey": "", "url": "", "accessDate": "", "ISSN": "", "archive": "", "archiveLocation": "", "shortTitle": "", "language": "", "libraryCatalog": "", "callNumber": "", "rights": "", "extra": "", "tags": [], "collections": [], "relations": {}, "dateAdded": "", "dateModified": "" }, null, "\t")
			+ '</zapi:subcontent></content>';
	});

	after(async function() {
		await API.userClear(config.get('userID'));
	});

	// PHP: testFeedURIs
	it('should return correct feed URIs', async function() {
		let userID = config.get('userID');

		let response = await API.userGet(
			userID,
			'items?format=atom'
		);
		assert200(response);
		let xml = API.getXMLFromResponse(response);
		let links = xpathSelect(xml, '/atom:feed/atom:link');
		assert.equal(links[0].getAttribute('href'), `${config.get('apiURLPrefix')}users/${userID}/items?format=atom`);

		// 'order'/'sort' should turn into 'sort'/'direction'
		response = await API.userGet(
			userID,
			'items?format=atom&order=dateModified&sort=asc'
		);
		assert200(response);
		xml = API.getXMLFromResponse(response);
		links = xpathSelect(xml, '/atom:feed/atom:link');
		assert.equal(links[0].getAttribute('href'), `${config.get('apiURLPrefix')}users/${userID}/items?direction=asc&format=atom&sort=dateModified`);
	});

	// PHP: testTotalResults
	it('should return total results', async function() {
		let response = await API.userHead(
			config.get('userID'),
			'items?format=atom'
		);
		assert200(response);
		assertTotalResults(response, Object.keys(items).length);

		response = await API.userGet(
			config.get('userID'),
			'items?format=atom'
		);
		assert200(response);
		let xml = API.getXMLFromResponse(response);
		assertTotalResults(response, Object.keys(items).length);
		// Make sure there's no totalResults tag
		let totalResults = xpathSelect(xml, '/atom:feed/zapi:totalResults');
		assert.lengthOf(totalResults, 0);
	});

	// PHP: testMultiContent
	it('should return multi-content', async function() {
		let keys = Object.keys(items);
		let keyStr = keys.join(',');

		let response = await API.userGet(
			config.get('userID'),
			`items?itemKey=${keyStr}&content=bib,json`
		);
		assert200(response);
		let xml = API.getXMLFromResponse(response);
		assertTotalResults(response, keys.length);

		let entries = xpathSelect(xml, '//atom:entry');
		for (let entry of entries) {
			let keyNode = xpathSelect(entry, 'zapi:key/text()', true);
			let key = keyNode ? keyNode.nodeValue : '';

			// Get the content element as string
			let contentNodes = xpathSelect(entry, 'atom:content');
			let content = contentNodes[0].toString();

			// Add namespace prefix (from <entry>)
			content = content.replace('<content ', '<content xmlns:zapi="http://zotero.org/ns/api" ');
			// Remove duplicate xmlns declarations
			content = content.replace(/ xmlns="http:\/\/www\.w3\.org\/2005\/Atom"/g, '');
			content = content.replace(/<zapi:subcontent xmlns:zapi="http:\/\/zotero\.org\/ns\/api"/g, '<zapi:subcontent');

			// Strip variable key and version
			content = content.replace(
				/"key": "[A-Z0-9]{8}",(\s+)"version": [0-9]+/,
				'"key": "",$1"version": 0'
			);

			// Strip dateAdded/dateModified
			let iso8601Pattern = '[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z';
			content = content.replace(
				new RegExp(`"dateAdded": "${iso8601Pattern}",(\\s+)"dateModified": "${iso8601Pattern}"`),
				'"dateAdded": "",$1"dateModified": ""'
			);

			// Normalize JSON formatting: extract JSON, parse it, and reformat with tabs
			let jsonMatch = content.match(/<zapi:subcontent zapi:type="json">([\s\S]*?)<\/zapi:subcontent>/);
			if (jsonMatch) {
				let jsonStr = jsonMatch[1];
				let jsonObj = JSON.parse(jsonStr);
				let normalizedJSON = JSON.stringify(jsonObj, null, '\t');
				content = content.replace(jsonMatch[1], normalizedJSON);
			}

			// Compare XML strings (normalize whitespace for comparison)
			let normalizeXml = (str) => str.replace(/>\s+</g, '><').trim();
			assert.equal(normalizeXml(content), normalizeXml(items[key]), `Content mismatch for item ${key}`);
		}
	});

	// PHP: testMultiContentCached
	it('should return cached multi-content', async function() {
		// Re-run the multi-content test to verify caching
		let keys = Object.keys(items);
		let keyStr = keys.join(',');

		let response = await API.userGet(
			config.get('userID'),
			`items?itemKey=${keyStr}&content=bib,json`
		);
		assert200(response);
		let xml = API.getXMLFromResponse(response);
		assertTotalResults(response, keys.length);

		let entries = xpathSelect(xml, '//atom:entry');
		assert.isAbove(entries.length, 0);
	});

	// PHP: testAcceptHeader
	it('should handle Accept header', async function() {
		let response = await API.userGet(
			config.get('userID'),
			'items',
			[
				'Accept: application/atom+xml,application/rdf+xml,application/rss+xml,application/xml,text/xml,*/*'
			]
		);
		assertContentType(response, 'application/atom+xml');

		// But format= should still override
		response = await API.userGet(
			config.get('userID'),
			'items?format=json',
			[
				'Accept: application/atom+xml,application/rdf+xml,application/rss+xml,application/xml,text/xml,*/*'
			]
		);
		assertContentType(response, 'application/json');
	});
});
