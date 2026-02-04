/**
 * Bibliography API tests
 * Port of tests/remote/tests/API/3/BibTest.php
 */

import { assert } from 'chai';
import config from 'config';
import { API } from '../../api3.js';
import {
	assert200,
	assertTotalResults
} from '../../assertions3.js';
import { setup } from '../../setup.js';
import { xpathSelect } from '../../xpath.js';
import { DOMParser } from '@xmldom/xmldom';

// Helper function to normalize and compare XML/HTML strings
function assertXMLStringEquals(expected, actual, message) {
	let normalize = (str) => {
		// Parse and re-serialize to normalize formatting
		try {
			let parser = new DOMParser();
			let doc = parser.parseFromString(str, 'text/xml');
			return doc.toString().replace(/>\s+</g, '><').trim();
		}
		catch (e) {
			// If parsing fails, just normalize whitespace
			return str.replace(/>\s+</g, '><').trim();
		}
	};
	assert.equal(normalize(actual), normalize(expected), message);
}

// Serialize an Atom <content> node to XML, matching PHP's asXML() behavior.
// xmldom's toString() includes inherited namespace declarations from the parent
// feed that PHP's SimpleXML doesn't, so we strip those and add xmlns:zapi
// explicitly (as the PHP tests do).
function serializeContentNode(node) {
	let xml = node.toString();
	xml = xml.replace(/ xmlns="http:\/\/www\.w3\.org\/2005\/Atom"/g, '');
	xml = xml.replace(/ xmlns:zapi="http:\/\/zotero\.org\/ns\/api"/g, '');
	xml = xml.replace('<content ', '<content xmlns:zapi="http://zotero.org/ns/api" ');
	return xml;
}

