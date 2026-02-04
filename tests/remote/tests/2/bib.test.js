/**
 * Bibliography tests for API v2
 * Port of tests/remote/tests/API/2/BibTest.php
 */

import { assert } from 'chai';
import config from 'config';
import { API } from '../../api2.js';
import {
	assert200
} from '../../assertions3.js';
import { xpathSelect } from '../../xpath.js';
import { setup } from '../../setup.js';

// Helper to strip inherited atom namespace from content element
function stripAtomNamespace(content) {
	return content.replace(/ xmlns="http:\/\/www\.w3\.org\/2005\/Atom"/g, '');
}

describe('Bibliography (API v2)', function() {
	this.timeout(30000);

	const styles = ['default', 'apa'];
	let items = {};

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
		items[key] = {
			citation: {
				default: '<content xmlns:zapi="http://zotero.org/ns/api" zapi:type="citation" type="xhtml"><span xmlns="http://www.w3.org/1999/xhtml">Last, <i>Title</i>.</span></content>',
				apa: '<content xmlns:zapi="http://zotero.org/ns/api" zapi:type="citation" type="xhtml"><span xmlns="http://www.w3.org/1999/xhtml">(Last, n.d.)</span></content>'
			},
			bib: {
				default: '<content xmlns:zapi="http://zotero.org/ns/api" zapi:type="bib" type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml" class="csl-bib-body" style="line-height: 1.35; padding-left: 1em; text-indent:-1em;"><div class="csl-entry">Last, First. <i>Title</i>, n.d.</div></div></content>',
				apa: '<content xmlns:zapi="http://zotero.org/ns/api" zapi:type="bib" type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml" class="csl-bib-body" style="line-height: 2; padding-left: 1em; text-indent:-1em;"><div class="csl-entry">Last, F. (n.d.). <i>Title</i>.</div></div></content>'
			}
		};

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
		items[key] = {
			citation: {
				default: '<content xmlns:zapi="http://zotero.org/ns/api" zapi:type="citation" type="xhtml"><span xmlns="http://www.w3.org/1999/xhtml">Last, <i>Title 2</i>.</span></content>',
				apa: '<content xmlns:zapi="http://zotero.org/ns/api" zapi:type="citation" type="xhtml"><span xmlns="http://www.w3.org/1999/xhtml">(Last, n.d.)</span></content>'
			},
			bib: {
				default: '<content xmlns:zapi="http://zotero.org/ns/api" zapi:type="bib" type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml" class="csl-bib-body" style="line-height: 1.35; padding-left: 1em; text-indent:-1em;"><div class="csl-entry">Last, First. <i>Title 2</i>. Edited by Ed McEditor, n.d.</div></div></content>',
				apa: '<content xmlns:zapi="http://zotero.org/ns/api" zapi:type="bib" type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml" class="csl-bib-body" style="line-height: 2; padding-left: 1em; text-indent:-1em;"><div class="csl-entry">Last, F. (n.d.). <i>Title 2</i> (E. McEditor, Ed.).</div></div></content>'
			}
		};
	});

	after(async function() {
		await API.userClear(config.get('userID'));
	});

	// PHP: testContentCitationSingle
	it('should return citation content for single item', async function() {
		for (let style of styles) {
			for (let key of Object.keys(items)) {
				let url = `items/${key}?key=${config.get('apiKey')}&content=citation`;
				if (style !== 'default') {
					url += `&style=${style}`;
				}
				let response = await API.userGet(
					config.get('userID'),
					url
				);
				assert200(response);
				let content = stripAtomNamespace(API.getContentFromResponse(response));
				API.assertXmlStringEqualsXmlString(items[key].citation[style], content);
			}
		}
	});

	// PHP: testContentCitationMulti
	it('should return citation content for multiple items', async function() {
		let keys = Object.keys(items);
		let keyStr = keys.join(',');

		for (let style of styles) {
			let url = `items?key=${config.get('apiKey')}&itemKey=${keyStr}&content=citation`;
			if (style !== 'default') {
				url += `&style=${style}`;
			}
			let response = await API.userGet(
				config.get('userID'),
				url
			);
			assert200(response);
			let xml = API.getXMLFromResponse(response);
			let totalResults = xpathSelect(xml, '/atom:feed/zapi:totalResults/text()', true);
			assert.equal(parseInt(totalResults.nodeValue), keys.length);

			let entries = xpathSelect(xml, '//atom:entry');
			for (let entry of entries) {
				let keyNode = xpathSelect(entry, 'zapi:key/text()', true);
				let key = keyNode.nodeValue;
				let contentNode = xpathSelect(entry, 'atom:content', true);
				let content = stripAtomNamespace(contentNode.toString());
				API.assertXmlStringEqualsXmlString(items[key].citation[style], content);
			}
		}
	});

	// PHP: testContentBibSingle
	it('should return bib content for single item', async function() {
		for (let style of styles) {
			for (let key of Object.keys(items)) {
				let url = `items/${key}?key=${config.get('apiKey')}&content=bib`;
				if (style !== 'default') {
					url += `&style=${style}`;
				}
				let response = await API.userGet(
					config.get('userID'),
					url
				);
				assert200(response);
				let content = stripAtomNamespace(API.getContentFromResponse(response));
				API.assertXmlStringEqualsXmlString(items[key].bib[style], content);
			}
		}
	});

	// PHP: testContentBibMulti
	it('should return bib content for multiple items', async function() {
		let keys = Object.keys(items);
		let keyStr = keys.join(',');

		for (let style of styles) {
			let url = `items?key=${config.get('apiKey')}&itemKey=${keyStr}&content=bib`;
			if (style !== 'default') {
				url += `&style=${style}`;
			}
			let response = await API.userGet(
				config.get('userID'),
				url
			);
			assert200(response);
			let xml = API.getXMLFromResponse(response);
			let totalResults = xpathSelect(xml, '/atom:feed/zapi:totalResults/text()', true);
			assert.equal(parseInt(totalResults.nodeValue), keys.length);

			let entries = xpathSelect(xml, '//atom:entry');
			for (let entry of entries) {
				let keyNode = xpathSelect(entry, 'zapi:key/text()', true);
				let key = keyNode.nodeValue;
				let contentNode = xpathSelect(entry, 'atom:content', true);
				let content = stripAtomNamespace(contentNode.toString());
				API.assertXmlStringEqualsXmlString(items[key].bib[style], content);
			}
		}
	});
});
