/**
 * Export API tests
 * Port of tests/remote/tests/API/3/ExportTest.php
 */

import { assert } from 'chai';
import config from 'config';
import { API } from '../../api3.js';
import {
	assert200,
	assertContentType
} from '../../assertions3.js';
import { setup } from '../../setup.js';

describe('Export', function () {
	this.timeout(30000);

	let items = {};
	let formats = ['bibtex', 'ris', 'csljson'];
	let multiResponses = {};

	before(async function () {
		await setup();
		API.useAPIKey(config.get('apiKey'));
		API.useAPIVersion(3);
		await API.userClear(config.get('userID'));

		// Create test data - first book
		let key = await API.createItem('book', {
			title: 'Title',
			date: 'January 1, 2014',
			accessDate: '2019-05-23T01:23:45Z',
			creators: [
				{
					creatorType: 'author',
					firstName: 'First',
					lastName: 'Last'
				}
			]
		}, 'key');

		items[key] = {
			bibtex: "\n@book{last_title_2014,\n\ttitle = {Title},\n\turldate = {2019-05-23},\n\tauthor = {Last, First},\n\tmonth = jan,\n\tyear = {2014},\n}\n",
			ris: "TY  - BOOK\r\nTI  - Title\r\nAU  - Last, First\r\nDA  - 2014/01/01/\r\nPY  - 2014\r\nY2  - 2019/05/23/01:23:45\r\nER  - \r\n\r\n",
			csljson: {
				id: config.get('libraryID') + '/' + key,
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
						['2014', 1, 1]
					]
				},
				accessed: {
					'date-parts': [
						[2019, 5, 23]
					]
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
			bibtex: "\n@book{last_title_2014,\n\ttitle = {Title 2},\n\tauthor = {Last, First},\n\teditor = {McEditor, Ed},\n\tmonth = jun,\n\tyear = {2014},\n}\n",
			ris: "TY  - BOOK\r\nTI  - Title 2\r\nAU  - Last, First\r\nA3  - McEditor, Ed\r\nDA  - 2014/06/24/\r\nPY  - 2014\r\nER  - \r\n\r\n",
			csljson: {
				id: config.get('libraryID') + '/' + key,
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

		let keys = Object.keys(items);
		multiResponses.bibtex = {
			contentType: 'application/x-bibtex',
			content: "\n@book{last_title_2014,\n\ttitle = {Title 2},\n\tauthor = {Last, First},\n\teditor = {McEditor, Ed},\n\tmonth = jun,\n\tyear = {2014},\n}\n\n@book{last_title_2014-1,\n\ttitle = {Title},\n\turldate = {2019-05-23},\n\tauthor = {Last, First},\n\tmonth = jan,\n\tyear = {2014},\n}\n"
		};

		multiResponses.ris = {
			contentType: 'application/x-research-info-systems',
			content: "TY  - BOOK\r\nTI  - Title 2\r\nAU  - Last, First\r\nA3  - McEditor, Ed\r\nDA  - 2014/06/24/\r\nPY  - 2014\r\nER  - \r\n\r\nTY  - BOOK\r\nTI  - Title\r\nAU  - Last, First\r\nDA  - 2014/01/01/\r\nPY  - 2014\r\nY2  - 2019/05/23/01:23:45\r\nER  - \r\n\r\n"
		};

		multiResponses.csljson = {
			contentType: 'application/vnd.citationstyles.csl+json',
			content: {
				items: [
					items[keys[1]].csljson,
					items[keys[0]].csljson
				]
			}
		};
	});

	after(async function () {
		await API.userClear(config.get('userID'));
	});

	// PHP: testExportInclude
	it('should export with include parameter', async function () {
		for (let format of formats) {
			let response = await API.userGet(
				config.get('userID'),
				`items?include=${format}`
			);
			assert200(response);
			let json = API.getJSONFromResponse(response);
			for (let obj of json) {
				assert.deepEqual(obj[format], items[obj.key][format], `Format: ${format}`);
			}
		}
	});

	// PHP: testExportFormatSingle
	it('should export single item with format parameter', async function () {
		for (let format of formats) {
			for (let key in items) {
				let expected = items[key];
				let response = await API.userGet(
					config.get('userID'),
					`items/${key}?format=${format}`
				);
				assert200(response);
				let body = response.getBody();
				if (typeof expected[format] === 'object') {
					body = JSON.parse(body);
				}
				// TODO: Remove in APIv4
				if (format === 'csljson') {
					body = body.items[0];
				}
				assert.deepEqual(body, expected[format]);
			}
		}
	});

	// PHP: testExportFormatMultiple
	it('should export multiple items with format parameter', async function () {
		for (let format of formats) {
			let response = await API.userGet(
				config.get('userID'),
				`items?format=${format}`
			);
			assert200(response);
			assertContentType(response, multiResponses[format].contentType);
			let body = response.getBody();
			if (typeof multiResponses[format].content === 'object') {
				body = JSON.parse(body);
			}
			assert.deepEqual(body, multiResponses[format].content, `Format: ${format}`);
		}
	});
});
