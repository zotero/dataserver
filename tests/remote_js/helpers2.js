const { JSDOM } = require("jsdom");
const chai = require('chai');
const assert = chai.assert;
const crypto = require('crypto');
const fs = require('fs');

class Helpers2 {
	static uniqueToken = () => {
		const id = crypto.randomBytes(16).toString("hex");
		const hash = crypto.createHash('md5').update(id).digest('hex');
		return hash;
	};

	static uniqueID = (count = 8) => {
		const chars = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Z'];
		let result = "";
		for (let i = 0; i < count; i++) {
			result += chars[crypto.randomInt(chars.length)];
		}
		return result;
	};

	static md5 = (str) => {
		return crypto.createHash('md5').update(str).digest('hex');
	};

	static md5File = (fileName) => {
		const data = fs.readFileSync(fileName);
		return crypto.createHash('md5').update(data).digest('hex');
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

	static namespaceResolver = (prefix) => {
		let ns = {
			atom: 'http://www.w3.org/2005/Atom',
			zapi: 'http://zotero.org/ns/api',
			zxfer: 'http://zotero.org/ns/transfer',
			html: 'http://www.w3.org/1999/xhtml'
		};
		return ns[prefix] || null;
	};

	static xpathEval = (document, xpath, returnHtml = false, multiple = false, element = null) => {
		const xpathData = document.evaluate(xpath, (element || document), this.namespaceResolver, 5, null);
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

	static assertRegExp(exp, val) {
		if (typeof exp == "string") {
			exp = new RegExp(exp);
		}
		if (!exp.test(val)) {
			throw new Error(`${val} does not match regular expression`);
		}
	}

	static assertXMLEqual = (one, two) => {
		const contentDom = new JSDOM(one);
		const expectedDom = new JSDOM(two);
		assert.equal(contentDom.window.document.innerHTML, expectedDom.window.document.innerHTML);
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

	static assertContentType = (response, contentType) => {
		assert.include(response?.headers['content-type'], contentType.toLowerCase());
	};


	//Assert codes
	static assert200 = (response) => {
		this.assertStatusCode(response, 200);
	};

	static assert201 = (response) => {
		this.assertStatusCode(response, 201);
	};
	
	static assert204 = (response) => {
		this.assertStatusCode(response, 204);
	};

	static assert300 = (response) => {
		this.assertStatusCode(response, 300);
	};

	static assert302 = (response) => {
		this.assertStatusCode(response, 302);
	};

	static assert400 = (response, message) => {
		this.assertStatusCode(response, 400, message);
	};

	static assert401 = (response) => {
		this.assertStatusCode(response, 401);
	};

	static assert403 = (response) => {
		this.assertStatusCode(response, 403);
	};

	static assert412 = (response) => {
		this.assertStatusCode(response, 412);
	};

	static assert428 = (response) => {
		this.assertStatusCode(response, 428);
	};

	static assert404 = (response) => {
		this.assertStatusCode(response, 404);
	};

	static assert405 = (response) => {
		this.assertStatusCode(response, 405);
	};

	static assert500 = (response) => {
		this.assertStatusCode(response, 500);
	};

	static assert400ForObject = (response, { index = 0, message = null } = {}) => {
		this.assertStatusForObject(response, 'failed', index, 400, message);
	};

	static assert200ForObject = (response, { index = 0, message = null } = {}) => {
		this.assertStatusForObject(response, 'success', index, message);
	};
	
	static assert404ForObject = (response, { index = 0, message = null } = {}) => {
		this.assertStatusForObject(response, 'failed', index, 404, message);
	};

	static assert409ForObject = (response, { index = 0, message = null } = {}) => {
		this.assertStatusForObject(response, 'failed', index, 409, message);
	};

	static assert412ForObject = (response, { index = 0, message = null } = {}) => {
		this.assertStatusForObject(response, 'failed', index, 412, message);
	};

	static assert413ForObject = (response, { index = 0, message = null } = {}) => {
		this.assertStatusForObject(response, 'failed', index, 413, message);
	};

	static assert428ForObject = (response, { index = 0, message = null } = {}) => {
		this.assertStatusForObject(response, 'failed', index, 428, message);
	};

	static assertUnchangedForObject = (response, { index = 0, message = null } = {}) => {
		this.assertStatusForObject(response, 'unchanged', index, null, message);
	};

	// Methods to help during conversion
	static assertEquals = (one, two) => {
		assert.equal(two, one);
	};

	static assertCount = (count, object) => {
		assert.lengthOf(Object.keys(object), count);
	};
}

module.exports = Helpers2;
