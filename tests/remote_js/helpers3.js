const { JSDOM } = require("jsdom");
const chai = require('chai');
const assert = chai.assert;
const Helpers = require('./helpers');
const crypto = require('crypto');
const fs = require('fs');

class Helpers3 extends Helpers {
	static notificationHeader = 'zotero-debug-notifications';

	static assertTotalResults(response, expectedCount) {
		const totalResults = parseInt(response.headers['total-results'][0]);
		assert.isNumber(totalResults);
		assert.equal(totalResults, expectedCount);
	}

	static assertNumResults = (response, expectedResults) => {
		const contentType = response.headers['content-type'][0];
		if (contentType == 'application/json') {
			const json = JSON.parse(response.data);
			if (Array.isArray(json)) {
				assert.equal(json.length, expectedResults);
				return;
			}
			assert.lengthOf(Object.keys(json), expectedResults);
		}
		else if (contentType.includes('text/plain')) {
			const rows = response.data.trim().split("\n");
			assert.lengthOf(rows, expectedResults);
		}
		else if (contentType == 'application/x-bibtex') {
			let matched = response.data.match(/^@[a-z]+{/gm);
			assert.lengthOf(matched, expectedResults);
		}
		else if (contentType == 'application/atom+xml') {
			const doc = new JSDOM(response.data, { url: "http://localhost/" });
			const entries = this.xpathEval(doc.window.document, "//entry", false, true);
			assert.equal(entries.length, expectedResults);
		}
		else {
			throw new Error(`Unknonw content type" ${contentType}`);
		}
	};

	static assertNoResults(response) {
		this.assertTotalResults(response, 0);
		
		const contentType = response.headers['content-type'][0];
		if (contentType == 'application/json') {
			const json = JSON.parse(response.data);
			assert.lengthOf(Object.keys(json), 0);
		}
		else if (contentType == 'application/atom+xml') {
			const xml = new JSDOM(response.data, { url: "http://localhost/" });
			const entries = xml.window.document.getElementsByTagName('entry');
			assert.equal(entries.length, 0);
		}
		else {
			throw new Error(`Unknown content type ${contentType}`);
		}
	}

	static md5 = (str) => {
		return crypto.createHash('md5').update(str).digest('hex');
	};

	static md5File = (fileName) => {
		const data = fs.readFileSync(fileName);
		return crypto.createHash('md5').update(data).digest('hex');
	};

	static getRandomUnicodeString = function () {
		const rand = crypto.randomInt(10, 100);
		return "Âéìøü 这是一个测试。 " + Helpers.uniqueID(rand);
	};

	static implodeParams = (params, exclude = []) => {
		let parts = [];
		for (const [key, value] of Object.entries(params)) {
			if (!exclude.includes(key)) {
				parts.push(key + "=" + encodeURIComponent(value));
			}
		}
		return parts.join("&");
	};

	static assertHasNotification(notification, response) {
		let header = response.headers[this.notificationHeader][0];
		assert.ok(header);

		// Header contains a Base64-encode array of encoded JSON notifications
		try {
			let notifications = JSON.parse(Buffer.from(header, 'base64')).map(n => JSON.parse(n));
			assert.deepInclude(notifications, notification);
		}
		catch (e) {
			console.log("\nHeader: " + Buffer.from(header, 'base64') + "\n");
			throw e;
		}
	}

	static assertNotificationCount(expected, response) {
		let headerArr = response.headers[this.notificationHeader] || [];
		let header = headerArr.length > 0 ? headerArr[0] : "";
		try {
			if (expected === 0) {
				assert.lengthOf(headerArr, 0);
			}
			else {
				assert.ok(header);
				this.assertCount(expected, JSON.parse(Buffer.from(header, 'base64')));
			}
		}
		catch (e) {
			console.log("\nHeader: " + Buffer.from(header, 'base64') + "\n");
			throw e;
		}
	}
}
module.exports = Helpers3;
