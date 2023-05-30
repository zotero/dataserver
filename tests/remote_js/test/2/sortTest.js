const chai = require('chai');
const assert = chai.assert;
var config = require('config');
const API = require('../../api2.js');
const Helpers = require('../../helpers.js');
const { API2Setup, API2WrapUp } = require("../shared.js");

describe('SortTests', function () {
	this.timeout(config.timeout);
	//let collectionKeys = [];
	let itemKeys = [];
	let childAttachmentKeys = [];
	let childNoteKeys = [];
	//let searchKeys = [];

	let titles = ['q', 'c', 'a', 'j', 'e', 'h', 'i'];
	let names = ['m', 's', 'a', 'bb', 'ba', '', ''];
	let attachmentTitles = ['v', 'x', null, 'a', null];
	let notes = [null, 'aaa', null, null, 'taf'];

	before(async function () {
		await API2Setup();
		await setup();
	});

	after(async function () {
		await API2WrapUp();
	});

	const setup = async () => {
		let titleIndex = 0;
		for (let i = 0; i < titles.length - 2; i++) {
			const key = await API.createItem("book", {
				title: titles[titleIndex],
				creators: [
					{
						creatorType: "author",
						name: names[i]
					}
				]
			}, true, 'key');
			titleIndex += 1;
			// Child attachments
			if (attachmentTitles[i]) {
				childAttachmentKeys.push(await API.createAttachmentItem(
					"imported_file", {
						title: attachmentTitles[i]
					}, key, true, 'key'));
			}
			// Child notes
			if (notes[i]) {
				childNoteKeys.push(await API.createNoteItem(notes[i], key, true, 'key'));
			}

			itemKeys.push(key);
		}
		// Top-level attachment
		itemKeys.push(await API.createAttachmentItem("imported_file", {
			title: titles[titleIndex]
		}, false, null, 'key'));
		titleIndex += 1;
		// Top-level note
		itemKeys.push(await API.createNoteItem(titles[titleIndex], false, null, 'key'));
		//
		// Collections
		//
		/*for (let i=0; i<5; i++) {
			collectionKeys.push(await API.createCollection("Test", false, true, 'key'));
		}*/

		//
		// Searches
		//
		/*for (let i=0; i<5; i++) {
			searchKeys.push(await API.createSearch("Test", 'default', null, 'key'));
		}*/
	};

	it('testSortTopItemsTitle', async function () {
		let response = await API.userGet(
			config.userID,
			"items/top?key=" + config.apiKey + "&format=keys&order=title"
		);
		Helpers.assertStatusCode(response, 200);
		
		let keys = response.data.trim().split("\n");

		let titlesToIndex = {};
		titles.forEach((v, i) => {
			titlesToIndex[v] = i;
		});
		let titlesSorted = [...titles];
		titlesSorted.sort();
		let correct = {};
		titlesSorted.forEach((title) => {
			let index = titlesToIndex[title];
			correct[index] = keys[index];
		});
		correct = Object.keys(correct).map(key => correct[key]);
		assert.deepEqual(correct, keys);
	});

	it('testSortTopItemsCreator', async function () {
		let response = await API.userGet(
			config.userID,
			"items/top?key=" + config.apiKey + "&format=keys&order=creator"
		);
		Helpers.assertStatusCode(response, 200);
		let keys = response.data.trim().split("\n");
		let namesCopy = { ...names };
		let sortFunction = function (a, b) {
			if (a === '' && b !== '') return 1;
			if (b === '' && a !== '') return -1;
			if (a < b) return -1;
			if (a > b) return 11;
			return 0;
		};
		let namesEntries = Object.entries(namesCopy);
		namesEntries.sort((a, b) => sortFunction(a[1], b[1]));
		assert.equal(Object.keys(namesEntries).length, keys.length);
		let correct = {};
		namesEntries.forEach((entry, i) => {
			correct[i] = itemKeys[parseInt(entry[0])];
		});
		correct = Object.keys(correct).map(key => correct[key]);
		assert.deepEqual(correct, keys);
	});
});