describe('Bibliography', function() {
	this.timeout(30000);

	let items = {};
	let styles = [
		'default',
		'apa',
		'https://www.zotero.org/styles/apa',
		'https://raw.githubusercontent.com/citation-style-language/styles/master/ieee.csl'
	];
	let multiResponses = {};
	let multiResponsesLocales = {};

	before(async function() {
		await setup();
		API.useAPIKey(config.get('apiKey'));
		API.useAPIVersion(3);
		await API.userClear(config.get('userID'));

		// Create test data - first book
		let key = await API.createItem('book', {
			title: 'Title',
			date: 'January 1, 2014',
			creators: [
				{
					creatorType: 'author',
					firstName: 'Alice',
					lastName: 'Doe'
				},
				{
					creatorType: 'author',
					firstName: 'Bob',
					lastName: 'Smith'
				}
			]
		}, 'key');

		items[key] = {
			json: {
				citation: {
					'default': '<span>Doe and Smith, <i>Title</i>.</span>',
					'apa': '<span>(Doe &#38; Smith, 2014)</span>',
					'https://www.zotero.org/styles/apa': '<span>(Doe &#38; Smith, 2014)</span>',
					'https://raw.githubusercontent.com/citation-style-language/styles/master/ieee.csl': '<span>[1]</span>'
				},
				bib: {
					'default': '<div class="csl-bib-body" style="line-height: 1.35; padding-left: 1em; text-indent:-1em;"><div class="csl-entry">Doe, Alice, and Bob Smith. <i>Title</i>, 2014.</div></div>',
					'apa': '<div class="csl-bib-body" style="line-height: 2; padding-left: 1em; text-indent:-1em;"><div class="csl-entry">Doe, A., &amp; Smith, B. (2014). <i>Title</i>.</div></div>',
					'https://www.zotero.org/styles/apa': '<div class="csl-bib-body" style="line-height: 2; padding-left: 1em; text-indent:-1em;"><div class="csl-entry">Doe, A., &amp; Smith, B. (2014). <i>Title</i>.</div></div>',
					'https://raw.githubusercontent.com/citation-style-language/styles/master/ieee.csl': '<div class="csl-bib-body" style="line-height: 1.35; "><div class="csl-entry" style="clear: left; "><div class="csl-left-margin" style="float: left; padding-right: 0.5em; text-align: right; width: 1em;">[1]</div><div class="csl-right-inline" style="margin: 0 .4em 0 1.5em;">A. Doe and B. Smith, <i>Title</i>. 2014.</div></div></div>'
				}
			},
			atom: {
				citation: {
					'default': '<content xmlns:zapi="http://zotero.org/ns/api" zapi:type="citation" type="xhtml"><span xmlns="http://www.w3.org/1999/xhtml">Doe and Smith, <i>Title</i>.</span></content>',
					'apa': '<content xmlns:zapi="http://zotero.org/ns/api" zapi:type="citation" type="xhtml"><span xmlns="http://www.w3.org/1999/xhtml">(Doe &#38; Smith, 2014)</span></content>',
					'https://www.zotero.org/styles/apa': '<content xmlns:zapi="http://zotero.org/ns/api" zapi:type="citation" type="xhtml"><span xmlns="http://www.w3.org/1999/xhtml">(Doe &#38; Smith, 2014)</span></content>',
					'https://raw.githubusercontent.com/citation-style-language/styles/master/ieee.csl': '<content xmlns:zapi="http://zotero.org/ns/api" zapi:type="citation" type="xhtml"><span xmlns="http://www.w3.org/1999/xhtml">[1]</span></content>'
				},
				bib: {
					'default': '<content xmlns:zapi="http://zotero.org/ns/api" zapi:type="bib" type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml" class="csl-bib-body" style="line-height: 1.35; padding-left: 1em; text-indent:-1em;"><div class="csl-entry">Doe, Alice, and Bob Smith. <i>Title</i>, 2014.</div></div></content>',
					'apa': '<content xmlns:zapi="http://zotero.org/ns/api" zapi:type="bib" type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml" class="csl-bib-body" style="line-height: 2; padding-left: 1em; text-indent:-1em;"><div class="csl-entry">Doe, A., &amp; Smith, B. (2014). <i>Title</i>.</div></div></content>',
					'https://www.zotero.org/styles/apa': '<content xmlns:zapi="http://zotero.org/ns/api" zapi:type="bib" type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml" class="csl-bib-body" style="line-height: 2; padding-left: 1em; text-indent:-1em;"><div class="csl-entry">Doe, A., &amp; Smith, B. (2014). <i>Title</i>.</div></div></content>',
					'https://raw.githubusercontent.com/citation-style-language/styles/master/ieee.csl': '<content xmlns:zapi="http://zotero.org/ns/api" zapi:type="bib" type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml" class="csl-bib-body" style="line-height: 1.35; "><div class="csl-entry" style="clear: left; "><div class="csl-left-margin" style="float: left; padding-right: 0.5em; text-align: right; width: 1em;">[1]</div><div class="csl-right-inline" style="margin: 0 .4em 0 1.5em;">A. Doe and B. Smith, <i>Title</i>. 2014.</div></div></div></content>'
				}
			}
		};

		// Create test data - second book
		key = await API.createItem('book', {
			title: 'Title 2',
			date: 'June 24, 2014',
			creators: [
				{
					creatorType: 'author',
					firstName: 'Jane',
					lastName: 'Smith'
				},
				{
					creatorType: 'editor',
					firstName: 'Ed',
					lastName: 'McEditor'
				}
			]
		}, 'key');

		items[key] = {
			json: {
				citation: {
					'default': '<span>Smith, <i>Title 2</i>.</span>',
					'apa': '<span>(Smith, 2014)</span>',
					'https://www.zotero.org/styles/apa': '<span>(Smith, 2014)</span>',
					'https://raw.githubusercontent.com/citation-style-language/styles/master/ieee.csl': '<span>[1]</span>'
				},
				bib: {
					'default': '<div class="csl-bib-body" style="line-height: 1.35; padding-left: 1em; text-indent:-1em;"><div class="csl-entry">Smith, Jane. <i>Title 2</i>. Edited by Ed McEditor, 2014.</div></div>',
					'apa': '<div class="csl-bib-body" style="line-height: 2; padding-left: 1em; text-indent:-1em;"><div class="csl-entry">Smith, J. (2014). <i>Title 2</i> (E. McEditor, Ed.).</div></div>',
					'https://www.zotero.org/styles/apa': '<div class="csl-bib-body" style="line-height: 2; padding-left: 1em; text-indent:-1em;"><div class="csl-entry">Smith, J. (2014). <i>Title 2</i> (E. McEditor, Ed.).</div></div>',
					'https://raw.githubusercontent.com/citation-style-language/styles/master/ieee.csl': '<div class="csl-bib-body" style="line-height: 1.35; "><div class="csl-entry" style="clear: left; "><div class="csl-left-margin" style="float: left; padding-right: 0.5em; text-align: right; width: 1em;">[1]</div><div class="csl-right-inline" style="margin: 0 .4em 0 1.5em;">J. Smith, <i>Title 2</i>. 2014.</div></div></div>'
				}
			},
			atom: {
				citation: {
					'default': '<content xmlns:zapi="http://zotero.org/ns/api" zapi:type="citation" type="xhtml"><span xmlns="http://www.w3.org/1999/xhtml">Smith, <i>Title 2</i>.</span></content>',
					'apa': '<content xmlns:zapi="http://zotero.org/ns/api" zapi:type="citation" type="xhtml"><span xmlns="http://www.w3.org/1999/xhtml">(Smith, 2014)</span></content>',
					'https://www.zotero.org/styles/apa': '<content xmlns:zapi="http://zotero.org/ns/api" zapi:type="citation" type="xhtml"><span xmlns="http://www.w3.org/1999/xhtml">(Smith, 2014)</span></content>',
					'https://raw.githubusercontent.com/citation-style-language/styles/master/ieee.csl': '<content xmlns:zapi="http://zotero.org/ns/api" zapi:type="citation" type="xhtml"><span xmlns="http://www.w3.org/1999/xhtml">[1]</span></content>'
				},
				bib: {
					'default': '<content xmlns:zapi="http://zotero.org/ns/api" zapi:type="bib" type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml" class="csl-bib-body" style="line-height: 1.35; padding-left: 1em; text-indent:-1em;"><div class="csl-entry">Smith, Jane. <i>Title 2</i>. Edited by Ed McEditor, 2014.</div></div></content>',
					'apa': '<content xmlns:zapi="http://zotero.org/ns/api" zapi:type="bib" type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml" class="csl-bib-body" style="line-height: 2; padding-left: 1em; text-indent:-1em;"><div class="csl-entry">Smith, J. (2014). <i>Title 2</i> (E. McEditor, Ed.).</div></div></content>',
					'https://www.zotero.org/styles/apa': '<content xmlns:zapi="http://zotero.org/ns/api" zapi:type="bib" type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml" class="csl-bib-body" style="line-height: 2; padding-left: 1em; text-indent:-1em;"><div class="csl-entry">Smith, J. (2014). <i>Title 2</i> (E. McEditor, Ed.).</div></div></content>',
					'https://raw.githubusercontent.com/citation-style-language/styles/master/ieee.csl': '<content xmlns:zapi="http://zotero.org/ns/api" zapi:type="bib" type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml" class="csl-bib-body" style="line-height: 1.35; "><div class="csl-entry" style="clear: left; "><div class="csl-left-margin" style="float: left; padding-right: 0.5em; text-align: right; width: 1em;">[1]</div><div class="csl-right-inline" style="margin: 0 .4em 0 1.5em;">J. Smith, <i>Title 2</i>. 2014.</div></div></div></content>'
				}
			}
		};

		multiResponses['default'] = '<?xml version="1.0"?><div class="csl-bib-body" style="line-height: 1.35; padding-left: 1em; text-indent:-1em;"><div class="csl-entry">Doe, Alice, and Bob Smith. <i>Title</i>, 2014.</div><div class="csl-entry">Smith, Jane. <i>Title 2</i>. Edited by Ed McEditor, 2014.</div></div>';
		multiResponses['apa'] = '<?xml version="1.0"?><div class="csl-bib-body" style="line-height: 2; padding-left: 1em; text-indent:-1em;"><div class="csl-entry">Doe, A., &amp; Smith, B. (2014). <i>Title</i>.</div><div class="csl-entry">Smith, J. (2014). <i>Title 2</i> (E. McEditor, Ed.).</div></div>';
		multiResponses['https://www.zotero.org/styles/apa'] = '<?xml version="1.0"?><div class="csl-bib-body" style="line-height: 2; padding-left: 1em; text-indent:-1em;"><div class="csl-entry">Doe, A., &amp; Smith, B. (2014). <i>Title</i>.</div><div class="csl-entry">Smith, J. (2014). <i>Title 2</i> (E. McEditor, Ed.).</div></div>';
		multiResponses['https://raw.githubusercontent.com/citation-style-language/styles/master/ieee.csl'] = '<?xml version="1.0"?><div class="csl-bib-body" style="line-height: 1.35; "><div class="csl-entry" style="clear: left; "><div class="csl-left-margin" style="float: left; padding-right: 0.5em; text-align: right; width: 1em;">[1]</div><div class="csl-right-inline" style="margin: 0 .4em 0 1.5em;">J. Smith, <i>Title 2</i>. 2014.</div></div><div class="csl-entry" style="clear: left; "><div class="csl-left-margin" style="float: left; padding-right: 0.5em; text-align: right; width: 1em;">[2]</div><div class="csl-right-inline" style="margin: 0 .4em 0 1.5em;">A. Doe and B. Smith, <i>Title</i>. 2014.</div></div></div>';

		multiResponsesLocales['fr'] = '<?xml version="1.0"?><div class="csl-bib-body" style="line-height: 1.35; padding-left: 1em; text-indent:-1em;"><div class="csl-entry">Doe, Alice, et Bob Smith. <i>Title</i>, 2014.</div><div class="csl-entry">Smith, Jane. <i>Title 2</i>. Édité par Ed McEditor, 2014.</div></div>';
	});

	after(async function() {
		await API.userClear(config.get('userID'));
	});

	// PHP: testIncludeCitationSingle
	it('should include citation for single item', async function() {
		for (let style of styles) {
			for (let key in items) {
				let expected = items[key];
				let response = await API.userGet(
					config.get('userID'),
					`items/${key}?include=citation${style === 'default' ? '' : '&style=' + encodeURIComponent(style)}`
				);
				assert200(response);
				let json = API.getJSONFromResponse(response);
				assert.equal(json.citation, expected.json.citation[style], `Item: ${key}, style: ${style}`);
			}
		}
	});

	// PHP: testContentCitationSingle
	it('should return citation content for single item', async function() {
		for (let style of styles) {
			for (let key in items) {
				let expected = items[key];
				let response = await API.userGet(
					config.get('userID'),
					`items/${key}?content=citation${style === 'default' ? '' : '&style=' + encodeURIComponent(style)}`
				);
				assert200(response);
				let xml = API.getXMLFromResponse(response);
				let contentNode = xpathSelect(xml, '//atom:entry/atom:content', true);
				let content = serializeContentNode(contentNode);
				assertXMLStringEquals(expected.atom.citation[style], content);
			}
		}
	});

	// PHP: testIncludeCitationMulti
	it('should include citation for multiple items', async function() {
		let keys = Object.keys(items);
		let keyStr = keys.join(',');

		for (let style of styles) {
			let response = await API.userGet(
				config.get('userID'),
				`items?itemKey=${keyStr}&include=citation${style === 'default' ? '' : '&style=' + encodeURIComponent(style)}`
			);
			assert200(response);
			assertTotalResults(response, keys.length);
			let json = API.getJSONFromResponse(response);

			for (let item of json) {
				let key = item.key;
				let content = item.citation;
				assert.equal(content, items[key].json.citation[style]);
			}
		}
	});

	// PHP: testContentCitationMulti
	it('should return citation content for multiple items', async function() {
		let keys = Object.keys(items);
		let keyStr = keys.join(',');

		for (let style of styles) {
			let response = await API.userGet(
				config.get('userID'),
				`items?itemKey=${keyStr}&content=citation${style === 'default' ? '' : '&style=' + encodeURIComponent(style)}`
			);
			assert200(response);
			assertTotalResults(response, keys.length);
			let xml = API.getXMLFromResponse(response);

			let entries = xpathSelect(xml, '//atom:entry');
			for (let entry of entries) {
				let key = xpathSelect(entry, 'zapi:key/text()', true)?.nodeValue || '';
				let contentNode = xpathSelect(entry, 'atom:content', true);
				let content = serializeContentNode(contentNode);
				assertXMLStringEquals(items[key].atom.citation[style], content);
			}
		}
	});

	// PHP: testIncludeBibSingle
	it('should include bib for single item', async function() {
		for (let style of styles) {
			for (let key in items) {
				let expected = items[key];
				let response = await API.userGet(
					config.get('userID'),
					`items/${key}?include=bib${style === 'default' ? '' : '&style=' + encodeURIComponent(style)}`
				);
				assert200(response);
				let json = API.getJSONFromResponse(response);
				assertXMLStringEquals(expected.json.bib[style], json.bib, `Style: ${style}`);
			}
		}
	});

	// PHP: testContentBibSingle
	it('should return bib content for single item', async function() {
		for (let style of styles) {
			for (let key in items) {
				let expected = items[key];
				let response = await API.userGet(
					config.get('userID'),
					`items/${key}?content=bib${style === 'default' ? '' : '&style=' + encodeURIComponent(style)}`
				);
				assert200(response);
				let xml = API.getXMLFromResponse(response);
				let contentNode = xpathSelect(xml, '//atom:entry/atom:content', true);
				let content = serializeContentNode(contentNode);
				assertXMLStringEquals(expected.atom.bib[style], content);
			}
		}
	});

	// PHP: testIncludeBibMulti
	it('should include bib for multiple items', async function() {
		let keys = Object.keys(items);
		let keyStr = keys.join(',');

		for (let style of styles) {
			let response = await API.userGet(
				config.get('userID'),
				`items?itemKey=${keyStr}&include=bib${style === 'default' ? '' : '&style=' + encodeURIComponent(style)}`
			);
			assert200(response);
			assertTotalResults(response, keys.length);
			let json = API.getJSONFromResponse(response);

			for (let item of json) {
				let key = item.key;
				assertXMLStringEquals(items[key].json.bib[style], item.bib);
			}
		}
	});

	// PHP: testContentBibMulti
	it('should return bib content for multiple items', async function() {
		let keys = Object.keys(items);
		let keyStr = keys.join(',');

		for (let style of styles) {
			let response = await API.userGet(
				config.get('userID'),
				`items?itemKey=${keyStr}&content=bib${style === 'default' ? '' : '&style=' + encodeURIComponent(style)}`
			);
			assert200(response);
			let xml = API.getXMLFromResponse(response);
			assertTotalResults(response, keys.length);

			let entries = xpathSelect(xml, '//atom:entry');
			for (let entry of entries) {
				let key = xpathSelect(entry, 'zapi:key/text()', true)?.nodeValue || '';
				let contentNode = xpathSelect(entry, 'atom:content', true);
				let content = serializeContentNode(contentNode);
				assertXMLStringEquals(items[key].atom.bib[style], content);
			}
		}
	});

	// PHP: testFormatBibMultiple
	it('should format bib for multiple items', async function() {
		for (let style of styles) {
			let response = await API.userGet(
				config.get('userID'),
				`items?format=bib${style === 'default' ? '' : '&style=' + encodeURIComponent(style)}`
			);
			assert200(response);
			assertXMLStringEquals(multiResponses[style], response.getBody());
		}
	});

	// PHP: test_should_format_citation_list_for_style_without_bibliography
	it('should format citation list for style without bibliography', async function() {
		let response = await API.userGet(
			config.get('userID'),
			'items?format=bib&style=bluebook-law-review'
		);
		assert200(response);
		assert.match(response.getBody(), /^<ol>\n\t<li><span style="font-variant:small-caps;">Jane Smith<\/span>/);
	});

	// PHP: testFormatBibLocale
	it('should format bib with locale', async function() {
		let response = await API.userGet(
			config.get('userID'),
			'items?format=bib&locale=fr-FR'
		);
		assert200(response);
		assertXMLStringEquals(multiResponsesLocales['fr'], response.getBody());
	});
});
