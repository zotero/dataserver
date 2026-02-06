// Simple HTTP client for making requests (especially to S3)
class HTTPResponse {
	constructor(status, headers, body) {
		this.status = status;
		this.headers = headers;
		this.body = body;
	}

	getStatus() {
		return this.status;
	}

	getHeader(name) {
		let lowerName = name.toLowerCase();
		for (let [key, value] of Object.entries(this.headers)) {
			if (key.toLowerCase() === lowerName) {
				return value;
			}
		}
		return null;
	}

	getBody() {
		return this.body;
	}
}

class HTTP {
	static async get(url, headers = [], auth = null) {
		let headerObj = this.parseHeaders(headers);

		if (auth) {
			let credentials = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
			headerObj['Authorization'] = `Basic ${credentials}`;
		}

		// For S3 downloads, we need longer timeouts
		let controller = new AbortController();
		let timeoutId = setTimeout(() => controller.abort(), 120000); // 120 second timeout

		try {
			let response = await fetch(url, {
				method: 'GET',
				headers: headerObj,
				signal: controller.signal
			});

			clearTimeout(timeoutId);
			let body = await response.text();
			return new HTTPResponse(response.status, Object.fromEntries(response.headers), body);
		}
		catch (error) {
			clearTimeout(timeoutId);
			throw error;
		}
	}

	static async post(url, data, headers = [], auth = null) {
		let headerObj = this.parseHeaders(headers);

		if (auth) {
			let credentials = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
			headerObj['Authorization'] = `Basic ${credentials}`;
		}

		// For S3 uploads, we need longer timeouts since files can be large
		let controller = new AbortController();
		let timeoutId = setTimeout(() => controller.abort(), 120000); // 120 second timeout

		try {
			let response = await fetch(url, {
				method: 'POST',
				headers: headerObj,
				body: data,
				signal: controller.signal
			});

			clearTimeout(timeoutId);
			let body = await response.text();
			return new HTTPResponse(response.status, Object.fromEntries(response.headers), body);
		}
		catch (error) {
			clearTimeout(timeoutId);
			throw error;
		}
	}

	static async put(url, data, headers = [], auth = null) {
		let headerObj = this.parseHeaders(headers);

		if (auth) {
			let credentials = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
			headerObj['Authorization'] = `Basic ${credentials}`;
		}

		let response = await fetch(url, {
			method: 'PUT',
			headers: headerObj,
			body: data
		});

		let body = await response.text();
		return new HTTPResponse(response.status, Object.fromEntries(response.headers), body);
	}

	static parseHeaders(headers) {
		let headerObj = {};
		for (let header of headers) {
			let colonIndex = header.indexOf(':');
			if (colonIndex > 0) {
				let name = header.substring(0, colonIndex).trim();
				let value = header.substring(colonIndex + 1).trim();
				headerObj[name] = value;
			}
		}
		return headerObj;
	}
}

export default HTTP;
