const chai = require('chai');
const assert = chai.assert;
const config = require("../../config.js");
const API = require('../../api3.js');
const Helpers = require('../../helpers3.js');
const { API3Setup, API3WrapUp } = require("../shared.js");

describe('BibTests', function () {
	this.timeout(0);

	let items = {};
	let multiResponses = {};
	let multiResponsesLocales = {};
	let styles = [
		"default",
		"apa",
		"https://www.zotero.org/styles/apa",
		"https://raw.githubusercontent.com/citation-style-language/styles/master/ieee.csl"
	];

	before(async function () {
		await API3Setup();

		// Create test data
		let key = await API.createItem("book", {
			title: "Title",
			date: "January 1, 2014",
			creators: [
				{
					creatorType: "author",
					firstName: "Alice",
					lastName: "Doe"
				},
				{
					creatorType: "author",
					firstName: "Bob",
					lastName: "Smith"
				}
			]
		}, null, 'key');

		items[key] = {
			json: {
				citation: {
					default: '<span>Doe and Smith, <i>Title</i>.</span>',
					apa: '<span>(Doe &#38; Smith, 2014)</span>',
					"https://www.zotero.org/styles/apa": '<span>(Doe &#38; Smith, 2014)</span>',
					"https://raw.githubusercontent.com/citation-style-language/styles/master/ieee.csl": '<span>[1]</span>'
				},
				bib: {
					default: '<div class="csl-bib-body" style="line-height: 1.35; padding-left: 1em; text-indent:-1em;"><div class="csl-entry">Doe, Alice, and Bob Smith. <i>Title</i>, 2014.</div></div>',
					apa: '<div class="csl-bib-body" style="line-height: 2; padding-left: 1em; text-indent:-1em;"><div class="csl-entry">Doe, A., &amp; Smith, B. (2014). <i>Title</i>.</div></div>',
					"https://www.zotero.org/styles/apa": '<div class="csl-bib-body" style="line-height: 2; padding-left: 1em; text-indent:-1em;"><div class="csl-entry">Doe, A., &amp; Smith, B. (2014). <i>Title</i>.</div></div>',
					"https://raw.githubusercontent.com/citation-style-language/styles/master/ieee.csl": '<div class="csl-bib-body" style="line-height: 1.35; "><div class="csl-entry" style="clear: left; "><div class="csl-left-margin" style="float: left; padding-right: 0.5em; text-align: right; width: 1em;">[1]</div><div class="csl-right-inline" style="margin: 0 .4em 0 1.5em;">A. Doe and B. Smith, <i>Title</i>. 2014.</div></div></div>'
				}
			},
			atom: {
				citation: {
					default: '<content xmlns:zapi="http://zotero.org/ns/api" zapi:type="citation" type="xhtml"><span xmlns="http://www.w3.org/1999/xhtml">Doe and Smith, <i>Title</i>.</span></content>',
					apa: '<content xmlns:zapi="http://zotero.org/ns/api" zapi:type="citation" type="xhtml"><span xmlns="http://www.w3.org/1999/xhtml">(Doe &#38; Smith, 2014)</span></content>',
					"https://www.zotero.org/styles/apa": '<content xmlns:zapi="http://zotero.org/ns/api" zapi:type="citation" type="xhtml"><span xmlns="http://www.w3.org/1999/xhtml">(Doe &#38; Smith, 2014)</span></content>',
					"https://raw.githubusercontent.com/citation-style-language/styles/master/ieee.csl": '<content xmlns:zapi="http://zotero.org/ns/api" zapi:type="citation" type="xhtml"><span xmlns="http://www.w3.org/1999/xhtml">[1]</span></content>'
				},
				bib: {
					default: '<content xmlns:zapi="http://zotero.org/ns/api" zapi:type="bib" type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml" class="csl-bib-body" style="line-height: 1.35; padding-left: 1em; text-indent:-1em;"><div class="csl-entry">Doe, Alice, and Bob Smith. <i>Title</i>, 2014.</div></div></content>',
					apa: '<content xmlns:zapi="http://zotero.org/ns/api" zapi:type="bib" type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml" class="csl-bib-body" style="line-height: 2; padding-left: 1em; text-indent:-1em;"><div class="csl-entry">Doe, A., &amp; Smith, B. (2014). <i>Title</i>.</div></div></content>',
					"https://www.zotero.org/styles/apa": '<content xmlns:zapi="http://zotero.org/ns/api" zapi:type="bib" type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml" class="csl-bib-body" style="line-height: 2; padding-left: 1em; text-indent:-1em;"><div class="csl-entry">Doe, A., &amp; Smith, B. (2014). <i>Title</i>.</div></div></content>',
					"https://raw.githubusercontent.com/citation-style-language/styles/master/ieee.csl": '<content xmlns:zapi="http://zotero.org/ns/api" zapi:type="bib" type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml" class="csl-bib-body" style="line-height: 1.35; "><div class="csl-entry" style="clear: left; "><div class="csl-left-margin" style="float: left; padding-right: 0.5em; text-align: right; width: 1em;">[1]</div><div class="csl-right-inline" style="margin: 0 .4em 0 1.5em;">A. Doe and B. Smith, <i>Title</i>. 2014.</div></div></div></content>'
				}
			}
		};

		key = await API.createItem("book", {
			title: "Title 2",
			date: "June 24, 2014",
			creators: [
				{
					creatorType: "author",
					firstName: "Jane",
					lastName: "Smith"
				},
				{
					creatorType: "editor",
					firstName: "Ed",
					lastName: "McEditor"
				}
			]
		}, null, 'key');


		items[key] = {
			json: {
				citation: {
					default: '<span>Smith, <i>Title 2</i>.</span>',
					apa: '<span>(Smith, 2014)</span>',
					"https://www.zotero.org/styles/apa": '<span>(Smith, 2014)</span>',
					"https://raw.githubusercontent.com/citation-style-language/styles/master/ieee.csl": '<span>[1]</span>'
				},
				bib: {
					default: '<div class="csl-bib-body" style="line-height: 1.35; padding-left: 1em; text-indent:-1em;"><div class="csl-entry">Smith, Jane. <i>Title 2</i>. Edited by Ed McEditor, 2014.</div></div>',
					apa: '<div class="csl-bib-body" style="line-height: 2; padding-left: 1em; text-indent:-1em;"><div class="csl-entry">Smith, J. (2014). <i>Title 2</i> (E. McEditor, Ed.).</div></div>',
					"https://www.zotero.org/styles/apa": '<div class="csl-bib-body" style="line-height: 2; padding-left: 1em; text-indent:-1em;"><div class="csl-entry">Smith, J. (2014). <i>Title 2</i> (E. McEditor, Ed.).</div></div>',
					"https://raw.githubusercontent.com/citation-style-language/styles/master/ieee.csl": '<div class="csl-bib-body" style="line-height: 1.35; "><div class="csl-entry" style="clear: left; "><div class="csl-left-margin" style="float: left; padding-right: 0.5em; text-align: right; width: 1em;">[1]</div><div class="csl-right-inline" style="margin: 0 .4em 0 1.5em;">J. Smith, <i>Title 2</i>. 2014.</div></div></div>'
				}
			},
			atom: {
				citation: {
					default: '<content xmlns:zapi="http://zotero.org/ns/api" zapi:type="citation" type="xhtml"><span xmlns="http://www.w3.org/1999/xhtml">Smith, <i>Title 2</i>.</span></content>',
					apa: '<content xmlns:zapi="http://zotero.org/ns/api" zapi:type="citation" type="xhtml"><span xmlns="http://www.w3.org/1999/xhtml">(Smith, 2014)</span></content>',
					"https://www.zotero.org/styles/apa": '<content xmlns:zapi="http://zotero.org/ns/api" zapi:type="citation" type="xhtml"><span xmlns="http://www.w3.org/1999/xhtml">(Smith, 2014)</span></content>',
					"https://raw.githubusercontent.com/citation-style-language/styles/master/ieee.csl": '<content xmlns:zapi="http://zotero.org/ns/api" zapi:type="citation" type="xhtml"><span xmlns="http://www.w3.org/1999/xhtml">[1]</span></content>'
				},
				bib: {
					default: '<content xmlns:zapi="http://zotero.org/ns/api" zapi:type="bib" type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml" class="csl-bib-body" style="line-height: 1.35; padding-left: 1em; text-indent:-1em;"><div class="csl-entry">Smith, Jane. <i>Title 2</i>. Edited by Ed McEditor, 2014.</div></div></content>',
					apa: '<content xmlns:zapi="http://zotero.org/ns/api" zapi:type="bib" type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml" class="csl-bib-body" style="line-height: 2; padding-left: 1em; text-indent:-1em;"><div class="csl-entry">Smith, J. (2014). <i>Title 2</i> (E. McEditor, Ed.).</div></div></content>',
					"https://www.zotero.org/styles/apa": '<content xmlns:zapi="http://zotero.org/ns/api" zapi:type="bib" type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml" class="csl-bib-body" style="line-height: 2; padding-left: 1em; text-indent:-1em;"><div class="csl-entry">Smith, J. (2014). <i>Title 2</i> (E. McEditor, Ed.).</div></div></content>',
					"https://raw.githubusercontent.com/citation-style-language/styles/master/ieee.csl": '<content xmlns:zapi="http://zotero.org/ns/api" zapi:type="bib" type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml" class="csl-bib-body" style="line-height: 1.35; "><div class="csl-entry" style="clear: left; "><div class="csl-left-margin" style="float: left; padding-right: 0.5em; text-align: right; width: 1em;">[1]</div><div class="csl-right-inline" style="margin: 0 .4em 0 1.5em;">J. Smith, <i>Title 2</i>. 2014.</div></div></div></content>'
				}
			}
		};


		multiResponses = {
			default: '<?xml version="1.0"?><div class="csl-bib-body" style="line-height: 1.35; padding-left: 1em; text-indent:-1em;"><div class="csl-entry">Doe, Alice, and Bob Smith. <i>Title</i>, 2014.</div><div class="csl-entry">Smith, Jane. <i>Title 2</i>. Edited by Ed McEditor, 2014.</div></div>',
			apa: '<?xml version="1.0"?><div class="csl-bib-body" style="line-height: 2; padding-left: 1em; text-indent:-1em;"><div class="csl-entry">Doe, A., &amp; Smith, B. (2014). <i>Title</i>.</div><div class="csl-entry">Smith, J. (2014). <i>Title 2</i> (E. McEditor, Ed.).</div></div>',
			"https://www.zotero.org/styles/apa": '<?xml version="1.0"?><div class="csl-bib-body" style="line-height: 2; padding-left: 1em; text-indent:-1em;"><div class="csl-entry">Doe, A., &amp; Smith, B. (2014). <i>Title</i>.</div><div class="csl-entry">Smith, J. (2014). <i>Title 2</i> (E. McEditor, Ed.).</div></div>',
			"https://raw.githubusercontent.com/citation-style-language/styles/master/ieee.csl": '<?xml version="1.0"?><div class="csl-bib-body" style="line-height: 1.35; "><div class="csl-entry" style="clear: left; "><div class="csl-left-margin" style="float: left; padding-right: 0.5em; text-align: right; width: 1em;">[1]</div><div class="csl-right-inline" style="margin: 0 .4em 0 1.5em;">J. Smith, <i>Title 2</i>. 2014.</div></div><div class="csl-entry" style="clear: left; "><div class="csl-left-margin" style="float: left; padding-right: 0.5em; text-align: right; width: 1em;">[2]</div><div class="csl-right-inline" style="margin: 0 .4em 0 1.5em;">A. Doe and B. Smith, <i>Title</i>. 2014.</div></div></div>'
		};

		multiResponsesLocales = {
			fr: '<?xml version="1.0"?><div class="csl-bib-body" style="line-height: 1.35; padding-left: 1em; text-indent:-1em;"><div class="csl-entry">Doe, Alice, et Bob Smith. <i>Title</i>, 2014.</div><div class="csl-entry">Smith, Jane. <i>Title 2</i>. &#xC9;dit&#xE9; par Ed McEditor, 2014.</div></div>'
		};
	});

	after(async function () {
		await API3WrapUp();
	});

	it('testContentCitationMulti', async function () {
		let keys = Object.keys(items);
		let keyStr = keys.join(',');
		for (let style of styles) {
			let response = await API.userGet(
				config.userID,
				`items?itemKey=${keyStr}&content=citation${style == "default" ? "" : "&style=" + encodeURIComponent(style)}`
			);
			Helpers.assert200(response);
			Helpers.assertTotalResults(response, keys.length);
			let xml = API.getXMLFromResponse(response);
			let entries = Helpers.xpathEval(xml, '//atom:entry', true, true);
			for (let entry of entries) {
				const key = entry.getElementsByTagName("zapi:key")[0].innerHTML;
				let content = entry.getElementsByTagName("content")[0].outerHTML;
				content = content.replace('<content ', '<content xmlns:zapi="http://zotero.org/ns/api" ');
				Helpers.assertXMLEqual(items[key].atom.citation[style], content);
			}
		}
	});

	it('testFormatBibLocale', async function () {
		let response = await API.userGet(
			config.userID,
			"items?format=bib&locale=fr-FR"
		);
		Helpers.assert200(response);
		Helpers.assertXMLEqual(multiResponsesLocales.fr, response.data);
	});

	it('testIncludeBibSingle', async function () {
		for (const style of styles) {
			for (const [key, expected] of Object.entries(items)) {
				const response = await API.userGet(
					config.userID,
					`items/${key}?include=bib${style == "default" ? "" : "&style=" + encodeURIComponent(style)}`,
					{ "Content-Type": "application/json" });
				Helpers.assert200(response);
				const json = API.getJSONFromResponse(response);
				Helpers.assertXMLEqual(
					expected.json.bib[style],
					json.bib
				);
			}
		}
	});

	it('testIncludeBibMulti', async function () {
		let keys = Object.keys(items);
		let keyStr = keys.join(',');

		for (let style of styles) {
			let response = await API.userGet(config.userID, `items?itemKey=${keyStr}&include=bib${(style == 'default' ? "" : '&style=' + encodeURIComponent(style))}`, { "Content-Type": "application/json" });
			Helpers.assert200(response);
			Helpers.assertTotalResults(response, keys.length);
			let json = await API.getJSONFromResponse(response);

			for (let item of json) {
				let key = item.key;
				Helpers.assertXMLEqual(items[key].json.bib[style], item.bib);
			}
		}
	});

	it('testIncludeCitationSingle', async function () {
		for (let style of styles) {
			for (let [key, expected] of Object.entries(items)) {
				let response = await API.userGet(config.userID, `items/${key}?include=citation${(style == "default" ? "" : "&style=" + encodeURIComponent(style))}`, { "Content-Type": "application/json" });
				Helpers.assert200(response);
				let json = await API.getJSONFromResponse(response);
				Helpers.assertEquals(expected.json.citation[style], json.citation, `Item: ${key}, style: ${style}`);
			}
		}
	});

	it('testContentCitationSingle', async function () {
		for (const style of styles) {
			for (const [key, expected] of Object.entries(items)) {
				let response = await API.userGet(
					config.userID,
					`items/${key}?content=citation${style == 'default' ? '' : `&style=${encodeURIComponent(style)}`}`,
					{ "Content-Type": "application/json" }
				);
				Helpers.assert200(response);
				let content = API.getContentFromResponse(response);
				content = content.toString().replace('<content ', '<content xmlns:zapi="http://zotero.org/ns/api" ');
				Helpers.assertXMLEqual(expected.atom.citation[style], content);
			}
		}
	});

	it('testFormatBibMultiple', async function () {
		for (let style of styles) {
			const response = await API.userGet(
				config.userID,
				`items?format=bib${style == 'default' ? '' : '&style=' + encodeURIComponent(style)}`
			);
			Helpers.assert200(response);
			Helpers.assertXMLEqual(multiResponses[style], response.data);
		}
	});

	it('testContentBibMulti', async function () {
		let keys = Object.keys(items);
		let keyStr = keys.join(',');

		for (let style of styles) {
			let response = await API.userGet(config.userID, `items?itemKey=${keyStr}&content=bib${style == 'default' ? '' : '&style=' + encodeURIComponent(style)}`, { 'Content-Type': 'application/json' });
			Helpers.assert200(response);
			let xml = await API.getXMLFromResponse(response);
			Helpers.assertTotalResults(response, keys.length);

			let entries = Helpers.xpathEval(xml, '//atom:entry', true, true);
			for (let entry of entries) {
				const key = entry.getElementsByTagName("zapi:key")[0].innerHTML;
				let content = entry.getElementsByTagName("content")[0].outerHTML;
				// Add zapi namespace
				content = content.replace('<content ', '<content xmlns:zapi="http://zotero.org/ns/api" ');
				Helpers.assertXMLEqual(items[key].atom.bib[style], content);
			}
		}
	});

	it('testIncludeCitationMulti', async function () {
		let keys = Object.keys(items);
		let keyStr = keys.join(',');

		for (let style of styles) {
			let response = await API.userGet(
				config.userID,
				`items?itemKey=${keyStr}&include=citation${style === 'default' ? '' : `&style=${encodeURIComponent(style)}`}`,
				{ 'Content-Type': 'application/json' }
			);
			Helpers.assert200(response);
			Helpers.assertTotalResults(response, keys.length);
			let json = await API.getJSONFromResponse(response);

			for (let item of json) {
				let key = item.key;
				let content = item.citation;

				Helpers.assertEquals(items[key].json.citation[style], content);
			}
		}
	});

	it('testContentBibSingle', async function () {
		for (const style of styles) {
			for (const [key, expected] of Object.entries(items)) {
				const response = await API.userGet(
					config.userID,
					`items/${key}?content=bib${style === "default" ? "" : "&style=" + encodeURIComponent(style)}`
				);
				Helpers.assert200(response);
				let content = API.getContentFromResponse(response);
				// Add zapi namespace
				content = content.replace('<content ', '<content xmlns:zapi="http://zotero.org/ns/api" ');
				Helpers.assertXMLEqual(
					expected.atom.bib[style],
					content,
				);
			}
		}
	});
});
