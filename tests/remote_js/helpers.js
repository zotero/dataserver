const { JSDOM } = require("jsdom");
const chai = require('chai');
const assert = chai.assert;
const crypto = require('crypto');

class Helpers {
	static uniqueToken = () => {
		const id = crypto.randomBytes(16).toString("hex");
		const hash = crypto.createHash('md5').update(id).digest('hex');
		return hash;
	};

	static uniqueID = () => {
		const chars = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Z'];
		let result = "";
		for (let i = 0; i < 8; i++) {
			result += chars[crypto.randomInt(chars.length)];
		}
		return result;
	};

	static namespaceResolver = (prefix) => {
		let ns = {
			atom: 'http://www.w3.org/2005/Atom',
			zapi: 'http://zotero.org/ns/api',
			zxfer: 'http://zotero.org/ns/transfer'
		};
		return ns[prefix] || null;
	};

	static xpathEval = (document, xpath, returnHtml = false, multiple = false) => {
		const xpathData = document.evaluate(xpath, document, this.namespaceResolver, 5, null);
		if (!multiple && xpathData.snapshotLength != 1) {
			throw new Error("No single xpath value fetched");
		}
		var node;
		var result = [];
		do {
			node = xpathData.iterateNext();
			if (node) {
				result.push(node);
			}
		} while (node);

		if (returnHtml) {
			return multiple ? result : result[0];
		}
	
		return multiple ? result.map(el => el.innerHTML) : result[0].innerHTML;
	};

	static assertStatusCode = (response, expectedCode, message) => {
		try {
			assert.equal(response.status, expectedCode);
			if (message) {
				assert.equal(response.data, message);
			}
		}
		catch (e) {
			console.log(response.data);
			throw e;
		}
	};

	static assertStatusForObject = (response, status, recordId, httpCode, message) => {
		let body = response;
		if (response.data) {
			body = response.data;
		}
		try {
			body = JSON.parse(body);
		}
		catch (e) { }
		assert.include(['unchanged', 'failed', 'success'], status);

		try {
			//Make sure the recordId is in the right category - unchanged, failed, success
			assert.property(body[status], recordId);
			if (httpCode) {
				assert.equal(body[status][recordId].code, httpCode);
			}
			if (message) {
				assert.equal(body[status][recordId].message, message);
			}
		}
		catch (e) {
			console.log(response.data);
			throw e;
		}
	};

	static assertNumResults = (response, expectedResults) => {
		const doc = new JSDOM(response.data, { url: "http://localhost/" });
		const entries = this.xpathEval(doc.window.document, "//entry", false, true);
		assert.equal(entries.length, expectedResults);
	};

	static assertTotalResults = (response, expectedResults) => {
		const doc = new JSDOM(response.data, { url: "http://localhost/" });
		const totalResults = this.xpathEval(doc.window.document, "//zapi:totalResults", false, true);
		assert.equal(parseInt(totalResults[0]), expectedResults);
	};
}

module.exports = Helpers;
