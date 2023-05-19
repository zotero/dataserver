const HTTP = require("./httpHandler");
const { JSDOM } = require("jsdom");

class API3 {
	static config = require("./config");

	static apiVersion = null;

	static useAPIVersion(version) {
		this.apiVersion = version;
	}

	static async get(url, headers = [], auth = false) {
		url = this.config.apiURLPrefix + url;
		if (this.apiVersion) {
			headers.push("Zotero-API-Version: " + this.apiVersion);
		}
		if (this.schemaVersion) {
			headers.push("Zotero-Schema-Version: " + this.schemaVersion);
		}
		if (!auth && this.apiKey) {
			headers.push("Authorization: Bearer " + this.apiKey);
		}
		let response = await HTTP.get(url, headers, auth);
		if (this.config.verbose >= 2) {
			console.log("\n\n" + response.getBody() + "\n");
		}
		return response;
	}
	

	static async delete(url, data, headers = [], auth = false) {
		url = this.config.apiURLPrefix + url;
		if (this.apiVersion) {
			headers.push("Zotero-API-Version: " + this.apiVersion);
		}
		if (this.schemaVersion) {
			headers.push("Zotero-Schema-Version: " + this.schemaVersion);
		}
		if (!auth && this.config.apiKey) {
			headers.push("Authorization: Bearer " + this.config.apiKey);
		}
		let response = await HTTP.delete(url, data, headers, auth);
		return response;
	}
	
	static async post(url, data, headers = [], auth = false) {
		url = this.config.apiURLPrefix + url;
		if (this.apiVersion) {
			headers.push("Zotero-API-Version: " + this.apiVersion);
		}
		if (this.schemaVersion) {
			headers.push("Zotero-Schema-Version: " + this.schemaVersion);
		}
		if (!auth && this.config.apiKey) {
			headers.push("Authorization: Bearer " + this.config.apiKey);
		}
		let response = await HTTP.post(url, data, headers, auth);
		return response;
	}
	

	static async superGet(url, headers = {}) {
		return this.get(url, headers, {
			username: this.config.rootUsername,
			password: this.config.rootPassword
		});
	}


	static async superPost(url, data, headers = {}) {
		return this.post(url, data, headers, {
			username: this.config.rootUsername,
			password: this.config.rootPassword
		});
	}

	static async superDelete(url, data, headers = {}) {
		return this.delete(url, data, headers, {
			username: this.config.rootUsername,
			password: this.config.rootPassword
		});
	}

	static async createGroup(fields, returnFormat = 'id') {
		const xmlDoc = new JSDOM("<group></group>");
		const groupXML = xmlDoc.window.document.getElementsByTagName("group")[0];
		groupXML.setAttributeNS(null, "owner", fields.owner);
		groupXML.setAttributeNS(null, "name", fields.name || "Test Group " + Math.random().toString(36).substring(2, 15));
		groupXML.setAttributeNS(null, "type", fields.type);
		groupXML.setAttributeNS(null, "libraryEditing", fields.libraryEditing || 'members');
		groupXML.setAttributeNS(null, "libraryReading", fields.libraryReading || 'members');
		groupXML.setAttributeNS(null, "fileEditing", fields.fileEditing || 'none');
		groupXML.setAttributeNS(null, "description", "");
		groupXML.setAttributeNS(null, "url", "");
		groupXML.setAttributeNS(null, "hasImage", false);


		let response = await this.superPost(
			"groups",
			xmlDoc.window.document.getElementsByTagName("body")[0].innerHTML
		);
		if (response.status != 201) {
			console.log(response.data);
			throw new Error("Unexpected response code " + response.status);
		}

		let url = response.headers.location[0];
		let groupID = parseInt(url.match(/\d+$/)[0]);

		// Add members
		if (fields.members && fields.members.length) {
			let xml = '';
			for (let member of fields.members) {
				xml += '<user id="' + member + '" role="member"/>';
			}
			let usersResponse = await this.superPost(`groups/${groupID}/users`, xml);
			if (usersResponse.status != 200) {
				console.log(usersResponse.data);
				throw new Error("Unexpected response code " + usersResponse.status);
			}
		}

		if (returnFormat == 'response') {
			return response;
		}
		if (returnFormat == 'id') {
			return groupID;
		}
		throw new Error(`Unknown response format '${returnFormat}'`);
	}

	static async deleteGroup(groupID) {
		let response = await this.superDelete(
			`groups/${groupID}`
		);
		if (response.status != 204) {
			console.log(response.data);
			throw new Error("Unexpected response code " + response.status);
		}
	}
}

module.exports = API3;
