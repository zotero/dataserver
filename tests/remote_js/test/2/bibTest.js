const chai = require('chai');
const assert = chai.assert;
const config = require("../../config.js");
const API = require('../../api2.js');
const Helpers = require('../../helpers.js');
const { API2Setup, API2WrapUp } = require("../shared.js");

describe('BibTests', function () {
	this.timeout(config.timeout);

	let items = {};
	let styles = [
		"default",
		"apa",
		"https://www.zotero.org/styles/apa",
		"https://raw.githubusercontent.com/citation-style-language/styles/master/ieee.csl"
	];

	before(async function () {
		await API2Setup();

		// Create test data
		let key = await API.createItem("book", {
			title: "Title",
			creators: [
				{
					creatorType: "author",
					firstName: "First",
					lastName: "Last"
				}
			]
		}, null, 'key');

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

		key = await API.createItem("book", {
			title: "Title 2",
			creators: [
				{
					creatorType: "author",
					firstName: "First",
					lastName: "Last"
				}
			]
		}, null, 'key');


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

	after(async function () {
		await API2WrapUp();
	});

	it('testContentCitationMulti', async function () {
		let keys = Object.keys(items);
		let keyStr = keys.join(',');
		for (let style of styles) {
			let response = await API.userGet(
				config.userID,
				`items?key=${config.apiKey}&itemKey=${keyStr}&content=citation${style == "default" ? "" : "&style=" + encodeURIComponent(style)}`
			);
			Helpers.assert200(response);
			Helpers.assertTotalResults(response, keys.length);
			let xml = API.getXMLFromResponse(response);
			assert.equal(Helpers.xpathEval(xml, '/atom:feed/zapi:totalResults'), keys.length);
			
			let entries = Helpers.xpathEval(xml, '//atom:entry', true, true);
			for (let entry of entries) {
				const key = entry.getElementsByTagName("zapi:key")[0].innerHTML;
				let content = entry.getElementsByTagName("content")[0].outerHTML;
				content = content.replace('<content ', '<content xmlns:zapi="http://zotero.org/ns/api" ');
				Helpers.assertXMLEqual(items[key].citation[style], content);
			}
		}
	});


	it('testContentCitationSingle', async function () {
		for (const style of styles) {
			for (const [key, expected] of Object.entries(items)) {
				let response = await API.userGet(
					config.userID,
					`items/${key}?key=${config.apiKey}&content=citation${style == 'default' ? '' : `&style=${encodeURIComponent(style)}`}`,
					{ "Content-Type": "application/json" }
				);
				Helpers.assert200(response);
				let content = API.getContentFromResponse(response);
				content = content.toString().replace('<content ', '<content xmlns:zapi="http://zotero.org/ns/api" ');
				Helpers.assertXMLEqual(expected.citation[style], content);
			}
		}
	});


	it('testContentBibMulti', async function () {
		let keys = Object.keys(items);
		let keyStr = keys.join(',');

		for (let style of styles) {
			let response = await API.userGet(config.userID,
				`items?key=${config.apiKey}&itemKey=${keyStr}&content=bib${style == 'default' ? '' : '&style=' + encodeURIComponent(style)}`,
				{ 'Content-Type': 'application/json' });
			Helpers.assert200(response);
			let xml = await API.getXMLFromResponse(response);

			assert.equal(Helpers.xpathEval(xml, '/atom:feed/zapi:totalResults'), keys.length);

			let entries = Helpers.xpathEval(xml, '//atom:entry', true, true);
			for (let entry of entries) {
				const key = entry.getElementsByTagName("zapi:key")[0].innerHTML;
				let content = entry.getElementsByTagName("content")[0].outerHTML;
				// Add zapi namespace
				content = content.replace('<content ', '<content xmlns:zapi="http://zotero.org/ns/api" ');
				Helpers.assertXMLEqual(items[key].bib[style], content);
			}
		}
	});

	it('testContentBibSingle', async function () {
		for (const style of styles) {
			for (const [key, expected] of Object.entries(items)) {
				const response = await API.userGet(
					config.userID,
					`items/${key}?key=${config.apiKey}&content=bib${style === "default" ? "" : "&style=" + encodeURIComponent(style)}`
				);
				Helpers.assert200(response);
				let content = API.getContentFromResponse(response);
				// Add zapi namespace
				content = content.replace('<content ', '<content xmlns:zapi="http://zotero.org/ns/api" ');
				Helpers.assertXMLEqual(
					expected.bib[style],
					content,
				);
			}
		}
	});
});
