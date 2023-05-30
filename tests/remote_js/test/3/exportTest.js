const chai = require('chai');
const assert = chai.assert;
var config = require('config');
const API = require('../../api3.js');
const Helpers = require('../../helpers3.js');
const { API3Setup, API3WrapUp } = require("../shared.js");

describe('ExportTests', function () {
	this.timeout(config.timeout);
	let items = {};
	let multiResponses;
	let formats = ['bibtex', 'ris', 'csljson'];

	before(async function () {
		await API3Setup();
		await API.userClear(config.userID);

		// Create test data
		let key = await API.createItem("book", {
			title: "Title",
			date: "January 1, 2014",
			accessDate: "2019-05-23T01:23:45Z",
			creators: [
				{
					creatorType: "author",
					firstName: "First",
					lastName: "Last"
				}
			]
		}, null, 'key');
		items[key] = {
			bibtex: "\n@book{last_title_2014,\n	title = {Title},\n	urldate = {2019-05-23},\n	author = {Last, First},\n	month = jan,\n	year = {2014},\n}\n",
			ris: "TY  - BOOK\r\nTI  - Title\r\nAU  - Last, First\r\nDA  - 2014/01/01/\r\nPY  - 2014\r\nY2  - 2019/05/23/01:23:45\r\nER  - \r\n\r\n",
			csljson: {
				id: config.libraryID + "/" + key,
				type: 'book',
				title: 'Title',
				author: [
					{
						family: 'Last',
						given: 'First'
					}
				],
				issued: {
					'date-parts': [
						["2014", 1, 1]
					]
				},
				accessed: {
					'date-parts': [
						[2019, 5, 23]
					]
				}
			}
		};

		key = await API.createItem("book", {
			title: "Title 2",
			date: "June 24, 2014",
			creators: [
				{
					creatorType: "author",
					firstName: "First",
					lastName: "Last"
				},
				{
					creatorType: "editor",
					firstName: "Ed",
					lastName: "McEditor"
				}
			]
		}, null, 'key');
		items[key] = {
			bibtex: "\n@book{last_title_2014,\n	title = {Title 2},\n	author = {Last, First},\n	editor = {McEditor, Ed},\n	month = jun,\n	year = {2014},\n}\n",
			ris: "TY  - BOOK\r\nTI  - Title 2\r\nAU  - Last, First\r\nA3  - McEditor, Ed\r\nDA  - 2014/06/24/\r\nPY  - 2014\r\nER  - \r\n\r\n",
			csljson: {
				id: config.libraryID + "/" + key,
				type: 'book',
				title: 'Title 2',
				author: [
					{
						family: 'Last',
						given: 'First'
					}
				],
				editor: [
					{
						family: 'McEditor',
						given: 'Ed'
					}
				],
				issued: {
					'date-parts': [
						['2014', 6, 24]
					]
				}
			}
		};

		multiResponses = {
			bibtex: {
				contentType: "application/x-bibtex",
				content: "\n@book{last_title_2014,\n	title = {Title 2},\n	author = {Last, First},\n	editor = {McEditor, Ed},\n	month = jun,\n	year = {2014},\n}\n\n@book{last_title_2014-1,\n	title = {Title},\n	urldate = {2019-05-23},\n	author = {Last, First},\n	month = jan,\n	year = {2014},\n}\n"
			},
			ris: {
				contentType: "application/x-research-info-systems",
				content: "TY  - BOOK\r\nTI  - Title 2\r\nAU  - Last, First\r\nA3  - McEditor, Ed\r\nDA  - 2014/06/24/\r\nPY  - 2014\r\nER  - \r\n\r\nTY  - BOOK\r\nTI  - Title\r\nAU  - Last, First\r\nDA  - 2014/01/01/\r\nPY  - 2014\r\nY2  - 2019/05/23/01:23:45\r\nER  - \r\n\r\n"
			},
			csljson: {
				contentType: "application/vnd.citationstyles.csl+json",
				content: {
					items: [
						items[Object.keys(items)[1]].csljson,
						items[Object.keys(items)[0]].csljson
					]
				}
			}
		};
	});

	after(async function () {
		await API3WrapUp();
	});

	it('testExportInclude', async function () {
		for (let format of formats) {
			let response = await API.userGet(
				config.userID,
				`items?include=${format}`,
				{ "Content-Type": "application/json" }
			);
			Helpers.assert200(response);
			let json = API.getJSONFromResponse(response);
			for (let obj of json) {
				assert.deepEqual(obj[format], items[obj.key][format]);
			}
		}
	});

	it('testExportFormatSingle', async function () {
		for (const format of formats) {
			for (const [key, expected] of Object.entries(items)) {
				const response = await API.userGet(
					config.userID,
					`items/${key}?format=${format}`
				);
				Helpers.assert200(response);
				let body = response.data;

				// TODO: Remove in APIv4
				if (format === 'csljson') {
					body = JSON.parse(body);
					body = body.items[0];
				}
				assert.deepEqual(expected[format], body);
			}
		}
	});

	it('testExportFormatMultiple', async function () {
		for (let format of formats) {
			const response = await API.userGet(
				config.userID,
				`items?format=${format}`
			);
			Helpers.assert200(response);
			Helpers.assertContentType(
				response,
				multiResponses[format].contentType
			);
			let body = response.data;
			if (typeof multiResponses[format].content == 'object') {
				body = JSON.parse(body);
			}
			assert.deepEqual(
				multiResponses[format].content,
				body
			);
		}
	});
});
